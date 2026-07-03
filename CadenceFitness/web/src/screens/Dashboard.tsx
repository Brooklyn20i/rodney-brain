import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric, Tag } from '../components/bits';
import {
  cyclePosition,
  dayNutrition,
  nextProgramDay,
  recentPRs,
  targetFor,
  trendDelta,
  weeklySetsByMuscle,
  weekOf,
  weightTrend,
} from '../lib/fitnessCalc';
import { addDays, fmtDayShort, fmtKg, fmtNum, todayISO } from '../lib/util';

// The morning glance: recovery, weight trend, calories so far, today's
// session -- then this week's training volume and any recent PRs.
export function Dashboard({ onMenu, onNavigate }: { onMenu: () => void; onNavigate: (id: string) => void }) {
  const { data } = useCadenceFitness();
  const today = todayISO();
  const week = weekOf(today);

  const activeProgram = data.programs.find((p) => p.status === 'active');
  const inProgress = data.workouts.find((w) => w.status === 'in_progress');
  const pos = activeProgram ? cyclePosition(activeProgram, today) : null;
  const days = activeProgram ? data.program_days.filter((d) => d.program_id === activeProgram.id) : [];
  const upNext = activeProgram ? nextProgramDay(days, data.workouts, activeProgram.id) : null;
  const trainedToday = data.workouts.some((w) => w.date === today && w.status === 'completed');

  const recovery = data.recovery_metrics.find((r) => r.date === today) || null;
  const trend = weightTrend(data.body_metrics);
  const latestWeight = trend[trend.length - 1];
  const delta7 = trendDelta(trend, 7);

  const totals = dayNutrition(data.nutrition_logs, today);
  const target = targetFor(data.nutrition_targets, today);

  const weekWorkouts = data.workouts.filter((w) => w.status === 'completed' && w.date >= week.start && w.date <= week.end);
  const weekMuscle = weeklySetsByMuscle(data.workout_sets, data.workouts, data.exercises, week.start, week.end);
  const weekSets = [...weekMuscle.values()].reduce((a, b) => a + b, 0);
  const weekCardio = data.cardio_sessions.filter((c) => c.date >= week.start && c.date <= week.end);
  const weekSauna = data.sauna_sessions.filter((s) => s.date >= week.start && s.date <= week.end);

  const prs = recentPRs(data.workout_sets, data.workouts, addDays(today, -14));
  const unread = data.agent_messages.filter((m) => m.sender_type !== 'user' && m.status === 'unread');
  const exName = (id: string) => data.exercises.find((e) => e.id === id)?.name || '?';

  const recoveryTone: 'good' | 'bad' | 'neutral' =
    recovery?.recovery_pct == null ? 'neutral' : recovery.recovery_pct >= 67 ? 'good' : recovery.recovery_pct >= 34 ? 'neutral' : 'bad';

  return (
    <>
      <ScreenHeader title="Dashboard" subtitle={fmtDayShort(today)} onMenu={onMenu}>
        {activeProgram && pos && <Tag label={`${activeProgram.name} · Cycle ${pos.cycle}, week ${pos.week}/${activeProgram.weeks}`} tone="info" />}
      </ScreenHeader>
      <div className="screen-content">
        {unread.length > 0 && (
          <div className="cf-callout" style={{ cursor: 'pointer' }} onClick={() => onNavigate('kobe')}>
            ⚡ <strong>{unread.length}</strong> unread from Kobe — “{unread[unread.length - 1].body.slice(0, 90)}
            {unread[unread.length - 1].body.length > 90 ? '…' : ''}”
          </div>
        )}

        <div className="cf-metric-grid">
          <Metric
            label="Whoop recovery"
            value={recovery?.recovery_pct != null ? `${recovery.recovery_pct}%` : '—'}
            delta={recovery?.sleep_hours != null ? `${fmtNum(Number(recovery.sleep_hours), 1)}h sleep` : 'not logged'}
            tone={recoveryTone}
          />
          <Metric
            label="Weight trend"
            value={latestWeight ? fmtKg(latestWeight.avg) : '—'}
            delta={delta7 !== null ? `${delta7 >= 0 ? '+' : ''}${fmtNum(delta7, 2)}kg / wk` : undefined}
            tone={delta7 === null ? 'neutral' : delta7 <= 0 ? 'good' : 'bad'}
          />
          <Metric
            label="Calories today"
            value={fmtNum(totals.calories)}
            delta={target ? `${fmtNum(Math.max(0, target.calories - totals.calories))} left · P${fmtNum(totals.protein_g)}g` : 'no target'}
            tone={target && totals.calories > target.calories ? 'bad' : 'neutral'}
          />
          <Metric label="Sessions this week" value={`${weekWorkouts.length}`} delta={`${weekSets} hard sets`} />
        </div>

        <Card title="Today's training">
          {inProgress ? (
            <div className="cf-callout">
              Session <strong>{inProgress.name}</strong> is in progress.
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary" onClick={() => onNavigate('workout')}>
                  ▶ Resume session
                </button>
              </div>
            </div>
          ) : trainedToday ? (
            <p style={{ fontSize: 13 }}>
              ✅ Done for today.{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('history')}>
                Review it in History
              </button>
            </p>
          ) : upNext ? (
            <div className="cf-callout">
              Up next: <strong>{upNext.name}</strong>
              {upNext.focus ? ` — ${upNext.focus}` : ''}
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary" onClick={() => onNavigate('workout')}>
                  ▶ Go train
                </button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>
              No active program.{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('programs')}>
                Build one
              </button>{' '}
              or{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('workout')}>
                start an ad-hoc session
              </button>
            </p>
          )}
        </Card>

        <Card title="This week">
          <div className="cf-table-wrap">
            <table className="cf-table">
              <tbody>
                <tr>
                  <td>Lifting sessions</td>
                  <td>{weekWorkouts.length}</td>
                </tr>
                <tr>
                  <td>Hard sets</td>
                  <td>{weekSets}</td>
                </tr>
                <tr>
                  <td>Cardio</td>
                  <td>
                    {weekCardio.length} ({fmtNum(weekCardio.reduce((s, c) => s + Number(c.duration_min), 0))} min)
                  </td>
                </tr>
                <tr>
                  <td>Sauna</td>
                  <td>
                    {weekSauna.length} ({fmtNum(weekSauna.reduce((s, x) => s + Number(x.duration_min), 0))} min)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {prs.length > 0 && (
          <Card title="PRs in the last 14 days">
            {prs.slice(0, 6).map((pr) => (
              <div key={pr.exercise_id + pr.date} className="pick-row">
                <div className="pick-main">
                  <div className="pick-title">{exName(pr.exercise_id)}</div>
                  <div className="pick-sub">
                    {fmtKg(pr.weight_kg)} × {pr.reps} · e1RM {fmtKg(pr.e1rm)} · {fmtDayShort(pr.date)}
                  </div>
                </div>
                <Tag label="PR" tone="good" />
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
