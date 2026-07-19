import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { writeWithColumnDrift } from '../../lib/supabaseWrite';
import { createOfflineQueue, isNetworkError, type QueuedOp } from '../../lib/offlineQueue';
import { useSupabaseOwnerId, fetchSchemaTables } from '../../lib/domainStore';
import { CadenceFitnessData, TABLES, emptyData } from './types';
import { loadDemoData } from './demoData';
import { EXERCISE_CATALOG } from './exerciseCatalog';

// Fitness *data* layer only -- auth/login is handled once, at the top of the
// unified app (Cadence/web/src/App.tsx). Every table lives in the `fitness`
// Postgres schema (not `public`), so every call below is schema-qualified
// via `supabase.schema('fitness')`.

type Table = keyof CadenceFitnessData;
type Row<K extends Table> = CadenceFitnessData[K][number];

const DEMO_MODE = import.meta.env.VITE_DEMO === '1';
// E2E builds (Playwright) must never reach a real backend. OFFLINE = "no live
// Supabase": demo (seeded) OR e2e (empty, in-memory). Data still initialises
// from demo only, so e2e keeps its empty-state assertions.
const E2E_MODE = import.meta.env.VITE_E2E === '1';
const OFFLINE = DEMO_MODE || E2E_MODE;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Durable offline queue (same machinery as the Work store, own key so the
// wrong drainer can never replay the other domain's ops against the wrong
// schema). A set logged in a dead spot persists here and syncs on reconnect.
const queue = createOfflineQueue('cadence_fitness_offline_queue');
const netDown = (): boolean => typeof navigator !== 'undefined' && !navigator.onLine;

// A gym has terrible wifi. A single dropped request should not throw a scary
// red banner — retry a few times with backoff first, and only give up (surface
// an error) if it's a *permanent* failure (auth/RLS/constraint) or every retry
// failed. Transient network blips heal silently. Returns { data, error } like
// the underlying supabase call; a thrown network error is caught and retried.
const PERMANENT_CODE = /^(22|23|42|PGRST)/; // pg data/constraint/syntax + PostgREST
async function runWithRetry<T>(
  op: () => PromiseLike<{ data: T | null; error: any }>,
  attempts = 4
): Promise<{ data: T | null; error: any }> {
  let result: { data: T | null; error: any } = { data: null, error: null };
  for (let i = 0; i < attempts; i++) {
    try {
      result = await op();
    } catch (e: any) {
      result = { data: null, error: e };
    }
    if (!result.error) return result;
    const code = String(result.error?.code ?? '');
    const status = Number(result.error?.status ?? 0);
    if (PERMANENT_CODE.test(code) || status === 400 || status === 401 || status === 403) return result;
    if (i < attempts - 1) await sleep(300 * 2 ** i); // 300, 600, 1200ms
  }
  return result;
}

export interface Ctx {
  demo: boolean;
  data: CadenceFitnessData;
  insert: <K extends Table>(table: K, row: Partial<Row<K>>) => Promise<Row<K>>;
  // Insert several rows in ONE server round-trip so a multi-row create (e.g. a
  // program day's set list) lands atomically — no half-populated session if a
  // single row fails midway. Optimistic; rolls the whole batch back on error.
  insertMany: <K extends Table>(table: K, rows: Partial<Row<K>>[]) => Promise<Row<K>[]>;
  // `strict` = server-acknowledged: don't apply optimistically, and THROW on
  // failure (instead of the default swallow-and-keep-optimistic gym contract) so
  // a false success can never be presented. Used for session activation.
  update: <K extends Table>(
    table: K,
    id: string,
    patch: Partial<Row<K>>,
    opts?: { strict?: boolean }
  ) => Promise<Row<K>>;
  // Insert-or-update keyed by a unique constraint (e.g. 'owner_id,date'). Robust
  // against a stale in-memory `rows` racing realtime: the DB resolves the
  // conflict instead of throwing a duplicate-key error on a re-saved day.
  upsert: <K extends Table>(table: K, row: Partial<Row<K>>, onConflict: string) => Promise<Row<K>>;
  remove: (table: Table, id: string) => Promise<void>;
  syncError: string | null;
  clearSyncError: () => void;
  // Writes currently in flight — lets screens show a truthful "Saving… /
  // Saved ✓" indicator instead of leaving saves invisible.
  saving: boolean;
  // Offline-queued writes waiting for the connection to come back.
  pendingCount: number;
}

export const CadenceFitnessCtx = createContext<Ctx | null>(null);

export function useCadenceFitness(): Ctx {
  const c = useContext(CadenceFitnessCtx);
  if (!c) throw new Error('useCadenceFitness must be used inside <CadenceFitnessProvider>');
  return c;
}

function newId(): string {
  return crypto.randomUUID();
}

// A short, non-alarming message for the sync banner. Raw Postgres/PostgREST
// text ("PGRST204 …") means nothing to someone mid-set.
function friendlyError(error: any): string {
  const status = Number(error?.status ?? 0);
  if (status === 401 || status === 403) return 'Not signed in — your last change may not have saved. Sign in again to save it.';
  // Network failures are queued durably and never reach this banner; what's
  // left is a server-side rejection, so re-entering is the honest advice.
  return "The server rejected that change — it may not have saved. Please re-enter it.";
}

export function CadenceFitnessProvider({ children }: { children: React.ReactNode }) {
  const ownerId = useSupabaseOwnerId(OFFLINE);
  const [data, setData] = useState<CadenceFitnessData>(() => (DEMO_MODE ? loadDemoData() : emptyData()));
  const [syncError, setSyncError] = useState<string | null>(null);
  const [inflight, setInflight] = useState(0);
  const trackWrite = async <T,>(op: () => PromiseLike<T>): Promise<T> => {
    setInflight((n) => n + 1);
    try {
      return await op();
    } finally {
      setInflight((n) => Math.max(0, n - 1));
    }
  };

  // ── Per-row write serialization ───────────────────────────────────────────
  // Rapid edits to ONE row (e.g. tapping weight +2.5 three times) must land at
  // the DB in issue order so the final stored value is the newest intent. We
  // chain writes per (table,id): each waits for the previous op on that key, so
  // Postgres applies them in order (last write wins). A monotonic sequence per
  // key also means only the LATEST mutation's response may reconcile local
  // state — a slow older response can never overwrite a newer value in the UI.
  const writeChains = useRef(new Map<string, Promise<unknown>>());
  const writeSeq = useRef(new Map<string, number>());
  const seqCounter = useRef(0);
  const enqueueWrite = <T,>(key: string, op: () => Promise<T>): Promise<T> => {
    const prev = writeChains.current.get(key) ?? Promise.resolve();
    // Run `op` after the previous op SETTLES (resolve OR reject) so one failed
    // write can't deadlock the queue for that row.
    const run = prev.then(op, op) as Promise<T>;
    // The stored tail never rejects, so the chain keeps flowing.
    writeChains.current.set(
      key,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  };

  // ── Pending-mutation ledger ───────────────────────────────────────────────
  // reload() replaces whole tables with a server snapshot. Mid-workout our own
  // writes are often still in flight (gym-wifi retries can take seconds), so a
  // realtime-triggered refetch can run its query BEFORE a write commits and
  // then clobber the optimistic state — the "ticked set unticks itself" bug
  // (and freshly added sets vanishing, and the rest timer restarting when the
  // set is re-ticked). Every optimistic change is tracked here until the
  // server acknowledges it, and the ledger is overlaid onto every reload
  // result, so a refetch can never undo what the user just did.
  const pendingPatches = useRef(new Map<string, { seq: number; patch: Record<string, unknown> }>());
  const pendingInserts = useRef(new Map<string, { table: string; row: any }>());
  const pendingDeletes = useRef(new Set<string>());
  // After the server ACKs a write, keep protecting it briefly: a refetch whose
  // query ran pre-commit can still be applying. One realtime debounce window
  // (700ms) plus headroom comfortably covers it.
  const RETIRE_MS = 2500;
  const retirePatchLater = (key: string, seq: number) => {
    setTimeout(() => {
      const entry = pendingPatches.current.get(key);
      if (entry && entry.seq === seq) pendingPatches.current.delete(key);
    }, RETIRE_MS);
  };
  const overlayPending = (t: string, rows: any[]): any[] => {
    let out = rows;
    if (pendingDeletes.current.size) out = out.filter((r) => !pendingDeletes.current.has(`${t}:${r.id}`));
    out = out.map((r) => {
      const p = pendingPatches.current.get(`${t}:${r.id}`);
      return p ? { ...r, ...p.patch } : r;
    });
    const present = new Set(out.map((r: any) => r.id));
    for (const [key, ins] of pendingInserts.current) {
      if (ins.table !== t) continue;
      if (present.has(ins.row.id)) pendingInserts.current.delete(key); // visible server-side → ledger done
      else out = [...out, ins.row];
    }
    return out;
  };

  const reload = useCallback(async (table?: Table) => {
    if (OFFLINE) return;
    const tables = (table ? [table] : TABLES) as string[];
    const results = await fetchSchemaTables('fitness', tables);
    setData((prev) => {
      const next = { ...prev };
      results.forEach(({ t, error, data }) => {
        if (!error && data) (next as any)[t] = overlayPending(t, data);
      });
      return next;
    });
  }, []);

  // ── Offline queue drain ───────────────────────────────────────────────────
  // Replays queued writes (in order) once the connection is back, reconciling
  // the pending-mutation ledger per entry so a racing realtime reload can't
  // undo the replay. Runs on reconnect and on sign-in with a non-empty queue.
  const [pendingCount, setPendingCount] = useState(() => (OFFLINE ? 0 : queue.queueCount()));
  const enqueueOp = (op: QueuedOp) => {
    queue.enqueue(op);
    setPendingCount(queue.queueCount());
  };
  const drainInFlight = useRef(false);
  const drainQueue = useCallback(async () => {
    if (OFFLINE || drainInFlight.current) return;
    const entries = queue.dequeueAll();
    if (entries.length === 0) return;
    drainInFlight.current = true;
    // Entries dropped on a PERMANENT error (validation/RLS) can't be retried —
    // tell the user rather than let their queued edit evaporate silently.
    let dropped = 0;
    for (const entry of entries) {
      const { op } = entry;
      try {
        if (op.op === 'insert') {
          const rowId = String((op.row as any).id ?? '');
          const key = `${op.table}:${rowId}`;
          // Row carries a client-generated id, so replay is idempotent: a
          // duplicate insert collides on the primary key and is treated as done.
          const { error } = await supabase.schema('fitness').from(op.table).insert(op.row);
          if (!error || /duplicate key|already exists/i.test(error.message || '')) {
            queue.dropEntry(entry.qid); // ledger entry retires when a reload sees the id
          } else if (!isNetworkError(error)) {
            queue.dropEntry(entry.qid);
            dropped++;
            pendingInserts.current.delete(key);
            setData((prev) => ({ ...prev, [op.table]: (prev as any)[op.table].filter((r: any) => r.id !== rowId) }));
          }
        } else if (op.op === 'update') {
          const { error } = await supabase.schema('fitness').from(op.table).update(op.patch).eq('id', op.id);
          if (!error) queue.dropEntry(entry.qid);
          else if (!isNetworkError(error)) {
            queue.dropEntry(entry.qid);
            dropped++;
          }
        } else {
          const key = `${op.table}:${op.id}`;
          const { error } = await supabase
            .schema('fitness')
            .from(op.table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', op.id);
          if (!error) {
            queue.dropEntry(entry.qid);
            setTimeout(() => pendingDeletes.current.delete(key), RETIRE_MS);
          } else if (!isNetworkError(error)) {
            queue.dropEntry(entry.qid);
            dropped++;
            pendingDeletes.current.delete(key); // server still has it — let reload resurrect honestly
          }
        }
      } catch {
        // Still offline — leave the entry queued for the next drain.
      }
    }
    if (dropped > 0) {
      setSyncError(
        `${dropped} offline ${dropped === 1 ? 'change' : 'changes'} couldn't be saved and ${dropped === 1 ? 'was' : 'were'} discarded — please re-enter.`
      );
    }
    const remaining = queue.queueCount();
    setPendingCount(remaining);
    drainInFlight.current = false;
    // Reload so local state reconciles with the replayed server truth.
    if (remaining === 0) await reload();
  }, [reload]);
  // Keep a ref so the (once-registered) online handler always calls the latest drain.
  const drainRef = useRef(drainQueue);
  useEffect(() => {
    drainRef.current = drainQueue;
  }, [drainQueue]);
  // Gate draining on a signed-in session: replaying before auth restores would
  // hit RLS 401s, which are "permanent" to the classifier and would DROP the
  // queued work instead of retrying it.
  useEffect(() => {
    if (OFFLINE || !ownerId) return;
    if (queue.queueCount() > 0 && !netDown()) void drainRef.current();
    const onOnline = () => void drainRef.current();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [ownerId]);

  useEffect(() => {
    if (OFFLINE || !ownerId) return;
    reload();
    // Coalesce realtime echoes: our own writes each bounce back a change event,
    // and rapid set-logging fires many in a burst. Debounce per table so we
    // refetch once the dust settles instead of thrashing state mid-workout
    // (which was re-creating row objects and re-rendering the set list on every
    // tap — the "not super smooth" feel).
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const scheduleReload = (t: Table) => {
      const existing = timers.get(t as string);
      if (existing) clearTimeout(existing);
      timers.set(t as string, setTimeout(() => reload(t), 700));
    };
    const ch = supabase.channel('cadence-fitness-rt');
    TABLES.forEach((t) =>
      ch.on('postgres_changes', { event: '*', schema: 'fitness', table: t as string }, () => scheduleReload(t))
    );
    ch.subscribe();
    return () => {
      timers.forEach((h) => clearTimeout(h));
      supabase.removeChannel(ch);
    };
  }, [ownerId, reload]);

  // One-time seed of the common-movement library on first sign-in (see
  // CadenceFitness's original comment) -- unchanged, just schema-qualified.
  useEffect(() => {
    if (OFFLINE || !ownerId) return;
    const FLAG = 'cadence-fitness:seeded-exercises';
    if (localStorage.getItem(FLAG)) return;
    let cancelled = false;
    (async () => {
      const { data: existing, error } = await supabase.schema('fitness').from('exercises').select('id').limit(1);
      if (cancelled || error) return;
      if (existing && existing.length > 0) {
        localStorage.setItem(FLAG, '1');
        return;
      }
      const now = new Date().toISOString();
      const rows = EXERCISE_CATALOG.map((e) => ({
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: e.name,
        muscle_group: e.muscle_group,
        secondary_muscles: '',
        equipment: e.equipment,
        tracking: e.tracking ?? 'strength_weighted',
        notes: '',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }));
      let { error: insErr } = await supabase.schema('fitness').from('exercises').insert(rows);
      // Tolerate a database that predates the tracking migration: if the
      // `tracking` column doesn't exist yet, seed without it (defaults apply
      // once the migration lands) rather than leaving a new user with no
      // exercise library.
      if (insErr && /tracking/i.test(insErr.message || '')) {
        const legacyRows = rows.map(({ tracking: _tracking, ...rest }) => rest);
        ({ error: insErr } = await supabase.schema('fitness').from('exercises').insert(legacyRows));
      }
      if (!cancelled && !insErr) {
        localStorage.setItem(FLAG, '1');
        reload('exercises');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId, reload]);

  const insert = async <K extends Table>(table: K, row: Partial<Row<K>>): Promise<Row<K>> => {
    const now = new Date().toISOString();
    const stamped: any = { id: newId(), created_at: now, updated_at: now, deleted_at: null, ...row };

    if (OFFLINE) {
      const withOwner = { owner_id: 'demo-owner', ...stamped };
      setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], withOwner] }));
      return withOwner as Row<K>;
    }

    const ownedRow = ownerId ? { owner_id: ownerId, ...stamped } : stamped;
    const ledgerKey = `${table as string}:${ownedRow.id}`;
    // Show the row immediately (optimistic) so the UI never stalls on a slow
    // gym connection; reconcile with the server copy once the write lands. The
    // ledger entry keeps a concurrent reload from dropping the row before the
    // server has it.
    pendingInserts.current.set(ledgerKey, { table: table as string, row: ownedRow });
    setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], ownedRow] }));
    // Fully offline → skip the doomed network attempt and queue durably. The
    // client-generated id makes the eventual replay idempotent, and the ledger
    // entry keeps any reload from dropping the row until a fetch contains it.
    if (netDown()) {
      enqueueOp({ op: 'insert', table: table as string, row: ownedRow });
      return ownedRow as Row<K>;
    }
    // Column-drift tolerant (shared helper): strip + retry a column the DB
    // doesn't have yet, composed with the gym-wifi network retry.
    const { data: d, error } = await trackWrite(() =>
      writeWithColumnDrift(ownedRow, (p) =>
        runWithRetry(() =>
          supabase.schema('fitness').from(table as string).insert(p).select().single()
        )
      )
    );
    if (error) {
      if (isNetworkError(error)) {
        // Connection dropped mid-save and every retry failed — queue for
        // replay instead of rolling back; the row stays visible and syncs
        // when the network returns.
        enqueueOp({ op: 'insert', table: table as string, row: ownedRow });
        return ownedRow as Row<K>;
      }
      pendingInserts.current.delete(ledgerKey); // rolled back — nothing to protect
      setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== ownedRow.id) }));
      setSyncError(friendlyError(error));
      throw error;
    }
    if (d) {
      // Keep protecting with the SERVER copy until a reload actually contains
      // the row (overlayPending retires the entry when it sees the id).
      pendingInserts.current.set(ledgerKey, { table: table as string, row: d });
      setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === ownedRow.id ? d : r)) }));
    }
    return (d ?? ownedRow) as Row<K>;
  };

  const insertMany = async <K extends Table>(table: K, rows: Partial<Row<K>>[]): Promise<Row<K>[]> => {
    if (rows.length === 0) return [];
    const now = new Date().toISOString();
    const stamped: any[] = rows.map((row) => ({ id: newId(), created_at: now, updated_at: now, deleted_at: null, ...row }));

    if (OFFLINE) {
      const withOwner = stamped.map((r) => ({ owner_id: 'demo-owner', ...r }));
      setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], ...withOwner] }));
      return withOwner as Row<K>[];
    }

    const owned = stamped.map((r) => (ownerId ? { owner_id: ownerId, ...r } : r));
    const ids = new Set(owned.map((r) => r.id));
    // Optimistic: show every row immediately so the UI never stalls; reconcile
    // (or roll the WHOLE batch back) once the single insert lands. Ledger
    // entries keep a concurrent reload from dropping the batch mid-flight.
    for (const r of owned) pendingInserts.current.set(`${table as string}:${r.id}`, { table: table as string, row: r });
    setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], ...owned] }));
    // Fully offline → queue each row (client ids make replay idempotent).
    if (netDown()) {
      for (const r of owned) enqueueOp({ op: 'insert', table: table as string, row: r });
      return owned as Row<K>[];
    }
    const { data: d, error } = await trackWrite(() =>
      runWithRetry(() => supabase.schema('fitness').from(table as string).insert(owned).select())
    );
    if (error) {
      if (isNetworkError(error)) {
        for (const r of owned) enqueueOp({ op: 'insert', table: table as string, row: r });
        return owned as Row<K>[];
      }
      for (const r of owned) pendingInserts.current.delete(`${table as string}:${r.id}`);
      setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => !ids.has(r.id)) }));
      setSyncError(friendlyError(error));
      throw error;
    }
    if (Array.isArray(d) && d.length) {
      const byId = new Map((d as any[]).map((row) => [row.id, row]));
      for (const row of d as any[]) pendingInserts.current.set(`${table as string}:${row.id}`, { table: table as string, row });
      setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => byId.get(r.id) ?? r) }));
      return d as Row<K>[];
    }
    return owned as Row<K>[];
  };

  const update = async <K extends Table>(
    table: K,
    id: string,
    patch: Partial<Row<K>>,
    opts?: { strict?: boolean }
  ): Promise<Row<K>> => {
    // STRICT mode: server-acknowledged write. The optimistic change is NOT
    // applied locally until the server confirms, and a failure THROWS instead of
    // being swallowed. Used where a false-success would be unsafe — e.g. flipping
    // a session from `initializing` to `in_progress`: we must not present an
    // active session locally while the server row is still staged. Normal
    // (non-strict) updates keep the optimistic-first, never-throw gym contract.
    const strict = opts?.strict === true;
    if (!strict) {
      setData((prev) => ({
        ...prev,
        [table]: (prev as any)[table].map((r: any) => (r.id === id ? { ...r, ...patch } : r)),
      }));
    }

    if (OFFLINE) {
      // No server to acknowledge; apply in-memory (strict didn't optimistic-apply).
      if (strict) {
        setData((prev) => ({
          ...prev,
          [table]: (prev as any)[table].map((r: any) => (r.id === id ? { ...r, ...patch } : r)),
        }));
      }
      const found = (data as any)[table].find((r: any) => r.id === id);
      return { ...found, ...patch } as Row<K>;
    }

    const optimistic = { ...(data as any)[table].find((r: any) => r.id === id), ...patch };
    // Claim the newest sequence for this row BEFORE the (serialized) write runs,
    // so a later reconcile check knows whether this response is still current.
    const key = `${table as string}:${id}`;
    const seq = (seqCounter.current += 1);
    writeSeq.current.set(key, seq);
    // Ledger: protect the optimistic change from a concurrent reload snapshot
    // (patches for one row accumulate; the newest write owns the entry).
    // Strict writes are NOT optimistic, so they only enter the ledger on ack —
    // otherwise a reload could surface the change before the server confirmed.
    if (!strict) {
      const prevEntry = pendingPatches.current.get(key);
      pendingPatches.current.set(key, { seq, patch: { ...prevEntry?.patch, ...(patch as Record<string, unknown>) } });
    }
    // Fully offline (non-strict) → skip the doomed network attempt and queue
    // durably; the optimistic value stays showing and syncs on reconnect.
    // (While offline realtime is down too, so no reload can clobber it.)
    if (!strict && netDown()) {
      const offlineEntry = pendingPatches.current.get(key);
      if (offlineEntry && offlineEntry.seq === seq) pendingPatches.current.delete(key);
      enqueueOp({ op: 'update', table: table as string, id, patch: patch as Record<string, unknown> });
      return optimistic as Row<K>;
    }
    const { data: d, error } = await enqueueWrite(key, () =>
      trackWrite(() =>
        writeWithColumnDrift(patch as Record<string, unknown>, (p) =>
          runWithRetry(() =>
            supabase.schema('fitness').from(table as string).update(p).eq('id', id).select().single()
          )
        )
      )
    );
    if (error) {
      // Terminal failure → stop protecting this change; the server's truth wins
      // on the next reload (for a queued network failure, the replay will
      // rewrite it anyway).
      const entry = pendingPatches.current.get(key);
      if (entry && entry.seq === seq) pendingPatches.current.delete(key);
      if (!strict && isNetworkError(error)) {
        // Every retry failed on a dead connection — queue for replay. Not an
        // error from the user's point of view: the change is safe on-device.
        enqueueOp({ op: 'update', table: table as string, id, patch: patch as Record<string, unknown> });
        return optimistic as Row<K>;
      }
      setSyncError(friendlyError(error));
      // STRICT: propagate so the caller can preserve its invariant (roll back the
      // staged row). Local state was never optimistically changed, so no false
      // "success" is left behind.
      if (strict) throw error;
      // Non-strict: local state already reflects the change (optimistic, above).
      // DON'T throw — an un-awaited reject during a workout would fire the global
      // "unhandled rejection" banner on every flaky tap. The change stays local
      // and realtime reconciles later.
      return optimistic as Row<K>;
    }
    // Acknowledged: keep the ledger entry briefly (a refetch whose query ran
    // pre-commit may still be applying), then retire it.
    if (strict) {
      const prevEntry = pendingPatches.current.get(key);
      pendingPatches.current.set(key, { seq, patch: { ...prevEntry?.patch, ...(patch as Record<string, unknown>) } });
    }
    retirePatchLater(key, seq);
    // Only reconcile from the response if no newer write for this row has been
    // issued — otherwise a slow older response would clobber the newer value.
    // (In strict mode this is also where the change is FIRST applied locally.)
    if (writeSeq.current.get(key) === seq && (d || strict)) {
      setData((prev) => ({
        ...prev,
        [table]: (prev as any)[table].map((r: any) => (r.id === id ? (d ?? { ...r, ...patch }) : r)),
      }));
    }
    return (d ?? optimistic) as Row<K>;
  };

  const upsert = async <K extends Table>(
    table: K,
    row: Partial<Row<K>>,
    onConflict: string
  ): Promise<Row<K>> => {
    const now = new Date().toISOString();
    const keyCols = onConflict.split(',').map((c) => c.trim());
    // Deliberately omit id/created_at so the DB keeps the existing row's identity
    // on conflict (and generates them via defaults on a fresh insert). owner_id
    // is part of the conflict key; include it when known, else let the column's
    // auth.uid() default fill it rather than writing a null.
    // deleted_at: null so a re-save REVIVES a soft-deleted row. These tables
    // (body_metrics/recovery_metrics) keep a full unique(owner_id,date)
    // constraint for ON CONFLICT, so re-logging a deleted day updates the
    // tombstone in place — without this it would silently stay deleted.
    const ownedRow: any = { ...(ownerId ? { owner_id: ownerId } : {}), updated_at: now, deleted_at: null, ...row };
    const matchesKey = (r: any) => keyCols.every((c) => r[c] === ownedRow[c]);

    if (OFFLINE) {
      setData((prev) => {
        const list = (prev as any)[table] as any[];
        const idx = list.findIndex(matchesKey);
        if (idx >= 0) return { ...prev, [table]: list.map((r, i) => (i === idx ? { ...r, ...ownedRow } : r)) };
        return { ...prev, [table]: [...list, { id: newId(), owner_id: 'demo-owner', created_at: now, deleted_at: null, ...ownedRow }] };
      });
      return ((data as any)[table].find(matchesKey) ?? ownedRow) as Row<K>;
    }

    // Optimistic: if we already hold the row locally, reflect the change now.
    setData((prev) => {
      const list = (prev as any)[table] as any[];
      const idx = list.findIndex(matchesKey);
      if (idx < 0) return prev;
      return { ...prev, [table]: list.map((r, i) => (i === idx ? { ...r, ...ownedRow } : r)) };
    });

    const { data: d, error } = await trackWrite(() =>
      writeWithColumnDrift(ownedRow, (p) =>
        runWithRetry(() =>
          supabase.schema('fitness').from(table as string).upsert(p, { onConflict }).select().single()
        )
      )
    );
    if (error) {
      setSyncError(friendlyError(error));
      // Don't throw — mirror update()'s design so a flaky save can't spam the
      // unhandled-rejection banner; the change is local and realtime reconciles.
      return ownedRow as Row<K>;
    }
    if (d) {
      // Replace by id or conflict key so we never leave a duplicate behind.
      setData((prev) => {
        const list = (prev as any)[table] as any[];
        const filtered = list.filter((r) => r.id !== (d as any).id && !matchesKey(r));
        return { ...prev, [table]: [...filtered, d] };
      });
    }
    return (d ?? ownedRow) as Row<K>;
  };

  const remove = async (table: Table, id: string): Promise<void> => {
    const ledgerKey = `${table as string}:${id}`;
    // Ledger: keep a concurrent reload from resurrecting the row while the
    // soft-delete is still in flight. Also drop any pending insert/patch for it.
    pendingDeletes.current.add(ledgerKey);
    pendingInserts.current.delete(ledgerKey);
    pendingPatches.current.delete(ledgerKey);
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== id) }));
    if (OFFLINE) return;
    // Fully offline → queue the soft-delete; the tombstone keeps any reload
    // from resurrecting the row until the replay lands.
    if (netDown()) {
      enqueueOp({ op: 'remove', table: table as string, id });
      return;
    }
    const { error } = await trackWrite(() =>
      runWithRetry(() =>
        supabase
          .schema('fitness')
          .from(table as string)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .then((r) => ({ data: null, error: r.error }))
      )
    );
    // Same reasoning as update(): the row is already gone locally; a failed
    // delete is noted but never thrown, so it can't spam the rejection banner.
    if (error) {
      if (isNetworkError(error)) {
        // Dead connection — queue for replay; the tombstone stays so the row
        // doesn't flicker back meanwhile.
        enqueueOp({ op: 'remove', table: table as string, id });
        return;
      }
      pendingDeletes.current.delete(ledgerKey); // server still has it — let reload resurrect honestly
      setSyncError(friendlyError(error));
      return;
    }
    // Committed: fetches now exclude the row; keep the tombstone through one
    // more refetch window, then retire it.
    setTimeout(() => pendingDeletes.current.delete(ledgerKey), RETIRE_MS);
  };

  const clearSyncError = useCallback(() => setSyncError(null), []);

  return (
    <CadenceFitnessCtx.Provider
      value={{
        demo: OFFLINE,
        data,
        insert,
        insertMany,
        update,
        upsert,
        remove,
        syncError,
        clearSyncError,
        saving: inflight > 0,
        pendingCount,
      }}
    >
      {children}
    </CadenceFitnessCtx.Provider>
  );
}
