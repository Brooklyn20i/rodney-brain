import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Tag } from '../components/bits';
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

// The morning glance, reoriented around what actually gets used daily: today's
// workout first, then calories + macros. Whoop recovery is intentionally not
// here (no daily Whoop feed) — it lives on the Recovery screen.
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

  const upNextExercises = upNext
    ? data.program_exercises
        .filter((pe) => pe.program_day_id === upNext.id)
        .sort((a, b) => a.ex_order - b.ex_order)
    : [];
  const upNextSets = upNextExercises.reduce((s, pe) => s + pe.target_sets, 0);
  const estMin = upNextSets > 0 ? Math.round(upNextSets * 3.5) : null;
  const exName = (id: string) => data.exercises.find((e) => e.id === id)?.name || '?';

  const trend = weightTrend(data.body_metrics);
  const latestWeight = trend[trend.length - 1];
  const delta7 = trendDelta(trend, 7);

  const totals = dayNutrition(data.nutrition_logs, today);
  const target = targetFor(data.nutrition_targets, today);
  const calPct = target && target.calories > 0 ? Math.min(100, (totals.calories / target.calories) * 100) : 0;
  const calOver = target ? totals.calories > target.calories : false;
  const calLeft = target ? target.calories - totals.calories : null;
  const macroPct = (val: number, tgt: number) => (tgt > 0 ? Math.min(100, (val / tgt) * 100) : 0);

  const weekWorkouts = data.workouts.filter((w) => w.status === 'completed' && w.date >= week.start && w.date <= week.end);
  const weekMuscle = weeklySetsByMuscle(data.workout_sets, data.workouts, data.exercises, week.start, week.end);
  const weekSets = [...weekMuscle.values()].reduce((a, b) => a + b, 0);
  const weekCardio = data.cardio_sessions.filter((c) => c.date >= week.start && c.date <= week.end);
  const weekSauna = data.sauna_sessions.filter((s) => s.date >= week.start && s.date <= week.end);

  const prs = recentPRs(data.workout_sets, data.workouts, addDays(today, -14));
  const unread = data.agent_messages.filter((m) => m.sender_type !== 'user' && m.status === 'unread');

  return (
    <>
      <ScreenHeader title="Today" subtitle={fmtDayShort(today)} onMenu={onMenu}>
        {activeProgram && pos && <Tag label={`${activeProgram.name} · wk ${pos.week}/${activeProgram.weeks}`} tone="info" />}
      </ScreenHeader>
      <div className="screen-content">
        {unread.length > 0 && (
          <div className="cf-callout" style={{ cursor: 'pointer' }} onClick={() => onNavigate('kobe')}>
            ⚡ <strong>{unread.length}</strong> unread from Kobe — “{unread[unread.length - 1].body.slice(0, 80)}
            {unread[unread.length - 1].body.length > 80 ? '…' : ''}”
          </div>
        )}

        {/* Hero — today's workout is the primary daily action */}
        <div className="dash-hero">
          {inProgress ? (
            <>
              <div className="dash-hero-eyebrow">In progress</div>
              <div className="dash-hero-title">{inProgress.name}</div>
              <button className="dash-hero-btn" onClick={() => onNavigate('workout')}>▶ Resume workout</button>
            </>
          ) : trainedToday ? (
            <>
              <div className="dash-hero-eyebrow">Done for today ✓</div>
              <div className="dash-hero-title">Session complete</div>
              <button className="dash-hero-btn ghost" onClick={() => onNavigate('history')}>Review in History</button>
            </>
          ) : upNext ? (
            <>
              <div className="dash-hero-head">
                <span className="dash-hero-eyebrow">Next workout</span>
                <span className="dash-hero-meta">
                  {upNextExercises.length > 0 ? `${upNextExercises.length} exercises` : 'ready'}
                  {estMin ? ` · ~${estMin} min` : ''}
                </span>
              </div>
              <div className="dash-hero-title">{upNext.name}</div>
              {upNext.focus && <div className="dash-hero-sub">{upNext.focus}</div>}
              {upNextExercises.length > 0 && (
                <div className="dash-chips">
                  {upNextExercises.slice(0, 3).map((pe) => (
                    <span className="dash-chip" key={pe.id}>
                      {exName(pe.exercise_id)} {pe.target_sets}×{pe.rep_min}
                    </span>
                  ))}
                  {upNextExercises.length > 3 && <span className="dash-chip-more">+{upNextExercises.length - 3}</span>}
                </div>
              )}
              <button className="dash-hero-btn" onClick={() => onNavigate('workout')}>▶ Start workout</button>
            </>
          ) : (
            <>
              <div className="dash-hero-eyebrow">No active program</div>
              <div className="dash-hero-sub" style={{ marginBottom: 4 }}>Build a program, or start an ad-hoc session.</div>
              <div className="dash-hero-actions">
                <button className="dash-hero-btn" onClick={() => onNavigate('workout')}>▶ Start workout</button>
                <button className="dash-hero-btn ghost" onClick={() => onNavigate('programs')}>Programs</button>
              </div>
            </>
          )}
        </div>

        {/* Calories + macros — the second daily focus */}
        <div className="cf-card">
          <div className="dash-cal-top">
            <div>
              <span className="dash-cal-num">{fmtNum(totals.calories)}</span>
              <span className="dash-cal-unit">{target ? ` / ${fmtNum(target.calories)} kcal` : ' kcal'}</span>
            </div>
            {calLeft !== null && (
              <div className="dash-cal-left">
                <div className={`dash-cal-left-num ${calOver ? 'over' : ''}`}>
                  {calOver ? `+${fmtNum(-calLeft)}` : fmtNum(calLeft)}
                </div>
                <div className="dash-cal-left-lbl">{calOver ? 'over' : 'left'}</div>
              </div>
            )}
          </div>
          {target && (
            <div className="dash-bar big">
              <div className={`dash-bar-fill ${calOver ? 'over' : ''}`} style={{ width: `${calPct}%` }} />
            </div>
          )}
          {target ? (
            <div className="dash-macros">
              <MacroBar label="Protein" val={totals.protein_g} tgt={target.protein_g} cls="p" pct={macroPct(totals.protein_g, target.protein_g)} />
              <MacroBar label="Carbs" val={totals.carbs_g} tgt={target.carbs_g} cls="c" pct={macroPct(totals.carbs_g, target.carbs_g)} />
              <MacroBar label="Fat" val={totals.fat_g} tgt={target.fat_g} cls="f" pct={macroPct(totals.fat_g, target.fat_g)} />
            </div>
          ) : (
            <p className="dash-muted">No calorie target set · {fmtNum(totals.protein_g)}g protein logged today.</p>
          )}
          <button className="btn btn-secondary dash-log-btn" onClick={() => onNavigate('nutrition')}>+ Log food</button>
        </div>

        {/* Weight trend + week sessions */}
        <div className="cf-metric-grid dash-two">
          <div className="cf-metric">
            <div className="cf-metric-label">Weight trend</div>
            <div className="cf-metric-value">{latestWeight ? fmtKg(latestWeight.avg) : '—'}</div>
            {delta7 !== null && (
              <div className={`cf-metric-delta ${delta7 <= 0 ? 'cf-tone-good' : 'cf-tone-bad'}`}>
                {delta7 >= 0 ? '+' : ''}{fmtNum(delta7, 2)}kg / wk
              </div>
            )}
          </div>
          <div className="cf-metric">
            <div className="cf-metric-label">This week</div>
            <div className="cf-metric-value">
              {weekWorkouts.length}
              <span className="dash-metric-unit"> sessions</span>
            </div>
            <div className="cf-metric-delta cf-tone-neutral">{weekSets} hard sets</div>
          </div>
        </div>

        {/* Week at a glance */}
        <div className="dash-strip">
          <div className="dash-strip-cell"><div className="dash-strip-num">{weekWorkouts.length}</div><div className="dash-strip-lbl">Lifts</div></div>
          <div className="dash-strip-cell"><div className="dash-strip-num">{weekSets}</div><div className="dash-strip-lbl">Sets</div></div>
          <div className="dash-strip-cell"><div className="dash-strip-num">{weekCardio.length}</div><div className="dash-strip-lbl">Cardio</div></div>
          <div className="dash-strip-cell"><div className="dash-strip-num">{weekSauna.length}</div><div className="dash-strip-lbl">Sauna</div></div>
        </div>

        {prs.length > 0 && (
          <Card title="Recent PRs">
            {prs.slice(0, 5).map((pr) => (
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

function MacroBar({ label, val, tgt, pct, cls }: { label: string; val: number; tgt: number; pct: number; cls: string }) {
  return (
    <div className="dash-macro">
      <div className="dash-macro-head">
        <span>{label}</span>
        <span className="dash-macro-val">{fmtNum(val)} / {fmtNum(tgt)} g</span>
      </div>
      <div className="dash-bar"><div className={`dash-bar-fill m-${cls}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
