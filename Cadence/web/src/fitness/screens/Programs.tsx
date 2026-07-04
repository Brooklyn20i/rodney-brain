import { useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Tag } from '../components/bits';
import { cyclePosition } from '../lib/fitnessCalc';
import { fmtDMY, todayISO } from '../lib/util';
import type { Program, ProgramDay } from '../lib/types';

// Program builder: days -> exercise slots with set/rep/rest targets, run in
// N-week cycles (the MacroFactor-workout-style mesocycle view). Exactly one
// program is active at a time; the Workout screen trains from it.
export function Programs({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, remove } = useCadenceFitness();
  const [openId, setOpenId] = useState<string | null>(null);

  const programs = [...data.programs].sort((a, b) => {
    const rank = (p: Program) => (p.status === 'active' ? 0 : p.status === 'draft' ? 1 : 2);
    return rank(a) - rank(b) || b.created_at.localeCompare(a.created_at);
  });

  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState('4');
  const createProgram = async () => {
    if (!name.trim()) return;
    const p = await insert('programs', {
      name: name.trim(),
      description: '',
      weeks: Math.max(1, Number(weeks) || 4),
      status: data.programs.some((x) => x.status === 'active') ? 'draft' : 'active',
      start_date: todayISO(),
      notes: '',
    });
    setName('');
    setOpenId(p.id);
  };

  // Switching programs is non-destructive: the previous active one drops back
  // to draft so you can flip between programs whenever you like. Archiving is
  // an explicit choice via the status selector.
  const setActive = async (p: Program) => {
    for (const other of data.programs.filter((x) => x.status === 'active' && x.id !== p.id)) {
      await update('programs', other.id, { status: 'draft' });
    }
    await update('programs', p.id, { status: 'active', start_date: p.start_date || todayISO() });
  };

  const open = programs.find((p) => p.id === openId) || null;

  return (
    <>
      <ScreenHeader title="Programs" subtitle="Training blocks, run in cycles." onMenu={onMenu} />
      <div className="screen-content">
        {!open && (
          <>
            <Card title="New program">
              <div className="form-grid form-grid-2">
                <div>
                  <label className="field">Name</label>
                  <input type="text" value={name} placeholder="e.g. 5-Day Power-Build" onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="field">Cycle length (weeks)</label>
                  <input type="number" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={createProgram} disabled={!name.trim()}>
                Create program
              </button>
            </Card>
            <Card title="All programs">
              {programs.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nothing yet — build your split above.</p>}
              {programs.map((p) => {
                const pos = p.status === 'active' ? cyclePosition(p, todayISO()) : null;
                const dayCount = data.program_days.filter((d) => d.program_id === p.id).length;
                return (
                  <div key={p.id} className="pick-row">
                    <div className="pick-main">
                      <div className="pick-title">
                        {p.name}{' '}
                        {p.status === 'active' ? (
                          <Tag label={pos ? `Active · Cycle ${pos.cycle}, week ${pos.week}/${p.weeks}` : 'Active'} tone="good" />
                        ) : (
                          <Tag label={p.status} />
                        )}
                      </div>
                      <div className="pick-sub">
                        {dayCount} day{dayCount === 1 ? '' : 's'} · {p.weeks}-week cycles
                        {p.start_date ? ` · started ${fmtDMY(p.start_date)}` : ''}
                      </div>
                    </div>
                    {p.status !== 'active' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => setActive(p)}>
                        Set active
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(p.id)}>
                      Edit
                    </button>
                  </div>
                );
              })}
            </Card>
          </>
        )}

        {open && (
          <ProgramEditor
            program={open}
            onBack={() => setOpenId(null)}
            onDelete={async () => {
              if (!window.confirm(`Delete program "${open.name}"? Logged workouts are kept.`)) return;
              for (const d of data.program_days.filter((x) => x.program_id === open.id)) {
                for (const s of data.program_exercises.filter((x) => x.program_day_id === d.id)) {
                  await remove('program_exercises', s.id);
                }
                await remove('program_days', d.id);
              }
              await remove('programs', open.id);
              setOpenId(null);
            }}
          />
        )}
      </div>
    </>
  );
}

