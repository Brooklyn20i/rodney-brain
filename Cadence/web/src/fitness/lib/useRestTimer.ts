// The rest-timer state machine, extracted from the Workout screen: absolute
// deadline + 1s tick + chime/vibrate + mute preference + durable persistence
// (survives remounts and PWA backgrounding). The hook's tick also re-renders
// the consumer every second, which drives the live elapsed clock.

import { useEffect, useRef, useState } from 'react';
import { createRestTimerCue } from './restTimerCue';
import { shouldFireRestCompleteCue } from './restTimerState';
import { clearRestTimer, loadRestTimer, saveRestTimer } from './restTimerPersistence';

const REST_CUE_MUTED_KEY = 'cadence-fitness:rest-cue-muted';
const localStore = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage);

export interface RestTimer {
  /** Seconds remaining; <=0 means "rest complete" is showing; null means no timer. */
  restLeft: number | null;
  restTotal: number;
  /** 0–100 progress-bar fill for the running countdown. */
  restPct: number;
  /** The set whose tick started this rest block (for the save/discard prompt). */
  restSetId: string | null;
  startRest: (seconds: number, completedSetId?: string) => void;
  stopRest: () => void;
  extendRest: (seconds?: number) => void;
  /** Unlock audio — must be called from inside a user gesture. */
  primeAudio: () => void;
  restCueMuted: boolean;
  changeRestCueMuted: (muted: boolean) => void;
}

export function useRestTimer(activeWorkoutId: string | undefined): RestTimer {
  // ── Rest-finished chime ───────────────────────────────────────────────────
  // A short Web Audio cue when rest ends. It is primed from the user's set tap
  // and uses an ambient/mixing audio session where supported, so it should play
  // over Spotify/podcasts without intentionally pausing them. iOS/Safari still
  // control foreground/background audio policy; this is the best practical web
  // behaviour, not a native-app audio override guarantee.
  const cueRef = useRef(createRestTimerCue());
  const [restCueMuted, setRestCueMuted] = useState(() => localStore()?.getItem(REST_CUE_MUTED_KEY) === '1');
  const restCueMutedRef = useRef(restCueMuted);
  const changeRestCueMuted = (muted: boolean) => {
    restCueMutedRef.current = muted;
    setRestCueMuted(muted);
    localStore()?.setItem(REST_CUE_MUTED_KEY, muted ? '1' : '0');
  };

  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const restEndsAt = useRef<number | null>(null);
  const restSetIdRef = useRef<string | null>(null);
  const chimedRef = useRef(false);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      forceTick((x) => x + 1); // drives the consumer's elapsed-time display too
      if (restEndsAt.current !== null) {
        // ceil, not round: a free-running interval sampling at half-second
        // offsets would otherwise repeat/skip displayed seconds ("4, 4, 2…").
        const left = Math.ceil((restEndsAt.current - Date.now()) / 1000);
        setRestLeft(left);
        if (shouldFireRestCompleteCue(left, chimedRef.current)) {
          chimedRef.current = true;
          if (!restCueMutedRef.current) {
            cueRef.current.play();
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([120, 60, 120]);
          }
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Restore an in-flight rest timer from its absolute deadline when the Workout
  // screen remounts (e.g. Dashboard → Workout round-trip). Scoped to the active
  // workout and expired safely if long past.
  useEffect(() => {
    if (!activeWorkoutId) return;
    const snap = loadRestTimer(localStore(), activeWorkoutId);
    if (!snap) return;
    restEndsAt.current = snap.endsAt;
    restSetIdRef.current = snap.completedSetId ?? null;
    const left = Math.round((snap.endsAt - Date.now()) / 1000);
    chimedRef.current = left <= 0; // already elapsed → don't re-chime on restore
    setRestTotal(snap.total);
    setRestLeft(left);
  }, [activeWorkoutId]);

  const startRest = (seconds: number, completedSetId?: string) => {
    if (seconds <= 0) return; // zero/disabled rest → no countdown, no cue
    const endsAt = Date.now() + seconds * 1000;
    restEndsAt.current = endsAt;
    restSetIdRef.current = completedSetId ?? null;
    chimedRef.current = false;
    setRestTotal(seconds);
    setRestLeft(seconds);
    if (activeWorkoutId) saveRestTimer(localStore(), { workoutId: activeWorkoutId, endsAt, total: seconds, completedSetId });
  };
  const stopRest = () => {
    restEndsAt.current = null;
    restSetIdRef.current = null;
    chimedRef.current = false;
    setRestLeft(null);
    clearRestTimer(localStore());
  };
  // Extending rest must PERSIST the new absolute deadline, or a remount would
  // restore the pre-extension timer and drop the added seconds.
  const extendRest = (seconds = 30) => {
    const endsAt = (restEndsAt.current ?? Date.now()) + seconds * 1000;
    restEndsAt.current = endsAt;
    const total = restTotal + seconds;
    setRestTotal(total);
    setRestLeft((l) => (l ?? 0) + seconds);
    if (activeWorkoutId)
      saveRestTimer(localStore(), { workoutId: activeWorkoutId, endsAt, total, completedSetId: restSetIdRef.current ?? undefined });
  };

  return {
    restLeft,
    restTotal,
    restPct: restTotal > 0 ? Math.max(0, Math.min(100, ((restLeft ?? 0) / restTotal) * 100)) : 0,
    restSetId: restSetIdRef.current,
    startRest,
    stopRest,
    extendRest,
    primeAudio: () => cueRef.current.prime(),
    restCueMuted,
    changeRestCueMuted,
  };
}
