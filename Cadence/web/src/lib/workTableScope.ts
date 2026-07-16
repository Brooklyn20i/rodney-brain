export interface WorkspaceFilterQuery<T> {
  eq(column: string, value: string): T;
}

/**
 * Applies Work's workspace filter only to tables that actually carry
 * workspace_id. agent_messages is owner-scoped through RLS and must remain
 * unfiltered; Supabase query builders are mutable, so even an aliased builder
 * can retain a workspace filter applied elsewhere.
 */
export function applyWorkTableScope<T extends WorkspaceFilterQuery<T>>(
  query: T,
  table: string,
  workspaceId?: string | null,
): T {
  if (!workspaceId || table === 'agent_messages') return query;
  return query.eq('workspace_id', workspaceId);
}
