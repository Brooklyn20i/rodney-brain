// One exercise in the active session: name + done count, target/rest/last-time
// chips, the rest-picker, its set rows, and Add set.

import { useCadenceFitness } from '../../lib/store';
import { lastSetsForExercise } from '../../lib/fitnessCalc';
import { fmtDayShort } from '../../lib/util';
import { fmtDuration, isBodyweightTracking, isTimedTracking, isWeightedTracking, setDuration } from '../../lib/tracking';
import { SetRow } from './SetRow';
import type { SetDraft } from '../../lib/setDraftFold';
import type { SetDraftField } from '../../lib/useSetDrafts';
import type { ExerciseTracking, ProgramExercise, WorkoutSet } from '../../lib/types';

const REST_PRESETS = [60, 90, 120, 180, 300];
const fmtRest = (s: number) => (s % 60 === 0 ? `${s / 60}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export function ExerciseCard({
  exerciseId,
  name,
  big,
  rows,
  slot,
  tracking,
  activeWorkoutId,
  restSeconds,
  restPickerOpen,
  onToggleRestPicker,
  onPickRest,
  addSetBusy,
  onAddSet,
  draftFor,
  onDraftChange,
  onCommit,
  onStepWeight,
  onStepReps,
  onStepDuration,
  onToggle,
}: {
  exerciseId: string;
  name: string;
  big: boolean;
  rows: WorkoutSet[];
  slot: ProgramExercise | undefined;
  tracking: ExerciseTracking;
  activeWorkoutId: string;
  /** Rest applied when a set here is ticked (slot rest or the ad-hoc default). */
  restSeconds: number;
  restPickerOpen: boolean;
  onToggleRestPicker: () => void;
  onPickRest: (seconds: number) => void;
  addSetBusy: boolean;
  onAddSet: () => void;
  draftFor: (setId: string) => SetDraft;
  onDraftChange: (setId: string, field: SetDraftField, value: string) => void;
  onCommit: (set: WorkoutSet) => void;
  onStepWeight: (set: WorkoutSet, delta: number) => void;
  onStepReps: (set: WorkoutSet, delta: number) => void;
  onStepDuration: (set: WorkoutSet, delta: number) => void;
  onToggle: (set: WorkoutSet) => void;
}) {
  const { data } = useCadenceFitness();
  const last = lastSetsForExercise(data.workout_sets, data.workouts, exerciseId, activeWorkoutId);
  const doneRows = rows.filter((s) => s.done).length;
  const single = !isWeightedTracking(tracking); // one data column (reps or hold) vs weight+reps
  // "Last time" summary, phrased for how the exercise is tracked.
  const lastSummary = last
    ? last.sets
        .map((s) =>
          isTimedTracking(tracking)
            ? fmtDuration(setDuration(s))
            : isBodyweightTracking(tracking)
              ? `${s.reps}`
              : `${Number(s.weight_kg)}×${s.reps}`
        )
        .join(', ')
    : null;
  return (
    <div className={`wo-exercise ${big ? 'gym' : ''}`}>
      <div className="wo-exercise-head">
        <span className="wo-exercise-name">{name}</span>
        {rows.length > 0 && (
          <span className={`wo-exercise-count ${doneRows === rows.length ? 'complete' : ''}`}>
            {doneRows}/{rows.length}
          </span>
        )}
      </div>
      <div className="wo-chips">
        {slot && (
          <span className="wo-chip wo-chip-target">
            {isTimedTracking(tracking)
              ? `${slot.target_sets} × ${slot.rep_min}–${slot.rep_max}s hold`
              : `${slot.target_sets} × ${slot.rep_min}–${slot.rep_max}${slot.target_rpe ? ` · RPE ${slot.target_rpe}` : ''}`}
          </span>
        )}
        <button className="wo-chip wo-chip-btn" onClick={onToggleRestPicker} aria-expanded={restPickerOpen}>
          Rest {fmtRest(restSeconds)} ▾
        </button>
        <span className="wo-chip wo-chip-last">
          {lastSummary ? `Last ${fmtDayShort(last!.date)}: ${lastSummary}` : 'First time'}
        </span>
      </div>
      {restPickerOpen && (
        <div className="wo-rest-picker">
          {REST_PRESETS.map((s) => (
            <button key={s} className={`cd-dur ${restSeconds === s ? 'active' : ''}`} onClick={() => onPickRest(s)}>
              {fmtRest(s)}
            </button>
          ))}
          <span className="wo-rest-note">{slot ? 'Saved to this exercise in your program' : 'Default for ad-hoc exercises'}</span>
        </div>
      )}
      <div className={`wo-set-labels ${big ? 'gym' : ''} ${single ? 'wo-single' : ''}`}>
        <span>Set</span>
        {isTimedTracking(tracking) ? (
          <span style={{ textAlign: 'center' }}>Hold (m:ss)</span>
        ) : isBodyweightTracking(tracking) ? (
          <span style={{ textAlign: 'center' }}>Reps</span>
        ) : (
          <>
            <span style={{ textAlign: 'center' }}>Weight (kg)</span>
            <span style={{ textAlign: 'center' }}>Reps</span>
          </>
        )}
        <span aria-hidden="true"> </span>
      </div>
      {rows.map((s) => (
        <SetRow
          key={s.id}
          set={s}
          big={big}
          single={single}
          tracking={tracking}
          ctx={`${name}, set ${s.set_number}`}
          slot={slot}
          draft={draftFor(s.id)}
          onDraftChange={(field, value) => onDraftChange(s.id, field, value)}
          onCommit={() => onCommit(s)}
          onStepWeight={(delta) => onStepWeight(s, delta)}
          onStepReps={(delta) => onStepReps(s, delta)}
          onStepDuration={(delta) => onStepDuration(s, delta)}
          onToggle={() => onToggle(s)}
        />
      ))}
      <button className="btn btn-ghost btn-sm wo-add-set" onClick={onAddSet} disabled={addSetBusy}>
        + Add set
      </button>
    </div>
  );
}
