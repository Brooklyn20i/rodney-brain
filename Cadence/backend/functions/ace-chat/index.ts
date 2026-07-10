// Ace — Cadence built-in ops agent
// Supabase Edge Function: receives a message from Rodney, assembles Cadence
// context, calls Claude with tool use, and writes the reply to agent_messages.
// Realtime pushes the reply to the browser instantly.
//
// Deploy:
//   supabase functions deploy ace-chat --project-ref uimjzehrykeebocphdna
//
// Required secrets (set in Supabase dashboard → Edge Functions → ace-chat →
// Secrets). All are server-side only — no key ever reaches the browser:
//   ACE_API_KEY | ANTHROPIC_API_KEY | ANTHROPIC   Anthropic API key (first set wins)
// Optional:
//   ACE_MODEL      model id (default: claude-opus-4-8)
//   ACE_PROVIDER   provider id (default: anthropic; only anthropic is supported)
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically and used to
// scope every read/write to the caller's JWT (RLS) — no service role here.
//
// Idempotency: each request carries a client-minted request_id (UUID). A turn is
// "accepted" by inserting the user message; a partial unique index (migration
// 0041) makes a duplicate accepted turn impossible, so a retried send never
// re-runs the model or write tools. See turn.ts for the pure helpers.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.3";
import { marked } from "https://esm.sh/marked@15";
import { AceConfigError, resolveAceProviderConfig } from "./provider.ts";
import {
  describeLoopResult,
  isUniqueViolation,
  isValidRequestId,
  type LoopResult,
  PROCESSING_FAILURE_MESSAGE,
} from "./turn.ts";
import { buildNoteInsert, buildWorkItemInsert } from "./workspace.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// A single Cadence message is a chat turn, not a document. Bound it so a
// malformed or abusive payload can't drive unbounded token spend.
const MAX_MESSAGE_LENGTH = 8000;

const SYSTEM_PROMPT = `You are Ace, the built-in operations assistant for Cadence — a personal work management system used by Rodney Balech.

Your role is to help Rodney understand and manage his Cadence workspace efficiently. You have direct read/write access to all his data.

What you can do:
- Answer questions about tasks, projects, people, decisions, and notes
- Create and update work items
- Create notes
- Search across all Cadence data
- Summarise the current state of work

What you must not do:
- Send emails or external messages
- Access anything outside Cadence
- Make financial, legal, or HR commitments
- Take irreversible actions without confirming

Style:
- Be concise and direct — this is an ops tool, not a chatbot
- Use markdown: bullet points for lists, bold for key info, headers for structure
- When you take an action (create/update), confirm it in one line
- If you cannot find something, say so — never make up data`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_tasks",
    description: "List work items from Cadence. Use filters to narrow results. Always filter by done=false for open items unless the user asks about completed work.",
    input_schema: {
      type: "object",
      properties: {
        done: { type: "boolean", description: "true=completed, false=open. Omit for all." },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        overdue: { type: "boolean", description: "Only items past their due date." },
        due_today: { type: "boolean", description: "Only items due today." },
        project_id: { type: "string", description: "Filter by project UUID." },
        person_id: { type: "string", description: "Filter by person UUID." },
        source: { type: "string", description: "Filter by source, e.g. 'agent:kobe', 'for:kobe'." },
        inboxed: { type: "boolean", description: "Filter by inbox status." },
        limit: { type: "number", description: "Max results, default 20." },
      },
    },
  },
  {
    name: "list_projects",
    description: "List projects with their status, health, and next action.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "onHold", "completed"], description: "Omit for all." },
        health: { type: "string", enum: ["green", "amber", "red"] },
      },
    },
  },
  {
    name: "list_people",
    description: "List all people in Cadence with their role and email.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_decisions",
    description: "Get decisions, optionally filtered by status.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "decided", "deferred"], description: "Omit for all." },
      },
    },
  },
  {
    name: "search",
    description: "Search across tasks, notes, projects, and people by keyword. Use when you need to find something by name or content.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword." },
      },
      required: ["query"],
    },
  },
  {
    name: "create_task",
    description: "Create a new work item in Cadence.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        type: { type: "string", enum: ["task", "decision", "followUp", "waitingFor", "risk", "action"], description: "Default: task" },
        priority: { type: "string", enum: ["high", "medium", "low"], description: "Default: medium" },
        due_date: { type: "string", description: "ISO date string, e.g. 2026-07-01" },
        project_id: { type: "string" },
        person_id: { type: "string" },
        notes: { type: "string" },
        inboxed: { type: "boolean", description: "Add to inbox for triage. Default: false." },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update an existing work item. Can mark done, change priority, update notes, set due date, or reassign.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Work item UUID." },
        title: { type: "string" },
        done: { type: "boolean" },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        due_date: { type: "string" },
        notes: { type: "string" },
        project_id: { type: "string" },
        person_id: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_note",
    description: "Create a note in Cadence.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string", description: "Note content in plain text or markdown." },
        folder: { type: "string", description: "Optional folder name. Omit for general notes." },
      },
      required: ["title", "body"],
    },
  },
];

