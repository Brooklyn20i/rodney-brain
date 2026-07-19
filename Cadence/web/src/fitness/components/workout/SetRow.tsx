// One set row: the editable field(s) for its tracking mode, ± steppers in Gym
// Focus, and the done check. Contextual accessible names ("Bench, set 1, …")
// keep the repeated controls distinguishable for screen readers and tests.

import { fmtDuration, isBodyweightTracking, isTimedTracking, setDuration } from '../../lib/tracking';
import type { SetDraft } from '../../lib/setDraftFold';
import type { SetDraftField } from '../../lib/useSetDrafts';
import type { ExerciseTracking, ProgramExercise, WorkoutSet } from '../../lib/types';

export function SetRow({
  set: s,
  big,
  single,
  tracking,
  ctx,
  slot,
  draft: d,
  onDraftChange,
  onCommit,
  onStepWeight,
  onStepReps,
  onStepDuration,
  onToggle,
}: {
  set: WorkoutSet;
  big: boolean;
  single: boolean;
  tracking: ExerciseTracking;
  /** Accessible-name prefix, e.g. "Barbell Bench Press, set 1". */
  ctx: string;
  slot: ProgramExercise | undefined;
  draft: SetDraft;
  onDraftChange: (field: SetDraftField, value: string) => void;
  onCommit: () => void;
  onStepWeight: (delta: number) => void;
  onStepReps: (delta: number) => void;
  onStepDuration: (delta: number) => void;
  onToggle: () => void;
}) {
  const weightField = (
    <input
      type="number"
      inputMode="decimal"
      step="0.5"
      aria-label={`${ctx}, weight in kilograms`}
      value={d.weight ?? (Number(s.weight_kg) || '')}
      placeholder="0"
      onChange={(e) => onDraftChange('weight', e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
  const repsField = (
    <input
      type="number"
      inputMode="numeric"
      aria-label={`${ctx}, reps`}
      value={d.reps ?? (s.reps || '')}
      placeholder={slot && !isTimedTracking(tracking) ? `${slot.rep_min}–${slot.rep_max}` : '—'}
      onChange={(e) => onDraftChange('reps', e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
  const durField = (
    <input
      type="text"
      inputMode="numeric"
      aria-label={`${ctx}, hold time (minutes and seconds)`}
      value={d.dur ?? (setDuration(s) ? fmtDuration(setDuration(s)) : '')}
      placeholder={slot ? `${slot.rep_min}–${slot.rep_max}s` : 'm:ss'}
      onChange={(e) => onDraftChange('dur', e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
  // The one or two editable fields for this set, per its tracking mode.
  const fields = isTimedTracking(tracking) ? (
    big ? (
      <div className="wo-step-group">
        <span className="wo-step-label" aria-hidden="true">Hold</span>
        <button className="wo-step" aria-label={`${ctx}, 15 seconds fewer`} onClick={() => onStepDuration(-15)}>
          −
        </button>
        {durField}
        <button className="wo-step" aria-label={`${ctx}, 15 seconds more`} onClick={() => onStepDuration(15)}>
          +
        </button>
      </div>
    ) : (
      durField
    )
  ) : isBodyweightTracking(tracking) ? (
    big ? (
      <div className="wo-step-group">
        <span className="wo-step-label" aria-hidden="true">Reps</span>
        <button className="wo-step" aria-label={`${ctx}, one rep fewer`} onClick={() => onStepReps(-1)}>
          −
        </button>
        {repsField}
        <button className="wo-step" aria-label={`${ctx}, one rep more`} onClick={() => onStepReps(1)}>
          +
        </button>
      </div>
    ) : (
      repsField
    )
  ) : big ? (
    <>
      <div className="wo-step-group">
        <span className="wo-step-label" aria-hidden="true">Kg</span>
        <button className="wo-step" aria-label={`${ctx}, weight down 2.5 kilograms`} onClick={() => onStepWeight(-2.5)}>
          −
        </button>
        {weightField}
        <button className="wo-step" aria-label={`${ctx}, weight up 2.5 kilograms`} onClick={() => onStepWeight(2.5)}>
          +
        </button>
      </div>
      <div className="wo-step-group">
        <span className="wo-step-label" aria-hidden="true">Reps</span>
        <button className="wo-step" aria-label={`${ctx}, one rep fewer`} onClick={() => onStepReps(-1)}>
          −
        </button>
        {repsField}
        <button className="wo-step" aria-label={`${ctx}, one rep more`} onClick={() => onStepReps(1)}>
          +
        </button>
      </div>
    </>
  ) : (
    <>
      {weightField}
      {repsField}
    </>
  );
  const checkButton = (
    <button
      className={`wo-set-check ${s.done ? 'checked' : ''}`}
      aria-label={`${ctx}, ${s.done ? 'mark not done' : 'mark done'}`}
      aria-pressed={s.done}
      onClick={onToggle}
    >
      ✓
    </button>
  );
  // Gym Focus stacks vertically: a number/check header line, then each stepper
  // on its own full-width row, so the value stays readable and every target
  // clears 44px even on a 320px phone. List mode keeps the compact grid.
  return big ? (
    <div className={`wo-set-row gym ${single ? 'wo-single' : ''} ${s.done ? 'wo-set-done' : ''}`}>
      <div className="wo-set-row-head">
        <span className="wo-set-num">{s.set_number}</span>
        {checkButton}
      </div>
      <div className="wo-set-fields">{fields}</div>
    </div>
  ) : (
    <div className={`wo-set-row ${single ? 'wo-single' : ''} ${s.done ? 'wo-set-done' : ''}`}>
      <span className="wo-set-num">{s.set_number}</span>
      {fields}
      {checkButton}
    </div>
  );
}
