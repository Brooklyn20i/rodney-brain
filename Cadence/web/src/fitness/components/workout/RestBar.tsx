// The rest countdown / rest-complete bar. Presentational: all timing state
// lives in useRestTimer, all commit behaviour in the screen's callbacks.

export function RestBar({
  restLeft,
  restPct,
  hasRestSet,
  hasUnsavedDraft,
  muted,
  onToggleMuted,
  onExtend,
  onDiscardEdits,
  onComplete,
}: {
  restLeft: number;
  restPct: number;
  /** A completed set is associated with this rest block (drives the state chip). */
  hasRestSet: boolean;
  hasUnsavedDraft: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onExtend: () => void;
  onDiscardEdits: () => void;
  onComplete: () => void;
}) {
  return (
    <div className={`rest-timer ${restLeft <= 0 ? 'done' : ''}`}>
      <div className="rest-timer-main">
        <span className="rest-timer-label">{restLeft <= 0 ? 'Rest complete' : 'Resting'}</span>
        <span className="rest-timer-time">
          {restLeft <= 0 ? 'GO' : `${Math.floor(restLeft / 60)}:${String(restLeft % 60).padStart(2, '0')}`}
        </span>
        {restLeft <= 0 && hasRestSet && (
          <span className={`rest-timer-state ${hasUnsavedDraft ? 'warn' : 'saved'}`}>
            {hasUnsavedDraft ? 'Set has unsaved edits' : 'Set saved'}
          </span>
        )}
        {restLeft > 0 && (
          <button className="rest-timer-skip" onClick={onExtend}>
            +30s
          </button>
        )}
        <button
          className="rest-timer-skip rest-timer-icon"
          aria-pressed={muted}
          aria-label={muted ? 'Sound off — tap to unmute' : 'Sound on — tap to mute'}
          onClick={onToggleMuted}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        {/* "Done" commits any unsaved draft (completeRest → commitSet), so a
            separate Save button would be redundant; only the escape hatch to
            throw edits away stays. */}
        {restLeft <= 0 && hasUnsavedDraft && (
          <button className="rest-timer-skip" onClick={onDiscardEdits}>
            Discard edits
          </button>
        )}
        <button className="rest-timer-skip" onClick={onComplete}>
          {restLeft <= 0 ? 'Done' : 'Skip'}
        </button>
      </div>
      <div className="rest-timer-track">
        <div className="rest-timer-fill" style={{ width: `${restLeft <= 0 ? 100 : restPct}%` }} />
      </div>
    </div>
  );
}
