// Pure, Deno-free helpers for the ace-chat turn lifecycle.
//
// Kept free of remote imports and Deno globals so the web unit tooling can
// exercise the idempotency contract and the loop-outcome mapping directly —
// the Edge Function itself is not runnable under the repo's current tooling.

// RFC 4122 UUID (any version/variant), case-insensitive. The browser mints
// request ids with crypto.randomUUID(); the function only accepts that shape.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidRequestId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

// Postgres unique_violation (SQLSTATE 23505). supabase-js surfaces the SQLSTATE
// on error.code, which is how a duplicate accepted Ace turn is detected.
export function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return !!error && error.code === "23505";
}

// The raw result of the bounded agentic loop.
export type LoopResult =
  | { kind: "completed"; text: string } // model ended its turn normally
  | { kind: "error"; text: string } // unexpected stop reason
  | { kind: "exhausted" }; // hit MAX_ITERATIONS without finishing

export interface ReplyOutcome {
  status: "ok" | "failed";
  text: string;
}

// Shown when the loop hits its step limit. Never phrased as success: partial
// tool effects may already be applied, so the user is told to review first.
export const TOOL_LIMIT_MESSAGE =
  "Ace stopped after reaching the tool-step limit for this turn without finishing. " +
  "Some actions may already have been applied — please review your tasks, notes, and " +
  "projects before sending a new instruction.";

// Shown when processing throws after the turn was accepted (model error, tool
// failure, etc.). Recorded in the thread so the turn never looks successful.
export const PROCESSING_FAILURE_MESSAGE =
  "Ace could not finish this turn. Any actions it had already taken remain applied — " +
  "please review your Cadence data before retrying.";

// Map the raw loop result to what gets written to the thread. Exhaustion and
// unexpected stops are explicit failures — never success wording.
export function describeLoopResult(result: LoopResult): ReplyOutcome {
  switch (result.kind) {
    case "completed":
      return { status: "ok", text: result.text.trim() || "Done." };
    case "error":
      return { status: "failed", text: result.text };
    case "exhausted":
      return { status: "failed", text: TOOL_LIMIT_MESSAGE };
  }
}
