// Shared write-safety helpers used by all three domain stores (Work, Financial,
// Fitness) so the tricky bits live in ONE place instead of drifting across three
// near-identical copies.
//
// The key behaviour is column-drift tolerance: if the app writes a column the
// database doesn't have yet (a deploy landed before its migration), we strip
// that column and retry rather than hard-failing the whole save. Work had this;
// Financial and Fitness didn't — so the same migration-lag would silently save
// in one domain and break in the others. This module unifies it.

// Pull the offending column name out of a Postgres / PostgREST error and return
// a copy of the payload without it, so the caller can retry. Returns null if the
// error isn't a missing-column error or the column isn't in the payload.
export function dropMissingColumn(payload: Record<string, unknown>, error: unknown): Record<string, unknown> | null {
  const e = error as { message?: string; details?: string } | null;
  const msg = String(e?.message || error || '') + ' ' + String(e?.details || '');
  const m =
    msg.match(/could not find the '([^']+)' column/i) || // PostgREST PGRST204
    msg.match(/column "([^"]+)"/i) ||                     // Postgres 42703 (quoted)
    msg.match(/column ([a-z0-9_]+) does not exist/i);     // Postgres 42703 (unquoted)
  const col = m?.[1];
  if (!col || !(col in payload)) return null;
  const { [col]: _omit, ...rest } = payload;
  return rest;
}

// Run a PostgREST write, retrying up to `maxTries` by stripping any column the
// DB doesn't recognise (migration lag). `run` receives the current payload and
// performs the actual insert/update; on a non-missing-column error it stops and
// returns that error. Returns the final data/error plus the payload actually
// written (columns may have been dropped).
export async function writeWithColumnDrift<T>(
  payload: Record<string, unknown>,
  // PromiseLike so a supabase query builder (a thenable, not a real Promise)
  // can be returned directly without an extra await/wrap at the call site.
  run: (p: Record<string, unknown>) => PromiseLike<{ data: T | null; error: unknown }>,
  maxTries = 8,
): Promise<{ data: T | null; error: unknown; payload: Record<string, unknown> }> {
  let p = payload;
  for (let i = 0; i < maxTries; i++) {
    const { data, error } = await run(p);
    if (!error) return { data, error: null, payload: p };
    const stripped = dropMissingColumn(p, error);
    if (!stripped) return { data: null, error, payload: p };
    p = stripped;
  }
  return { data: null, error: new Error('write failed after stripping unknown columns'), payload: p };
}
