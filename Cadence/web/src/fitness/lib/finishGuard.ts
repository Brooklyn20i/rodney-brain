// Deciding whether "Finish" should stop and ask. Finishing with 0/16 sets done
// used to silently end the workout and log nothing; now we surface completed vs
// remaining counts and require confirmation. Pure so the counting (which mirrors
// finishSession's draft-aware logic) is unit-tested independently of the dialog.

export interface FinishSetInput {
  done: boolean;
  /** Effective logged value after folding drafts: reps, or hold-seconds for a timed set. */
  value: number;
}

export interface FinishSummary {
  total: number;
  /** Rows that will be logged: they have a value, or were already ticked done. */
  completed: number;
  /** Rows that will be dropped as empty targets (no value, not done). */
  remaining: number;
  /** Non-set work already logged against the workout, e.g. cardio_sessions. */
  loggedExtras: number;
}

export function summariseFinish(rows: FinishSetInput[], loggedExtras = 0): FinishSummary {
  const total = rows.length;
  const completed = rows.filter((r) => r.value > 0 || r.done).length;
  return { total, completed, remaining: total - completed, loggedExtras };
}

/**
 * True when the user is finishing with unfinished sets OR an entirely empty
 * session (no rows at all) — both should be confirmed, never silently ended.
 */
export function finishNeedsConfirm(summary: FinishSummary): boolean {
  return (summary.total === 0 && summary.loggedExtras === 0) || summary.completed < summary.total;
}

/**
 * The confirmation message, or null when nothing needs confirming (everything
 * done). An empty session and a fully-incomplete session are both flagged.
 */
export function finishConfirmMessage(summary: FinishSummary): string | null {
  if (!finishNeedsConfirm(summary)) return null;
  const { total, completed, remaining, loggedExtras } = summary;
  if (total === 0) {
    if (loggedExtras > 0) return null;
    return "This session is empty — you haven't logged any sets. Finish and close it anyway?";
  }
  if (completed === 0) {
    return `You haven't completed any of ${total} sets. Finish anyway? Nothing will be logged for this session.`;
  }
  const setWord = remaining === 1 ? 'set' : 'sets';
  return `You've completed ${completed} of ${total} sets. Finish now? The ${remaining} unfinished ${setWord} won't be logged.`;
}