// ── Tool execution ─────────────────────────────────────────────────────────

async function resolveWorkspaceId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  requestedWorkspaceId: string | null,
): Promise<{ workspaceId: string | null; error?: string }> {
  if (requestedWorkspaceId) {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("workspace_id", requestedWorkspaceId)
      .maybeSingle();
    if (error) return { workspaceId: null, error: error.message };
    if (data?.workspace_id) return { workspaceId: data.workspace_id as string };
    return { workspaceId: null, error: "You do not have access to that workspace." };
  }

  // Fallback mirrors the Work app's deterministic workspace resolution: oldest
  // membership first. The browser normally sends workspace_id, but older cached
  // clients and tests may not.
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return { workspaceId: null, error: error.message };
  if (data?.workspace_id) return { workspaceId: data.workspace_id as string };
  return { workspaceId: null, error: "Could not resolve your Cadence workspace." };
}

async function validateWorkspaceLinks(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  input: Record<string, unknown>,
): Promise<string | null> {
  if (input.project_id) {
    if (typeof input.project_id !== "string") return "project_id must be a string.";
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("id", input.project_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) return error.message;
    if (!data?.id) return "Project is not in the active workspace.";
  }

  if (input.person_id) {
    if (typeof input.person_id !== "string") return "person_id must be a string.";
    const { data, error } = await supabase
      .from("people")
      .select("id")
      .eq("id", input.person_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) return error.message;
    if (!data?.id) return "Person is not in the active workspace.";
  }

  return null;
}

