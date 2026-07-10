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
