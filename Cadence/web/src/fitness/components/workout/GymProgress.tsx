// The Gym Focus header: per-exercise progress segments + "Exercise N of M".

export function GymProgress({
  exerciseIds,
  idx,
  nameFor,
  completeFor,
  onFocus,
}: {
  exerciseIds: string[];
  idx: number;
  nameFor: (exerciseId: string) => string;
  completeFor: (exerciseId: string) => boolean;
  onFocus: (index: number) => void;
}) {
  const doneCount = exerciseIds.filter((id) => completeFor(id)).length;
  return (
    <div className="gym-head">
      <div className="gym-seg" role="tablist" aria-label="Exercises">
        {exerciseIds.map((id, i) => {
          const complete = completeFor(id);
          const state = complete ? 'done' : i === idx ? 'current' : 'not started';
          return (
            <button
              key={id}
              type="button"
              role="tab"
              className={`gym-seg-item ${i === idx ? 'active' : ''} ${complete ? 'complete' : ''}`}
              aria-label={`${nameFor(id)} — ${state}`}
              aria-current={i === idx ? 'step' : undefined}
              aria-selected={i === idx}
              onClick={() => onFocus(i)}
            >
              {/* 44px tap target; the thin visual bar + a non-colour state
                  glyph live in inner elements. */}
              <span className="gym-seg-bar" aria-hidden="true" />
              <span className="gym-seg-glyph" aria-hidden="true">
                {complete ? '✓' : i === idx ? '●' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <div className="gym-head-label">
        <span>
          Exercise <strong>{idx + 1}</strong> of {exerciseIds.length}
        </span>
        <span className="gym-head-done">{doneCount} done</span>
      </div>
    </div>
  );
}