async function executeTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  workspaceId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const today = new Date().toISOString().split("T")[0];

  switch (name) {
    case "list_tasks": {
      let q = supabase.from("work_items").select("*").eq("workspace_id", workspaceId).is("deleted_at", null);
      if ("done" in input) q = q.eq("done", input.done);
      if (input.priority) q = q.eq("priority", input.priority);
      if (input.overdue) q = q.lt("due_date", today).eq("done", false);
      if (input.due_today) q = q.eq("due_date", today);
      if (input.project_id) q = q.eq("project_id", input.project_id);
      if (input.person_id) q = q.eq("person_id", input.person_id);
      if (input.source) q = q.eq("source", input.source);
      if ("inboxed" in input) q = q.eq("inboxed", input.inboxed);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit((input.limit as number) || 20);
      if (error) return { error: error.message };
      return data || [];
    }

    case "list_projects": {
      let q = supabase.from("projects").select("*").eq("workspace_id", workspaceId).is("deleted_at", null);
      if (input.status) q = q.eq("status", input.status);
      if (input.health) q = q.eq("health", input.health);
      const { data, error } = await q.order("name");
      if (error) return { error: error.message };
      return data || [];
    }

    case "list_people": {
      const { data, error } = await supabase
        .from("people")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("name");
      if (error) return { error: error.message };
      return data || [];
    }

    case "get_decisions": {
      let q = supabase.from("decisions").select("*").eq("workspace_id", workspaceId).is("deleted_at", null);
      if (input.status) q = q.eq("status", input.status);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return { error: error.message };
      return data || [];
    }

    case "search": {
      const q = String(input.query || "").replace(/[%_]/g, "\\$&");
      const pattern = `%${q}%`;
      const [tasks, notes, projects, people] = await Promise.all([
        supabase.from("work_items").select("id,title,type,priority,done,due_date,project_id,person_id").eq("workspace_id", workspaceId).ilike("title", pattern).is("deleted_at", null).limit(5),
        supabase.from("notes").select("id,title,folder,updated_at").eq("workspace_id", workspaceId).ilike("title", pattern).is("deleted_at", null).limit(5),
        supabase.from("projects").select("id,name,status,health,target_date").eq("workspace_id", workspaceId).ilike("name", pattern).is("deleted_at", null).limit(5),
        supabase.from("people").select("id,name,role,email").eq("workspace_id", workspaceId).ilike("name", pattern).is("deleted_at", null).limit(5),
      ]);
      const readError = tasks.error || notes.error || projects.error || people.error;
      if (readError) return { error: readError.message };
      return {
        tasks: tasks.data || [],
        notes: notes.data || [],
        projects: projects.data || [],
        people: people.data || [],
      };
    }

    case "create_task": {
      const linkError = await validateWorkspaceLinks(supabase, workspaceId, input);
      if (linkError) return { error: linkError };
      const { data, error } = await supabase
        .from("work_items")
        .insert(buildWorkItemInsert(userId, workspaceId, input))
        .select()
        .single();
      if (error) return { error: error.message };
      return data;
    }

    case "update_task": {
      const patch: Record<string, unknown> = {};
      if ("done" in input) patch.done = input.done;
      if (input.priority) patch.priority = input.priority;
      if ("due_date" in input) patch.due_date = input.due_date;
      if ("notes" in input) patch.notes = input.notes;
      if (input.title) patch.title = input.title;
      if ("project_id" in input) patch.project_id = input.project_id;
      if ("person_id" in input) patch.person_id = input.person_id;
      const linkError = await validateWorkspaceLinks(supabase, workspaceId, patch);
      if (linkError) return { error: linkError };
      const { data, error } = await supabase
        .from("work_items")
        .update(patch)
        .eq("workspace_id", workspaceId)
        .eq("id", input.id as string)
        .select()
        .single();
      if (error) return { error: error.message };
      return data;
    }

    case "create_note": {
      const { data, error } = await supabase
        .from("notes")
        .insert(buildNoteInsert(userId, workspaceId, input))
        .select()
        .single();
      if (error) return { error: error.message };
      return data;
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Serve ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Authenticate BEFORE resolving provider config, so an unauthenticated caller
  // can never distinguish a healthy from a misconfigured Ace: every anonymous
  // request gets 401 regardless of configuration. Cheap header check first, then
  // a real signed-in-user check.
  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Only now — with an authenticated user — resolve provider config and fail
  // closed with a useful, value-free message if Ace is misconfigured.
  let providerConfig;
  try {
    providerConfig = resolveAceProviderConfig((name) => Deno.env.get(name));
  } catch (err) {
    if (err instanceof AceConfigError) {
      console.error("ace-chat config error:", err.message);
      return json({ error: err.message }, 500);
    }
    throw err;
  }

  try {
    let payload: { message?: unknown; request_id?: unknown; workspace_id?: unknown; kind?: unknown };
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    if (!message) return json({ error: "Empty message" }, 400);
    if (message.length > MAX_MESSAGE_LENGTH) {
      return json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` }, 413);
    }
    // Idempotency key: the browser mints a UUID per distinct turn and reuses it
    // across transport retries. Required — reject anything that isn't a UUID.
    if (!isValidRequestId(payload.request_id)) {
      return json({ error: "A valid request_id (UUID) is required." }, 400);
    }
    const requestId = payload.request_id.trim();
    // Optional turn kind (e.g. "briefing") so distinct message classes are
    // queryable/stylable. Constrained to a short slug — it's metadata, not
    // content.
    const kind = typeof payload.kind === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(payload.kind.trim())
      ? payload.kind.trim()
      : null;
    const requestedWorkspaceId = typeof payload.workspace_id === "string" && payload.workspace_id.trim()
      ? payload.workspace_id.trim()
      : null;
    const workspaceResolution = await resolveWorkspaceId(supabase, user.id, requestedWorkspaceId);
    if (!workspaceResolution.workspaceId) {
      console.error("ace-chat workspace resolution error:", workspaceResolution.error);
      return json({ error: "Could not load your Cadence workspace. Please refresh and try again." }, 500);
    }
    const workspaceId = workspaceResolution.workspaceId;

    // Fetch conversation history (last 20 messages, oldest first). A read
    // failure means we can't build a correct conversation — fail closed rather
    // than reply from a truncated or empty context. This runs before acceptance
    // so history never includes the turn we're about to insert.
    const { data: history, error: historyError } = await supabase
      .from("agent_messages")
      .select("sender_type, body, created_at")
      .eq("owner_id", user.id)
      .eq("recipient_key", "agent:ace")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (historyError) {
      console.error("ace-chat history read error:", historyError.message);
      return json({ error: "Could not load your conversation. Please try again." }, 500);
    }

    const historyMsgs = ((history || []).reverse()).map((m) => ({
      role: m.sender_type === "user" ? "user" : "assistant",
      content: m.body as string,
    }));

    // Ensure history starts with a user message (Claude requirement)
    while (historyMsgs.length > 0 && historyMsgs[0].role !== "user") {
      historyMsgs.shift();
    }

    // ── Accept the turn ──────────────────────────────────────────────────────
    // Inserting the user message (stamped with request_id) is the single point
    // of acceptance. The partial unique index (migration 0041) turns a duplicate
    // submission into a unique_violation, which we treat as "already accepted"
    // and return WITHOUT running the model or any write tool. This makes retries
    // idempotent: a re-sent turn can never duplicate the chat turn or re-run
    // create_task / update_task / create_note.
    // status is "processing", never "unread": Ace turns share the owner-scoped
    // public.agent_messages table with the Kobe/Work MCP, whose unread poll does
    // not recipient-filter. Keeping Ace turns out of the 'unread' lifecycle means
    // no Kobe/Financial/Fitness poller can consume an Ace turn (defense in depth
    // alongside the MCP's recipient_key scoping). It is flipped to
    // 'processed'/'failed' once the outcome is persisted.
    const { data: acceptedRow, error: userInsertError } = await supabase
      .from("agent_messages")
      .insert({
        owner_id: user.id,
        sender_type: "user",
        recipient_type: "agent",
        recipient_key: "agent:ace",
        body: message,
        status: "processing",
        metadata: { request_id: requestId, ...(kind ? { kind } : {}) },
      })
      .select("id")
      .single();
    if (userInsertError) {
      if (isUniqueViolation(userInsertError)) {
        console.log("ace-chat duplicate request_id, not re-running:", requestId);
        return json({ ok: true, duplicate: true });
      }
      // Not accepted — safe for the client to retry with the same request_id.
      console.error("ace-chat user message insert error:", userInsertError.message);
      return json({ error: "Could not save your message. Please try again." }, 500);
    }

    // Move the accepted user turn to its terminal lifecycle status once the
    // outcome is recorded. Best-effort: if it fails the row stays "processing",
    // which still keeps it out of every unread poll — the safety property holds.
    const finalizeTurnStatus = async (status: "processed" | "failed") => {
      const { error } = await supabase
        .from("agent_messages")
        .update({ status, processed_at: new Date().toISOString() })
        .eq("id", acceptedRow!.id);
      if (error) console.error("ace-chat could not finalize turn status:", error.message);
    };

    // ── Process the accepted turn ────────────────────────────────────────────
    // From here the turn is accepted. Any failure must be recorded in the thread
    // as an explicit failure — never a silent success, and never a signal that
    // tells the browser to restore and resubmit the draft.
    try {
      const messages: Anthropic.MessageParam[] = [
        ...historyMsgs as Anthropic.MessageParam[],
        { role: "user", content: message },
      ];

      const anthropic = new Anthropic({ apiKey: providerConfig.apiKey });
      let iterations = 0;
      const MAX_ITERATIONS = 8;
      // Default to exhausted: if the loop runs out of iterations without the
      // model ending its turn, that's a failure, not a "Done."
      let loopResult: LoopResult = { kind: "exhausted" };

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const response = await anthropic.messages.create({
          model: providerConfig.model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        });

        if (response.stop_reason === "end_turn") {
          const textBlock = response.content.find((b) => b.type === "text");
          loopResult = { kind: "completed", text: textBlock?.type === "text" ? textBlock.text : "" };
          break;
        }

        if (response.stop_reason === "tool_use") {
          const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of toolUseBlocks) {
            if (block.type !== "tool_use") continue;
            const result = await executeTool(supabase, user.id, workspaceId, block.name, block.input as Record<string, unknown>);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }

          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: toolResults });
          continue;
        }

        // Unexpected stop reason — an explicit failure.
        loopResult = { kind: "error", text: "Ace received an unexpected response and stopped. Please try again." };
        break;
      }

      const outcome = describeLoopResult(loopResult);
      const replyHtml = await marked.parse(outcome.text);

      // Save Ace's reply / failure notice (Realtime pushes it to the browser).
      const { error: replyInsertError } = await supabase.from("agent_messages").insert({
        owner_id: user.id,
        sender_type: outcome.status === "ok" ? "agent" : "system",
        recipient_type: "user",
        recipient_key: "agent:ace",
        body: replyHtml,
        status: outcome.status === "ok" ? "processed" : "failed",
        metadata: { request_id: requestId, outcome: outcome.status, ...(kind ? { kind } : {}) },
      });
      if (replyInsertError) {
        // Couldn't persist the outcome — funnel into the recorded-failure path.
        console.error("ace-chat reply insert error:", replyInsertError.message);
        throw new Error("reply insert failed");
      }

      await finalizeTurnStatus(outcome.status === "ok" ? "processed" : "failed");
      return json({ ok: true, status: outcome.status });
    } catch (procErr) {
      // The turn was accepted but processing failed. Record a clear failure in
      // the thread and return 2xx so the client does NOT restore/resubmit it.
      console.error("ace-chat processing error (turn already accepted):", procErr);
      const { error: noticeError } = await supabase.from("agent_messages").insert({
        owner_id: user.id,
        sender_type: "system",
        recipient_type: "user",
        recipient_key: "agent:ace",
        body: await marked.parse(PROCESSING_FAILURE_MESSAGE),
        status: "failed",
        metadata: { request_id: requestId, outcome: "failed" },
      });
      if (noticeError) {
        // Ambiguous crash: we couldn't even record the failure. Fail closed and
        // tell the user to inspect before issuing a new distinct instruction.
        console.error("ace-chat failure-notice insert error:", noticeError.message);
        await finalizeTurnStatus("failed");
        return json(
          {
            error:
              "Ace could not complete this turn and could not record the failure. " +
              "Please open your Ace thread and check what changed before sending a new instruction.",
          },
          500,
        );
      }
      await finalizeTurnStatus("failed");
      return json({ ok: true, status: "failed" });
    }
  } catch (err) {
    console.error("ace-chat error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
