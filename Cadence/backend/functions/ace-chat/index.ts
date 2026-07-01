// Ace — Cadence built-in ops agent
// Supabase Edge Function: receives a message from Rodney, assembles Cadence
// context, calls Claude with tool use, and writes the reply to agent_messages.
// Realtime pushes the reply to the browser instantly.
//
// Deploy:
//   supabase functions deploy ace-chat --project-ref uimjzehrykeebocphdna
//
// Required secrets (set in Supabase dashboard → Edge Functions → ace-chat → Secrets):
//   ANTHROPIC_API_KEY   your Anthropic API key

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.3";
import { marked } from "https://esm.sh/marked@15";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function executeTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const today = new Date().toISOString().split("T")[0];

  switch (name) {
    case "list_tasks": {
      let q = supabase.from("work_items").select("*").is("deleted_at", null);
      if ("done" in input) q = q.eq("done", input.done);
      if (input.priority) q = q.eq("priority", input.priority);
      if (input.overdue) q = q.lt("due_date", today).eq("done", false);
      if (input.due_today) q = q.eq("due_date", today);
      if (input.project_id) q = q.eq("project_id", input.project_id);
      if (input.person_id) q = q.eq("person_id", input.person_id);
      if (input.source) q = q.eq("source", input.source);
      if ("inboxed" in input) q = q.eq("inboxed", input.inboxed);
      const { data } = await q
        .order("created_at", { ascending: false })
        .limit((input.limit as number) || 20);
      return data || [];
    }

    case "list_projects": {
      let q = supabase.from("projects").select("*").is("deleted_at", null);
      if (input.status) q = q.eq("status", input.status);
      if (input.health) q = q.eq("health", input.health);
      const { data } = await q.order("name");
      return data || [];
    }

    case "list_people": {
      const { data } = await supabase
        .from("people")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      return data || [];
    }

    case "get_decisions": {
      let q = supabase.from("decisions").select("*").is("deleted_at", null);
      if (input.status) q = q.eq("status", input.status);
      const { data } = await q
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    }

    case "search": {
      const q = String(input.query || "").replace(/[%_]/g, "\\$&");
      const pattern = `%${q}%`;
      const [tasks, notes, projects, people] = await Promise.all([
        supabase.from("work_items").select("id,title,type,priority,done,due_date,project_id,person_id").ilike("title", pattern).is("deleted_at", null).limit(5),
        supabase.from("notes").select("id,title,folder,updated_at").ilike("title", pattern).is("deleted_at", null).limit(5),
        supabase.from("projects").select("id,name,status,health,target_date").ilike("name", pattern).is("deleted_at", null).limit(5),
        supabase.from("people").select("id,name,role,email").ilike("name", pattern).is("deleted_at", null).limit(5),
      ]);
      return {
        tasks: tasks.data || [],
        notes: notes.data || [],
        projects: projects.data || [],
        people: people.data || [],
      };
    }

    case "create_task": {
      const { data, error } = await supabase
        .from("work_items")
        .insert({
          owner_id: userId,
          title: input.title,
          type: (input.type as string) || "task",
          priority: (input.priority as string) || "medium",
          due_date: input.due_date || null,
          project_id: input.project_id || null,
          person_id: input.person_id || null,
          notes: (input.notes as string) || "",
          source: "agent:ace",
          done: false,
          inboxed: input.inboxed ?? false,
        })
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
      const { data, error } = await supabase
        .from("work_items")
        .update(patch)
        .eq("id", input.id as string)
        .select()
        .single();
      if (error) return { error: error.message };
      return data;
    }

    case "create_note": {
      const { data, error } = await supabase
        .from("notes")
        .insert({
          owner_id: userId,
          title: input.title,
          body: input.body,
          folder: input.folder || null,
        })
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

  try {
    const { message } = await req.json();
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Empty message" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Build a Supabase client scoped to the authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Fetch conversation history (last 20 messages, oldest first)
    const { data: history } = await supabase
      .from("agent_messages")
      .select("sender_type, body, created_at")
      .eq("owner_id", user.id)
      .eq("recipient_key", "agent:ace")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    const historyMsgs = ((history || []).reverse()).map((m) => ({
      role: m.sender_type === "user" ? "user" : "assistant",
      content: m.body as string,
    }));

    // Ensure history starts with a user message (Claude requirement)
    while (historyMsgs.length > 0 && historyMsgs[0].role !== "user") {
      historyMsgs.shift();
    }

    // Save user's message now (so it appears immediately via Realtime)
    await supabase.from("agent_messages").insert({
      owner_id: user.id,
      sender_type: "user",
      recipient_type: "agent",
      recipient_key: "agent:ace",
      body: message.trim(),
      status: "unread",
    });

    // Build message list for Claude
    const messages: Anthropic.MessageParam[] = [
      ...historyMsgs as Anthropic.MessageParam[],
      { role: "user", content: message.trim() },
    ];

    // Agentic loop
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    let replyText = "";
    let iterations = 0;
    const MAX_ITERATIONS = 8;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const response = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        replyText = textBlock?.type === "text" ? textBlock.text : "Done.";
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of toolUseBlocks) {
          if (block.type !== "tool_use") continue;
          const result = await executeTool(supabase, user.id, block.name, block.input as Record<string, unknown>);
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

      // Unexpected stop reason
      replyText = "I ran into an issue. Please try again.";
      break;
    }

    if (!replyText) replyText = "Done.";

    // Convert markdown to HTML for rich display in Cadence
    const replyHtml = await marked.parse(replyText);

    // Save Ace's reply (Realtime pushes it to the browser)
    await supabase.from("agent_messages").insert({
      owner_id: user.id,
      sender_type: "agent",
      recipient_type: "user",
      recipient_key: "agent:ace",
      body: replyHtml,
      status: "processed",
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ace-chat error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
