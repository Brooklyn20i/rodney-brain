// Manual entry for a one-off food. Meal defaults to the time of day; the
// "Save to foods" tick also files it into the saved-food library.

import { useState } from 'react';
import { useCadenceFitness } from '../../lib/store';
import { Card } from '../bits';
import { mealForHour } from '../../lib/nutritionQuickLog';
import { fmtDayShort, MEAL_LABEL, MEALS } from '../../lib/util';
import type { MealType } from '../../lib/types';

export function QuickAddCard({ date }: { date: string }) {
  const { insert } = useCadenceFitness();
  const [meal, setMeal] = useState<MealType>(() => mealForHour(new Date().getHours()));
  const [name, setName] = useState('');
  const [cals, setCals] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const [saveAsMeal, setSaveAsMeal] = useState(false);
  // Double-tap guard + a brief "✓ Added" confirmation. Without the guard a
  // gym-wifi retry window meant two taps = two identical rows.
  const [addBusy, setAddBusy] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const quickAdd = async () => {
    if (addBusy || !name.trim() || !Number(cals)) return;
    setAddBusy(true);
    try {
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
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1600);
    } finally {
      setAddBusy(false);
    }
  };

  return (
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
          <input type="number" inputMode="numeric" value={cals} onChange={(e) => setCals(e.target.value)} />
        </div>
        <div>
          <label className="field">Protein (g)</label>
          <input type="number" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
        </div>
        <div>
          <label className="field">Carbs (g)</label>
          <input type="number" inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} />
        </div>
        <div>
          <label className="field">Fat (g)</label>
          <input type="number" inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} />
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
      <button className="btn btn-primary" onClick={quickAdd} disabled={addBusy || !name.trim() || !Number(cals)}>
        {addBusy ? 'Adding…' : justAdded ? '✓ Added' : `Add to ${fmtDayShort(date)}`}
      </button>
    </Card>
  );
}
