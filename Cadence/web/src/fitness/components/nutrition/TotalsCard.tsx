// The day's calories + macros vs target, with the phased targets editor.

import { useState } from 'react';
import { useCadenceFitness } from '../../lib/store';
import { Card, Tag } from '../bits';
import { dayNutrition, targetFor } from '../../lib/fitnessCalc';
import { fmtDayShort, fmtNum, PHASE_LABEL } from '../../lib/util';
import type { NutritionPhase } from '../../lib/types';

export function TotalsCard({ date }: { date: string }) {
  const { data, insert } = useCadenceFitness();
  const totals = dayNutrition(data.nutrition_logs, date);
  const target = targetFor(data.nutrition_targets, date);

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

  const macroRow = (label: string, cls: string, value: number, max: number | undefined, unit: string) => (
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
    <Card
      title={`${fmtDayShort(date)} — totals`}
      actions={
        target ? (
          <Tag label={`${PHASE_LABEL[target.phase]} · ${fmtNum(target.calories)} kcal target`} tone="info" />
        ) : (
          <Tag label="No target set" tone="warn" />
        )
      }
    >
      {macroRow('Calories', '', totals.calories, target?.calories, 'kcal')}
      {macroRow('Protein', 'macro-protein', totals.protein_g, target ? Number(target.protein_g) : undefined, 'g')}
      {macroRow('Carbs', 'macro-carbs', totals.carbs_g, target ? Number(target.carbs_g) : undefined, 'g')}
      {macroRow('Fat', 'macro-fat', totals.fat_g, target ? Number(target.fat_g) : undefined, 'g')}
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
              <select value={tPhase} onChange={(e) => setTPhase(e.target.value as NutritionPhase)}>
                {(Object.keys(PHASE_LABEL) as NutritionPhase[]).map((x) => (
                  <option key={x} value={x}>
                    {PHASE_LABEL[x]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field">Calories</label>
              <input type="number" inputMode="numeric" value={tCals} onChange={(e) => onCals(e.target.value)} />
            </div>
            <div>
              <label className="field">Protein (g)</label>
              <input type="number" inputMode="numeric" value={tP} onChange={(e) => onProt(e.target.value)} />
            </div>
            <div>
              <label className="field">Carbs (g) · auto</label>
              <input type="number" inputMode="numeric" value={tC} onChange={(e) => onCarbs(e.target.value)} />
            </div>
            <div>
              <label className="field">Fat (g) · auto</label>
              <input type="number" inputMode="numeric" value={tF} onChange={(e) => onFat(e.target.value)} />
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
              {macroMatch ? ' ✓ matches your calorie goal' : ` · ${macroDiff > 0 ? '+' : ''}${fmtNum(macroDiff)} vs goal`}
            </p>
          )}
          <button className="btn btn-primary btn-sm" onClick={saveTargets} disabled={!Number(tCals)}>
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
  );
}
