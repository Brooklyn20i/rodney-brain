import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric, Tag } from '../components/bits';
import { weeklySetsByMuscle, weekOf, workoutTonnage } from '../lib/fitnessCalc';
import { fmtDayShort, fmtKg, fmtNum, MUSCLE_GROUP_LABEL, todayISO } from '../lib/util';

// Session log + weekly volume: what actually happened, week by week.
export function History({ onMenu }: { onMenu: () => void }) {
  const { data, remove } = useCadenceFitness();
  const [openId, setOpenId] = useState<string | null>(null);

  const completed = useMemo(
    () =>
      [...data.workouts]
        .filter((w) => w.status === 'completed')
        .sort((a, b) => b.date.localeCompare(a.date) || (b.completed_at || '').localeCompare(a.completed_at || '')),
    [data.workouts]
  );

  const today = todayISO();
  const thisWeek = weekOf(today);
  const weekWorkouts = completed.filter((w) => w.date >= thisWeek.start && w.date <= thisWeek.end);
  const weekMuscle = weeklySetsByMuscle(data.workout_sets, data.workouts, data.exercises, thisWeek.start, thisWeek.end);
  const weekSets = [...weekMuscle.values()].reduce((a, b) => a + b, 0);
  const weekCardio = data.cardio_sessions.filter((c) => c.date >= thisWeek.start && c.date <= thisWeek.end).length;
  const weekSauna = data.sauna_sessions.filter((s) => s.date >= thisWeek.start && s.date <= thisWeek.end).length;

  const exName = (id: string) => data.exercises.find((e) => e.id === id)?.name || '?';

  return (
    <>
      <ScreenHeader title="History" subtitle="Every session, and this week's volume." onMenu={onMenu} />
      <div className="screen-content">
        <div className="cf-metric-grid">
          <Metric label="Sessions this week" value={String(weekWorkouts.length)} />
          <Metric label="Hard sets this week" value={String(weekSets)} />
          <Metric label="Cardio this week" value={String(weekCardio)} />
          <Metric label="Sauna this week" value={String(weekSauna)} />
        </div>

        {weekMuscle.size > 0 && (
          <Card title="Hard sets per muscle group (this week)">
            <div className="cf-table-wrap">
              <table className="cf-table">
                <tbody>
                  {[...weekMuscle.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([m, n]) => (
                      <tr key={m}>
                        <td>{MUSCLE_GROUP_LABEL[m]}</td>
                        <td>{n}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title="Sessions">
          {completed.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>No sessions logged yet — hit Workout to start one.</p>
          )}
          {completed.map((w) => {
            const sets = data.workout_sets.filter((s) => s.workout_id === w.id && s.done);
            const openNow = openId === w.id;
            const mins =
              w.started_at && w.completed_at
                ? Math.round((new Date(w.completed_at).getTime() - new Date(w.started_at).getTime()) / 60000)
                : null;
            return (
              <div key={w.id}>
                <div className="pick-row" style={{ cursor: 'pointer' }} onClick={() => setOpenId(openNow ? null : w.id)}>
                  <div className="pick-main">
                    <div className="pick-title">
                      {w.name || 'Session'} {w.week_number ? <Tag label={`Wk ${w.week_number}`} tone="info" /> : null}
                    </div>
                    <div className="pick-sub">
                      {fmtDayShort(w.date)} · {sets.length} sets · {fmtNum(workoutTonnage(data.workout_sets, w.id))}kg total
                      {mins !== null ? ` · ${mins} min` : ''}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text3)' }}>{openNow ? '▾' : '▸'}</span>
                </div>
                {openNow && (
                  <div style={{ padding: '4px 4px 12px' }}>
                    {Object.entries(
                      sets.reduce<Record<string, typeof sets>>((acc, s) => {
                        (acc[s.exercise_id] ||= []).push(s);
                        return acc;
                      }, {})
                    ).map(([exerciseId, rows]) => (
                      <div key={exerciseId} style={{ fontSize: 13, padding: '3px 0' }}>
                        <strong>{exName(exerciseId)}</strong>{' '}
                        <span style={{ color: 'var(--text2)' }}>
                          {rows
                            .sort((a, b) => a.set_number - b.set_number)
                            .map((s) => `${Number(s.weight_kg)}×${s.reps}`)
                            .join(', ')}
                        </span>
                      </div>
                    ))}
                    {w.notes && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>“{w.notes}”</div>}
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={async () => {
                        if (!window.confirm('Delete this session and its sets?')) return;
                        for (const s of data.workout_sets.filter((x) => x.workout_id === w.id)) {
                          await remove('workout_sets', s.id);
                        }
                        await remove('workouts', w.id);
                      }}
                    >
                      Delete session
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
        {completed.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--text3)' }}>
            Heaviest logged set ever:{' '}
            {(() => {
              const done = data.workout_sets.filter((s) => s.done && !s.is_warmup);
              if (!done.length) return '—';
              const top = done.reduce((a, b) => (Number(a.weight_kg) >= Number(b.weight_kg) ? a : b));
              return `${exName(top.exercise_id)} ${fmtKg(Number(top.weight_kg))} × ${top.reps}`;
            })()}
          </p>
        )}
      </div>
    </>
  );
}
