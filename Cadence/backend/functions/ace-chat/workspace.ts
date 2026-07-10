export const TASK_FILTER_SCHEMA_PROPERTIES = {
  done: { type: "boolean", description: "true=completed, false=open. Omit for all." },
  priority: { type: "string", enum: ["high", "medium", "low"] },
  overdue: { type: "boolean", description: "Only items past their due date." },
  due_today: { type: "boolean", description: "Only items due today." },
  project_id: { type: "string", description: "Filter by project UUID." },
  person_id: { type: "string", description: "Filter by person UUID." },
  source: { type: "string", description: "Filter by source, e.g. 'agent:kobe', 'for:kobe'." },
  inboxed: { type: "boolean", description: "Filter by inbox status." },
} as const;

export type TaskFilters = {
  done?: boolean;
  priority?: "high" | "medium" | "low";
  overdue?: boolean;
  due_today?: boolean;
  project_id?: string;
  person_id?: string;
  source?: string;
  inboxed?: boolean;
};

type TaskQueryBuilder<T> = {
  eq(column: string, value: unknown): T;
  is(column: string, value: unknown): T;
  lt(column: string, value: unknown): T;
};

type TaskTableClient<T extends TaskQueryBuilder<T>> = {
  from(table: "work_items"): {
    select(columns: string, options?: { count: "exact"; head: true }): T;
  };
};

const MAX_FILTER_STRING_LENGTH = 200;

function cleanFilterString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_FILTER_STRING_LENGTH);
}

export function sanitizeTaskFilters(input: Record<string, unknown>): TaskFilters {
  const filters: TaskFilters = {};
  if (typeof input.done === "boolean") filters.done = input.done;
  if (typeof input.inboxed === "boolean") filters.inboxed = input.inboxed;
  if (typeof input.overdue === "boolean") filters.overdue = input.overdue;
  if (typeof input.due_today === "boolean") filters.due_today = input.due_today;
  if (input.priority === "high" || input.priority === "medium" || input.priority === "low") {
    filters.priority = input.priority;
  }
  const projectId = cleanFilterString(input.project_id);
  if (projectId) filters.project_id = projectId;
  const personId = cleanFilterString(input.person_id);
  if (personId) filters.person_id = personId;
  const source = cleanFilterString(input.source);
  if (source) filters.source = source;
  return filters;
}

export function applyTaskFilters<T extends TaskQueryBuilder<T>>(q: T, filters: TaskFilters, today: string): T {
  let query = q;
  if ("done" in filters) query = query.eq("done", filters.done);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.overdue) query = query.lt("due_date", today).eq("done", false);
  if (filters.due_today) query = query.eq("due_date", today);
  if (filters.project_id) query = query.eq("project_id", filters.project_id);
  if (filters.person_id) query = query.eq("person_id", filters.person_id);
  if (filters.source) query = query.eq("source", filters.source);
  if ("inboxed" in filters) query = query.eq("inboxed", filters.inboxed);
  return query;
}

export function buildTaskCountQuery<T extends TaskQueryBuilder<T>>(
  supabase: TaskTableClient<T>,
  workspaceId: string,
  filters: TaskFilters,
  today: string,
): T {
  const q = supabase
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  return applyTaskFilters(q, filters, today);
}

export function buildTaskCountResult(count: number | null): { count: number } {
  return { count: count ?? 0 };
}

export function buildWorkItemInsert(
  userId: string,
  workspaceId: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return {
    owner_id: userId,
    workspace_id: workspaceId,
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
  };
}

export function buildNoteInsert(
  userId: string,
  workspaceId: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return {
    owner_id: userId,
    workspace_id: workspaceId,
    title: input.title,
    body: input.body,
    folder: input.folder || null,
  };
}
