// Typed-but-not-yet-committed weight/reps/hold values live in component state,
// so navigating away (or the app being backgrounded) before an input blurs used
// to lose them. Persist the drafts scoped to the active workout and restore them
// on return. Cleared on finish/discard. Empty drafts are pruned so we never
// resurrect a stale blank over a committed value.

export type SetDraft = { weight?: string; reps?: string; dur?: string };
export type DraftMap = Record<string, SetDraft>;

interface StoredDrafts {
  workoutId: string;
  drafts: DraftMap;
}

const KEY = 'cadence-fitness:workout-drafts';

const isEmptyDraft = (d: SetDraft | undefined): boolean =>
  !d || (['weight', 'reps', 'dur'] as const).every((k) => d[k] === undefined || d[k] === '');

/** Drop empty entries so a restore only carries genuinely pending edits. */
export function pruneDrafts(drafts: DraftMap): DraftMap {
  const out: DraftMap = {};
  for (const [id, d] of Object.entries(drafts)) {
    if (!isEmptyDraft(d)) out[id] = d;
  }
  return out;
}

export function saveDrafts(storage: Storage | undefined, workoutId: string, drafts: DraftMap): void {
  if (!storage) return;
  const pruned = pruneDrafts(drafts);
  try {
    if (Object.keys(pruned).length === 0) storage.removeItem(KEY);
    else storage.setItem(KEY, JSON.stringify({ workoutId, drafts: pruned } satisfies StoredDrafts));
  } catch {
    // Non-durable storage — drafts still work in-session, just not across a reload.
  }
}

export function clearDrafts(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function loadDrafts(storage: Storage | undefined, workoutId: string): DraftMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredDrafts;
    if (!parsed || parsed.workoutId !== workoutId || typeof parsed.drafts !== 'object' || !parsed.drafts) {
      return {};
    }
    return pruneDrafts(parsed.drafts);
  } catch {
    return {};
  }
}
