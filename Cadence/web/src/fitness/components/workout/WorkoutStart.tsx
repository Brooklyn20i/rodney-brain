// The no-active-session view: pick/switch a program, start today's suggested
// day (or any day), or start an empty ad-hoc session.

import { useCadenceFitness } from '../../lib/store';
import { ScreenHeader, Card, Tag } from '../bits';
import { nextProgramDay, programPosition } from '../../lib/fitnessCalc';
import { stripDayPrefix } from '../../lib/util';
import type { Program, ProgramDay } from '../../lib/types';

export function WorkoutStart({
  onMenu,
  activeProgram,
  onStart,
  onSwitchProgram,
}: {
  onMenu: () => void;
  activeProgram: Program | undefined;
  onStart: (day: ProgramDay | null) => void;
  onSwitchProgram: (programId: string) => void;
}) {
  const { data } = useCadenceFitness();
  const days = activeProgram
    ? data.program_days.filter((d) => d.program_id === activeProgram.id).sort((a, b) => a.day_order - b.day_order)
    : [];
  const suggested = activeProgram ? nextProgramDay(days, data.workouts, activeProgram.id) : null;
  const pos = activeProgram ? programPosition(activeProgram, data.program_days, data.workouts) : null;
  const switchable = data.programs.filter((p) => p.status === 'draft' || p.status === 'active');

  return (
    <>
      <ScreenHeader title="Workout" subtitle="Start today's session." onMenu={onMenu} />
      <div className="screen-content">
        {switchable.length > 1 && (
          <div className="wo-program-switch">
            <label className="field" style={{ margin: 0 }}>
              Program
            </label>
            <select value={activeProgram?.id ?? ''} onChange={(e) => e.target.value && onSwitchProgram(e.target.value)}>
              {!activeProgram && <option value="">Choose…</option>}
              {switchable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {activeProgram ? (
          <>
            <Card
              title={activeProgram.name}
              actions={pos ? <Tag label={`Cycle ${pos.cycle} · Week ${pos.week}/${activeProgram.weeks}`} tone="info" /> : undefined}
            >
              {suggested && (
                <div className="cf-callout">
                  Up next: <strong>{stripDayPrefix(suggested.name)}</strong>
                  {suggested.focus ? ` — ${suggested.focus}` : ''}
                  <div style={{ marginTop: 10 }}>
                    <button className="btn btn-primary" onClick={() => onStart(suggested)}>
                      ▶ Start {stripDayPrefix(suggested.name)}
                    </button>
                  </div>
                </div>
              )}
              {days.map((d) => (
                <div key={d.id} className="pick-row">
                  <div className="pick-main">
                    <div className="pick-title">{stripDayPrefix(d.name)}</div>
                    {d.focus && <div className="pick-sub">{d.focus}</div>}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => onStart(d)}>
                    Start
                  </button>
                </div>
              ))}
            </Card>
          </>
        ) : (
          <div className="cf-callout cf-callout-warn">
            No active program. Build one under <strong>Programs</strong> (and set it active) to get
            guided sessions with targets and cycle tracking — or just start an empty session below.
          </div>
        )}
        <Card title="Ad-hoc">
          <button className="btn btn-secondary" onClick={() => onStart(null)}>
            Start empty session
          </button>
        </Card>
      </div>
    </>
  );
}
