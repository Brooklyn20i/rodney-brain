// Per-set input state for an active session, extracted from the Workout
// screen. Two layers sit over the store row:
//   1. drafts — typed-but-uncommitted text, persisted so navigating away
//      mid-set doesn't lose it;
//   2. a pending-step overlay — the latest intended numeric value per field,
//      so a burst of rapid ± taps accumulates instead of re-reading the same
//      stale render value (105 → 107.5 instead of 112.5).
// The live* readers give the single precedence rule: overlay → draft → stored.

import { useEffect, useRef, useState } from 'react';
import { parseDuration, setDuration } from './tracking';
import { clearDrafts, loadDrafts, saveDrafts } from './draftPersistence';
import { hasDraftValue, type SetDraft, type SetDrafts } from './setDraftFold';
import type { WorkoutSet } from './types';

const localStore = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage);

export type SetDraftField = 'weight' | 'reps' | 'dur';

export function useSetDrafts(activeWorkoutId: string | undefined, sessionSets: WorkoutSet[]) {
  const [drafts, setDrafts] = useState<SetDrafts>({});
  const pendingStepRef = useRef<Map<string, number>>(new Map());
  const stepKey = (id: string, field: SetDraftField) => `${id}:${field}`;

  // Drop pending stepper overlays once the store reflects them (or an external
  // realtime change lands), so the map never masks the real committed value.
  useEffect(() => {
    const map = pendingStepRef.current;
    if (map.size === 0) return;
    for (const s of sessionSets) {
      if (map.get(stepKey(s.id, 'weight')) === (Number(s.weight_kg) || 0)) map.delete(stepKey(s.id, 'weight'));
      if (map.get(stepKey(s.id, 'reps')) === (s.reps || 0)) map.delete(stepKey(s.id, 'reps'));
      if (map.get(stepKey(s.id, 'dur')) === setDuration(s)) map.delete(stepKey(s.id, 'dur'));
    }
  }, [sessionSets]);

  // Durably persist typed-but-uncommitted drafts, scoped to the active workout,
  // so navigating away (or backgrounding) before an input blurs doesn't lose
  // them. Restored on return; cleared on finish/discard.
  useEffect(() => {
    if (!activeWorkoutId) return;
    const restored = loadDrafts(localStore(), activeWorkoutId);
    if (Object.keys(restored).length) setDrafts((p) => ({ ...restored, ...p }));
  }, [activeWorkoutId]);
  useEffect(() => {
    if (!activeWorkoutId) return;
    saveDrafts(localStore(), activeWorkoutId, drafts);
  }, [drafts, activeWorkoutId]);

  const setDraftField = (setId: string, field: SetDraftField, value: string | undefined) => {
    setDrafts((p) => ({ ...p, [setId]: { ...p[setId], [field]: value } }));
  };
  const clearSetDraft = (setId: string) => {
    setDrafts((prev) => {
      if (!prev[setId]) return prev;
      const next = { ...prev };
      delete next[setId];
      return next;
    });
  };
  // Finish/discard: wipe both layers and the durable copy.
  const resetAll = () => {
    pendingStepRef.current.clear();
    clearDrafts(localStore());
    setDrafts({});
  };
  const setHasDraft = (setId: string) => hasDraftValue(drafts[setId]);
  const draftFor = (setId: string): SetDraft => drafts[setId] || {};

  // Record a stepper tap's intended value so consecutive taps stack before the
  // store round-trip lands.
  const notePendingStep = (setId: string, field: SetDraftField, value: number) => {
    pendingStepRef.current.set(stepKey(setId, field), value);
  };

  const liveWeight = (s: WorkoutSet): number => {
    const k = stepKey(s.id, 'weight');
    if (pendingStepRef.current.has(k)) return pendingStepRef.current.get(k)!;
    const d = drafts[s.id]?.weight;
    return d !== undefined ? Number(d) || 0 : Number(s.weight_kg) || 0;
  };
  const liveReps = (s: WorkoutSet): number => {
    const k = stepKey(s.id, 'reps');
    if (pendingStepRef.current.has(k)) return pendingStepRef.current.get(k)!;
    const d = drafts[s.id]?.reps;
    return d !== undefined ? Math.max(0, Math.round(Number(d) || 0)) : s.reps || 0;
  };
  const liveDuration = (s: WorkoutSet): number => {
    const k = stepKey(s.id, 'dur');
    if (pendingStepRef.current.has(k)) return pendingStepRef.current.get(k)!;
    const d = drafts[s.id]?.dur;
    return d !== undefined ? parseDuration(d) : setDuration(s);
  };

  return {
    drafts,
    draftFor,
    setDraftField,
    clearSetDraft,
    resetAll,
    setHasDraft,
    notePendingStep,
    liveWeight,
    liveReps,
    liveDuration,
  };
}
