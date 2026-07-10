export function shouldFireRestCompleteCue(leftSeconds: number, alreadyChimed: boolean) {
  return leftSeconds <= 0 && !alreadyChimed;
}

export interface RestStartPlan {
  /** Whether to start a rest countdown at all. */
  start: boolean;
  /** Whole seconds to run; 0 when rest is disabled for this set. */
  seconds: number;
}

/**
 * How much rest to run when a set is completed. A configured rest of 0 (or a
 * missing/invalid value) means NO timer — no countdown, no "GO", no chime or
 * vibration. Used to decide before any network write so the timer anchors to
 * the tap, not to a slow save.
 */
export function planRestOnComplete(slotRest: number | null | undefined, restDefault: number): RestStartPlan {
  const raw = slotRest ?? restDefault;
  const seconds = Number.isFinite(raw as number) && (raw as number) > 0 ? Math.floor(raw as number) : 0;
  return { start: seconds > 0, seconds };
}
