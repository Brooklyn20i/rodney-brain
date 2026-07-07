import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Tag } from '../components/bits';
import { dayNutrition, estimateTDEE, targetFor, weekReport } from '../lib/fitnessCalc';
import {
  buildSavedFoodPicker,
  normalisePortion,
  quickLogFromSavedFood,
  scaleMacros,
} from '../lib/nutritionQuickLog';
import {
  addDays,
  fmtDayShort,
  fmtNum,
  MEAL_LABEL,
  MEALS,
  PHASE_LABEL,
  todayISO,
} from '../lib/util';
import type { MealType, NutritionPhase } from '../lib/types';

// Daily calories + macros: quick entry, one-tap saved meals, phased targets.
// Deliberately totals-first (not a food database) -- 90% of the MacroFactor
// value at a fraction of the friction; Kobe can log entries via MCP too.
export function Nutrition({ onMenu }: { onMenu: () => void }) {
  const { data, insert, remove } = useCadenceFitness();
  const [date, setDate] = useState(todayISO());

  const logs = data.nutrition_logs.filter((l) => l.date === date);
  const totals = dayNutrition(data.nutrition_logs, date);
  const target = targetFor(data.nutrition_targets, date);

  // Energy balance: maintenance inferred from intake vs trend weight
  // (MacroFactor's loop), and a weekly review with per-day adherence.
  const energy = estimateTDEE(data.nutrition_logs, data.body_metrics, date);
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const week = weekReport(
    data.nutrition_logs,
    data.nutrition_targets,
    data.body_metrics,
    weekAnchor
  );

  // Quick add form
  const [meal, setMeal] = useState<MealType>('snack');
  const [name, setName] = useState('');
  const [cals, setCals] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const [saveAsMeal, setSaveAsMeal] = useState(false);
  const [savedFoodQuery, setSavedFoodQuery] = useState('');
  const [savedFoodQty, setSavedFoodQty] = useState<Record<string, string>>({});
  const [showSaved, setShowSaved] = useState(false);
  const savedFoodPicker = useMemo(
    () =>
      buildSavedFoodPicker({
        meals: data.saved_meals,
        logs: data.nutrition_logs,
        query: savedFoodQuery,
        limit: 8,
      }),
    [data.saved_meals, data.nutrition_logs, savedFoodQuery]
  );
  const quickAdd = async () => {
    if (!name.trim() || !Number(cals)) return;
    const row = {
      meal,
      name: name.trim(),
      calories: Math.round(Number(cals)) || 0,
      protein_g: Number(p) || 0,
      carbs_g: Number(c) || 0,
      fat_g: Number(f) || 0,
      notes: '',
    };
    await insert('nutrition_logs', { date, ...row });
    if (saveAsMeal) await insert('saved_meals', row);
    setName('');
    setCals('');
    setP('');
    setC('');
    setF('');
    setSaveAsMeal(false);
  };

  const logSaved = async (id: string) => {
    const m = data.saved_meals.find((x) => x.id === id);
    if (!m) return;
    const qty = normalisePortion(savedFoodQty[id] ?? '1');
    await insert('nutrition_logs', quickLogFromSavedFood(m, date, qty));
    setSavedFoodQty((prev) => ({ ...prev, [id]: '1' }));
  };

  // ── Targets editor ─────────────────────────────────────────────────────
  // MyFitnessPal-style: you pin calories + protein, and carbs/fat fill the
  // remaining energy automatically (4 kcal/g protein & carbs, 9 kcal/g fat).
  // Edit either carbs or fat and the other rebalances to keep the calorie goal.
  const [showTargets, setShowTargets] = useState(false);
  const [tPhase, setTPhase] = useState<NutritionPhase>('maintain');
  const [tCals, setTCals] = useState('');
  const [tP, setTP] = useState('');
  const [tC, setTC] = useState('');
  const [tF, setTF] = useState('');
  const num = (s: string) => Number(s) || 0;
  const autoFillMacros = (calsStr: string, pStr: string) => {
    const rem = Math.max(0, num(calsStr) - num(pStr) * 4); // kcal left after protein
    setTC(String(Math.round((rem * 0.5) / 4))); // split the remainder 50/50 by energy
    setTF(String(Math.round((rem * 0.5) / 9)));
  };
  const onCals = (v: string) => {
    setTCals(v);
    autoFillMacros(v, tP);
  };
  const onProt = (v: string) => {
    setTP(v);
    autoFillMacros(tCals, v);
  };
  const onCarbs = (v: string) => {
    setTC(v);
    const rem = Math.max(0, num(tCals) - num(tP) * 4 - num(v) * 4);
    setTF(String(Math.round(rem / 9)));
  };
  const onFat = (v: string) => {
    setTF(v);
    const rem = Math.max(0, num(tCals) - num(tP) * 4 - num(v) * 9);
    setTC(String(Math.round(rem / 4)));
  };
  const openTargets = () => {
    const next = !showTargets;
    if (next && target) {
      setTPhase(target.phase);
      setTCals(String(target.calories));
      setTP(String(Number(target.protein_g)));
      setTC(String(Number(target.carbs_g)));
      setTF(String(Number(target.fat_g)));
    }
    setShowTargets(next);
  };
  const saveTargets = async () => {
    if (!Number(tCals)) return;
    await insert('nutrition_targets', {
      effective_from: date,
      phase: tPhase,
      calories: Math.round(Number(tCals)),
      protein_g: Number(tP) || 0,
      carbs_g: Number(tC) || 0,
      fat_g: Number(tF) || 0,
      notes: '',
    });
    setShowTargets(false);
  };
  const macroKcal = num(tP) * 4 + num(tC) * 4 + num(tF) * 9;
  const macroDiff = macroKcal - num(tCals);
  const macroMatch = Math.abs(macroDiff) <= 20;

  const macroRow = (
    label: string,
    cls: string,
    value: number,
    max: number | undefined,
    unit: string
  ) => (
    <div className="macro-row">
      <span className="macro-label">{label}</span>
      <div className="macro-track">
        <div
          className={`macro-fill ${cls} ${max && value > max ? 'macro-over' : ''}`}
          style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }}
        />
      </div>
      <span className="macro-value">
        {fmtNum(value)}
        {max ? ` / ${fmtNum(max)}` : ''} {unit}
      </span>
    </div>
  );

  return (
    <>
      <ScreenHeader title="Nutrition" subtitle="Calories and macros vs target." onMenu={onMenu}>
        <button className="btn btn-secondary btn-sm" onClick={() => setDate(addDays(date, -1))}>
          ←
        </button>
        <input
          type="date"
          value={date}
          style={{ width: 150 }}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= todayISO()}
        >
          →
        </button>
      </ScreenHeader>
      <div className="screen-content">
        <Card
          title={`${fmtDayShort(date)} — totals`}
          actions={
            target ? (
              <Tag
                label={`${PHASE_LABEL[target.phase]} · ${fmtNum(target.calories)} kcal target`}
                tone="info"
              />
            ) : (
              <Tag label="No target set" tone="warn" />
            )
          }
        >
          {macroRow('Calories', '', totals.calories, target?.calories, 'kcal')}
          {macroRow(
            'Protein',
            'macro-protein',
            totals.protein_g,
            target ? Number(target.protein_g) : undefined,
            'g'
          )}
          {macroRow(
            'Carbs',
            'macro-carbs',
            totals.carbs_g,
            target ? Number(target.carbs_g) : undefined,
            'g'
          )}
          {macroRow(
            'Fat',
            'macro-fat',
            totals.fat_g,
            target ? Number(target.fat_g) : undefined,
            'g'
          )}
          {target && (
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
              {totals.calories <= target.calories
                ? `${fmtNum(target.calories - totals.calories)} kcal left today.`
                : `${fmtNum(totals.calories - target.calories)} kcal over target.`}{' '}
              Protein {fmtNum(Math.max(0, Number(target.protein_g) - totals.protein_g))}g to go.
            </p>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={openTargets}>
            {showTargets ? 'Hide targets' : target ? 'Edit targets' : 'Set targets'}
          </button>
          {showTargets && (
            <div style={{ marginTop: 10 }}>
              <div className="form-grid">
                <div>
                  <label className="field">Phase</label>
                  <select
                    value={tPhase}
                    onChange={(e) => setTPhase(e.target.value as NutritionPhase)}
                  >
                    {(Object.keys(PHASE_LABEL) as NutritionPhase[]).map((x) => (
                      <option key={x} value={x}>
                        {PHASE_LABEL[x]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field">Calories</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={tCals}
                    onChange={(e) => onCals(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field">Protein (g)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={tP}
                    onChange={(e) => onProt(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field">Carbs (g) · auto</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={tC}
                    onChange={(e) => onCarbs(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field">Fat (g) · auto</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={tF}
                    onChange={(e) => onFat(e.target.value)}
                  />
                </div>
              </div>
              {num(tCals) > 0 && (
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    margin: '2px 0 8px',
                    color: macroMatch ? 'var(--green)' : 'var(--orange)',
                  }}
                >
                  Macros ≈ {fmtNum(macroKcal)} kcal
                  {macroMatch
                    ? ' ✓ matches your calorie goal'
                    : ` · ${macroDiff > 0 ? '+' : ''}${fmtNum(macroDiff)} vs goal`}
                </p>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={saveTargets}
                disabled={!Number(tCals)}
              >
                Save targets from {fmtDayShort(date)}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Set calories and protein — carbs and fat fill the rest automatically. Edit either and
                the other rebalances to hold your calorie goal. Targets are phased: the newest row on
                or before a day applies, so past days keep their old targets.
              </p>
            </div>
          )}
        </Card>

        <Card title="Quick add">
          <div className="form-grid">
            <div style={{ gridColumn: 'span 2' }}>
              <label className="field">What</label>
              <input
                type="text"
                value={name}
                placeholder="e.g. Chicken, rice & greens"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="field">Meal</label>
              <select value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>
                {MEALS.map((m) => (
                  <option key={m} value={m}>
                    {MEAL_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field">Calories</label>
              <input
                type="number"
                inputMode="numeric"
                value={cals}
                onChange={(e) => setCals(e.target.value)}
              />
            </div>
            <div>
              <label className="field">Protein (g)</label>
              <input
                type="number"
                inputMode="decimal"
                value={p}
                onChange={(e) => setP(e.target.value)}
              />
            </div>
            <div>
              <label className="field">Carbs (g)</label>
              <input
                type="number"
                inputMode="decimal"
                value={c}
                onChange={(e) => setC(e.target.value)}
              />
            </div>
            <div>
              <label className="field">Fat (g)</label>
              <input
                type="number"
                inputMode="decimal"
                value={f}
                onChange={(e) => setF(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, fontSize: 13 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={saveAsMeal}
                  onChange={(e) => setSaveAsMeal(e.target.checked)}
                />
                Save to foods
              </label>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={quickAdd}
            disabled={!name.trim() || !Number(cals)}
          >
            Add to {fmtDayShort(date)}
          </button>
        </Card>

        <Card title="Logged">
          {MEALS.filter((m) => logs.some((l) => l.meal === m)).map((m) => (
            <div key={m}>
              <div className="cf-card-title nu-meal-head" style={{ margin: '8px 0 2px' }}>
                <span>{MEAL_LABEL[m]}</span>
                <span className="nu-meal-total">
                  {fmtNum(
                    logs.filter((l) => l.meal === m).reduce((s, l) => s + Number(l.calories), 0)
                  )}{' '}
                  kcal · P
                  {fmtNum(
                    logs.filter((l) => l.meal === m).reduce((s, l) => s + Number(l.protein_g), 0)
                  )}
                </span>
              </div>
              {logs
                .filter((l) => l.meal === m)
                .map((l) => (
                  <div key={l.id} className="pick-row">
                    <div className="pick-main">
                      <div className="pick-title">{l.name}</div>
                      <div className="pick-sub">
                        {l.calories} kcal · P{fmtNum(Number(l.protein_g))} C
                        {fmtNum(Number(l.carbs_g))} F{fmtNum(Number(l.fat_g))}
                      </div>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => remove('nutrition_logs', l.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          ))}
          {logs.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nothing logged for this day.</p>
          )}
        </Card>

        <Card
          title="Saved foods"
          actions={
            <button
              className="btn btn-ghost btn-sm nu-saved-toggle"
              onClick={() => setShowSaved((s) => !s)}
              aria-expanded={showSaved}
            >
              {data.saved_meals.length} saved
              <span className="nu-saved-caret" aria-hidden="true">
                {showSaved ? '▲' : '▼'}
              </span>
            </button>
          }
        >
          {!showSaved && (
            <p className="nu-saved-help" style={{ margin: 0 }}>
              {data.saved_meals.length === 0
                ? 'No saved foods yet — tick “Save to foods” in Quick add to build your list.'
                : 'Tap to quick-log from your saved foods.'}
            </p>
          )}
          {showSaved && (
            <>
          <p className="nu-saved-help">
            Showing recent foods only. Search to find anything else in the full saved-food library.
          </p>
          <div className="nu-saved-search">
            <input
              type="search"
              value={savedFoodQuery}
              placeholder="Search saved foods…"
              onChange={(e) => setSavedFoodQuery(e.target.value)}
            />
            {savedFoodQuery && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSavedFoodQuery('')}>
                Clear
              </button>
            )}
          </div>
          {data.saved_meals.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
              No saved foods yet. Use <strong>Quick add</strong> with “Save to foods” to build your
              list.
            </p>
          )}
          {data.saved_meals.length > 0 && savedFoodPicker.total === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
              No saved foods match that search.
            </p>
          )}
          {savedFoodPicker.visible.length > 0 && (
            <div className="nu-saved-list">
              {savedFoodPicker.visible.map((m) => {
                const qty = savedFoodQty[m.id] ?? '1';
                const scaled = scaleMacros(m, qty);
                const portion = normalisePortion(qty);
                return (
                  <div key={m.id} className="nu-saved-row">
                    <div className="nu-saved-main" title={m.notes || undefined}>
                      <div className="nu-saved-title">{m.name}</div>
                      <div className="nu-saved-meta">
                        {MEAL_LABEL[m.meal]} · {scaled.calories} kcal · P{fmtNum(scaled.protein_g)}{' '}
                        C{fmtNum(scaled.carbs_g)} F{fmtNum(scaled.fat_g)}
                        {portion !== 1 ? ` · ×${portion}` : ''}
                      </div>
                    </div>
                    <div className="nu-saved-actions">
                      <input
                        aria-label={`Quantity for ${m.name}`}
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        max="10"
                        step="0.5"
                        value={qty}
                        onChange={(e) =>
                          setSavedFoodQty((prev) => ({ ...prev, [m.id]: e.target.value }))
                        }
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => logSaved(m.id)}>
                        Log
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        aria-label={`Delete saved food ${m.name}`}
                        onClick={() => remove('saved_meals', m.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {savedFoodPicker.hasMore && (
            <p className="nu-saved-help">
              Showing {savedFoodPicker.visible.length} of {savedFoodPicker.total}. Search to narrow
              the list.
            </p>
          )}
            </>
          )}
        </Card>

        <Card
          title="Energy balance"
          actions={
            energy?.reliable ? (
              <Tag label={`Maintenance ≈ ${fmtNum(energy.tdee)} kcal`} tone="info" />
            ) : undefined
          }
        >
          {energy?.reliable ? (
            (() => {
              const balance = totals.calories - energy.tdee;
              const cutting = balance < 0;
              return (
                <>
                  <p style={{ fontSize: 14, margin: '0 0 6px' }}>
                    {date === todayISO() ? 'Today so far' : fmtDayShort(date)}:{' '}
                    <strong style={{ color: cutting ? 'var(--green)' : 'var(--red)' }}>
                      {cutting
                        ? `${fmtNum(-balance)} kcal deficit`
                        : `${fmtNum(balance)} kcal surplus`}
                    </strong>{' '}
                    vs your estimated maintenance.
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
                    Estimated from {energy.loggedDays} logged days and your weight trend over the
                    last {energy.spanDays} days (avg intake {fmtNum(energy.avgIntake)} kcal,{' '}
                    {energy.weightDeltaKg <= 0 ? '' : '+'}
                    {fmtNum(energy.weightDeltaKg, 2)}kg trend). A steady 500 kcal daily deficit ≈
                    −0.45kg/week.
                  </p>
                </>
              );
            })()
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
              Log food most days and weigh in regularly and Cadence will infer your true maintenance
              calories from intake vs weight trend — no formulas.{' '}
              {energy
                ? `So far: ${energy.loggedDays} logged days across ${energy.spanDays} days of weigh-ins.`
                : 'No weigh-in trend yet — add weight on the Body screen (or via Sync).'}
            </p>
          )}
        </Card>

        <Card
          title="This week"
          actions={
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setWeekAnchor(addDays(week.start, -1))}
              >
                ←
              </button>
              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
                {fmtDayShort(week.start)} – {fmtDayShort(week.end)}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={week.end >= todayISO()}
                onClick={() => setWeekAnchor(addDays(week.end, 1))}
              >
                →
              </button>
            </span>
          }
        >
          <div className="nu-week-bars">
            {week.days.map((d) => {
              const max = Math.max(d.target ?? 0, d.calories, 1);
              const pct = Math.round((d.calories / max) * 100);
              const over = d.delta !== null && d.delta > 0;
              return (
                <div
                  key={d.date}
                  className="nu-week-day"
                  title={`${fmtDayShort(d.date)}: ${fmtNum(d.calories)} kcal${d.target ? ` / ${fmtNum(d.target)}` : ''}`}
                >
                  <div className="nu-week-track">
                    <div
                      className={`nu-week-fill ${!d.logged ? 'empty' : over ? 'over' : 'under'}`}
                      style={{ height: `${d.logged ? Math.max(6, pct) : 0}%` }}
                    />
                    {d.target !== null && (
                      <div
                        className="nu-week-goal"
                        style={{ bottom: `${Math.min(100, (d.target / max) * 100)}%` }}
                      />
                    )}
                  </div>
                  <span className="nu-week-label">{fmtDayShort(d.date).slice(0, 2)}</span>
                </div>
              );
            })}
          </div>
          <div className="cf-table-wrap">
            <table className="cf-table">
              <tbody>
                <tr>
                  <td>Days logged</td>
                  <td>{week.loggedDays}/7</td>
                </tr>
                <tr>
                  <td>Average intake</td>
                  <td>
                    {week.avgIntake !== null
                      ? `${fmtNum(week.avgIntake)} kcal · P${fmtNum(week.avgProtein ?? 0)}g`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td>Days at/under target</td>
                  <td>{week.loggedDays ? `${week.onTargetDays}/${week.loggedDays}` : '—'}</td>
                </tr>
                <tr>
                  <td>Weight trend this week</td>
                  <td>
                    {week.weightDeltaKg !== null
                      ? `${week.weightDeltaKg >= 0 ? '+' : ''}${fmtNum(week.weightDeltaKg, 2)}kg`
                      : '—'}
                  </td>
                </tr>
                <tr className="cf-total">
                  <td>Average daily balance</td>
                  <td>
                    {week.avgDailyBalance !== null
                      ? `${week.avgDailyBalance >= 0 ? '+' : ''}${fmtNum(week.avgDailyBalance)} kcal (${
                          week.projectedKgPerWeek! >= 0 ? '+' : ''
                        }${fmtNum(week.projectedKgPerWeek!, 2)}kg/wk)`
                      : 'needs maintenance estimate'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