function ProgramEditor({ program, onBack, onDelete }: { program: Program; onBack: () => void; onDelete: () => void }) {
  const { data, insert, update, remove } = useCadenceFitness();
  const days = data.program_days
    .filter((d) => d.program_id === program.id)
    .sort((a, b) => a.day_order - b.day_order);

  const [dayName, setDayName] = useState('');
  const addDay = async () => {
    if (!dayName.trim()) return;
    await insert('program_days', {
      program_id: program.id,
      day_order: (days[days.length - 1]?.day_order ?? 0) + 1,
      name: dayName.trim(),
      focus: '',
    });
    setDayName('');
  };

  return (
    <>
      <Card
        title={program.name}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={onBack}>
              ← All programs
            </button>
            <button className="btn btn-danger btn-sm" onClick={onDelete}>
              Delete
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div>
            <label className="field">Name</label>
            <input type="text" defaultValue={program.name} onBlur={(e) => update('programs', program.id, { name: e.target.value })} />
          </div>
          <div>
            <label className="field">Cycle weeks</label>
            <input
              type="number"
              inputMode="numeric"
              defaultValue={program.weeks}
              onBlur={(e) => update('programs', program.id, { weeks: Math.max(1, Number(e.target.value) || 4) })}
            />
          </div>
          <div>
            <label className="field">Cycle start date</label>
            <input
              type="date"
              defaultValue={program.start_date || ''}
              onBlur={(e) => update('programs', program.id, { start_date: e.target.value || null })}
            />
          </div>
          <div>
            <label className="field">Status</label>
            <select
              value={program.status}
              onChange={(e) => update('programs', program.id, { status: e.target.value as Program['status'] })}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <label className="field">Progression notes</label>
        <textarea
          defaultValue={program.notes}
          placeholder="e.g. +2.5kg when all working sets hit the top of the rep range; week 4 is a deload at -20%."
          onBlur={(e) => update('programs', program.id, { notes: e.target.value })}
        />
      </Card>

      {days.map((day, i) => (
        <DayEditor
          key={day.id}
          day={day}
          canMoveUp={i > 0}
          onMoveUp={async () => {
            const prev = days[i - 1];
            await update('program_days', day.id, { day_order: prev.day_order });
            await update('program_days', prev.id, { day_order: day.day_order });
          }}
          onDelete={async () => {
            if (!window.confirm(`Remove ${day.name}?`)) return;
            for (const s of data.program_exercises.filter((x) => x.program_day_id === day.id)) {
              await remove('program_exercises', s.id);
            }
            await remove('program_days', day.id);
          }}
        />
      ))}

      <Card title="Add day">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={dayName}
            placeholder={`e.g. Day ${days.length + 1} — Push`}
            onChange={(e) => setDayName(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={addDay} disabled={!dayName.trim()}>
            Add
          </button>
        </div>
      </Card>
    </>
  );
}

function DayEditor({
  day,
  canMoveUp,
  onMoveUp,
  onDelete,
}: {
  day: ProgramDay;
  canMoveUp: boolean;
  onMoveUp: () => void;
  onDelete: () => void;
}) {
  const { data, insert, update, remove } = useCadenceFitness();
  const slots = data.program_exercises
    .filter((s) => s.program_day_id === day.id)
    .sort((a, b) => a.ex_order - b.ex_order);
  const exercises = [...data.exercises].sort((a, b) => a.name.localeCompare(b.name));
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name || '?';

  const [exId, setExId] = useState('');
  const addSlot = async () => {
    if (!exId) return;
    await insert('program_exercises', {
      program_day_id: day.id,
      exercise_id: exId,
      ex_order: (slots[slots.length - 1]?.ex_order ?? 0) + 1,
      target_sets: 3,
      rep_min: 8,
      rep_max: 12,
      target_rpe: 8,
      rest_seconds: 120,
      notes: '',
    });
    setExId('');
  };

  return (
    <Card
      title={day.name}
      actions={
        <>
          {canMoveUp && (
            <button className="btn btn-ghost btn-sm" onClick={onMoveUp}>
              ↑
            </button>
          )}
          <button className="btn btn-danger btn-sm" onClick={onDelete}>
            Remove
          </button>
        </>
      }
    >
      <div className="form-grid form-grid-2" style={{ marginBottom: 8 }}>
        <div>
          <label className="field">Day name</label>
          <input type="text" defaultValue={day.name} onBlur={(e) => update('program_days', day.id, { name: e.target.value })} />
        </div>
        <div>
          <label className="field">Focus</label>
          <input
            type="text"
            defaultValue={day.focus}
            placeholder="e.g. Chest / shoulders / triceps"
            onBlur={(e) => update('program_days', day.id, { focus: e.target.value })}
          />
        </div>
      </div>

      {slots.length > 0 && (
        <div className="cf-table-wrap">
          <table className="cf-table">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Sets</th>
                <th>Reps</th>
                <th>RPE</th>
                <th>Rest (s)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s, i) => (
                <tr key={s.id}>
                  <td>{exName(s.exercise_id)}</td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 56, textAlign: 'right' }}
                      defaultValue={s.target_sets}
                      onBlur={(e) => update('program_exercises', s.id, { target_sets: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <input
                      type="number"
                      style={{ width: 52, textAlign: 'right' }}
                      defaultValue={s.rep_min}
                      onBlur={(e) => update('program_exercises', s.id, { rep_min: Math.max(1, Number(e.target.value) || 1) })}
                    />
                    {' – '}
                    <input
                      type="number"
                      style={{ width: 52, textAlign: 'right' }}
                      defaultValue={s.rep_max}
                      onBlur={(e) => update('program_exercises', s.id, { rep_max: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      style={{ width: 56, textAlign: 'right' }}
                      defaultValue={s.target_rpe ?? ''}
                      onBlur={(e) =>
                        update('program_exercises', s.id, { target_rpe: e.target.value === '' ? null : Number(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 64, textAlign: 'right' }}
                      defaultValue={s.rest_seconds}
                      onBlur={(e) => update('program_exercises', s.id, { rest_seconds: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {i > 0 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          const prev = slots[i - 1];
                          await update('program_exercises', s.id, { ex_order: prev.ex_order });
                          await update('program_exercises', prev.id, { ex_order: s.ex_order });
                        }}
                      >
                        ↑
                      </button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => remove('program_exercises', s.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <select value={exId} onChange={(e) => setExId(e.target.value)}>
          <option value="">Add exercise…</option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={addSlot} disabled={!exId}>
          Add
        </button>
      </div>
    </Card>
  );
}
