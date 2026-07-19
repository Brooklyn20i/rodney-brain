// The day's log, grouped by meal, with per-entry edit-in-place (name, macros,
// meal slot), delete, and "☆ Save" to promote a one-off entry to the
// saved-food library without retyping.

import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../../lib/store';
import { Card } from '../bits';
import { normaliseFoodName } from '../../lib/nutritionQuickLog';
import { fmtNum, MEAL_LABEL, MEALS } from '../../lib/util';
import type { MealType, NutritionLog } from '../../lib/types';

interface EditForm {
  name: string;
  meal: MealType;
  cals: string;
  p: string;
  c: string;
  f: string;
}

export function LoggedCard({ date }: { date: string }) {
  const { data, insert, update, remove } = useCadenceFitness();
  const logs = data.nutrition_logs.filter((l) => l.date === date);
  const savedNames = useMemo(
    () => new Set(data.saved_meals.map((m) => normaliseFoodName(m.name))),
    [data.saved_meals]
  );

  // Edit-in-place: one row at a time, seeded from the stored entry. Fixes the
  // delete-and-retype dance a typo used to cost.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({ name: '', meal: 'snack', cals: '', p: '', c: '', f: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const startEdit = (l: NutritionLog) => {
    setEditingId(l.id);
    setForm({
      name: l.name,
      meal: l.meal,
      cals: String(Number(l.calories) || 0),
      p: String(Number(l.protein_g) || 0),
      c: String(Number(l.carbs_g) || 0),
      f: String(Number(l.fat_g) || 0),
    });
  };
  const saveEdit = async () => {
    if (!editingId || savingEdit || !form.name.trim()) return;
    setSavingEdit(true);
    try {
      await update('nutrition_logs', editingId, {
        name: form.name.trim(),
        meal: form.meal,
        calories: Math.round(Number(form.cals)) || 0,
        protein_g: Number(form.p) || 0,
        carbs_g: Number(form.c) || 0,
        fat_g: Number(form.f) || 0,
      });
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  };

  // Promote a one-off logged entry to the saved-food library from the log row
  // itself — no retyping into Quick add.
  const saveLogAsFood = async (logId: string) => {
    const l = logs.find((x) => x.id === logId);
    if (!l) return;
    await insert('saved_meals', {
      meal: l.meal,
      name: l.name.replace(/ × \d+(\.\d+)?$/, '').trim(),
      calories: Number(l.calories) || 0,
      protein_g: Number(l.protein_g) || 0,
      carbs_g: Number(l.carbs_g) || 0,
      fat_g: Number(l.fat_g) || 0,
      notes: '',
    });
  };

  return (
    <Card title="Logged">
      {MEALS.filter((m) => logs.some((l) => l.meal === m)).map((m) => (
        <div key={m}>
          <div className="cf-card-title nu-meal-head" style={{ margin: '8px 0 2px' }}>
            <span>{MEAL_LABEL[m]}</span>
            <span className="nu-meal-total">
              {fmtNum(logs.filter((l) => l.meal === m).reduce((s, l) => s + Number(l.calories), 0))}{' '}
              kcal · P
              {fmtNum(logs.filter((l) => l.meal === m).reduce((s, l) => s + Number(l.protein_g), 0))}
            </span>
          </div>
          {logs
            .filter((l) => l.meal === m)
            .map((l) =>
              editingId === l.id ? (
                <div key={l.id} className="nu-log-edit">
                  <div className="form-grid">
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="field" htmlFor={`nu-edit-name-${l.id}`}>What</label>
                      <input
                        id={`nu-edit-name-${l.id}`}
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((x) => ({ ...x, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field" htmlFor={`nu-edit-meal-${l.id}`}>Meal</label>
                      <select
                        id={`nu-edit-meal-${l.id}`}
                        value={form.meal}
                        onChange={(e) => setForm((x) => ({ ...x, meal: e.target.value as MealType }))}
                      >
                        {MEALS.map((mm) => (
                          <option key={mm} value={mm}>
                            {MEAL_LABEL[mm]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="field" htmlFor={`nu-edit-cals-${l.id}`}>Calories</label>
                      <input
                        id={`nu-edit-cals-${l.id}`}
                        type="number"
                        inputMode="numeric"
                        value={form.cals}
                        onChange={(e) => setForm((x) => ({ ...x, cals: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field" htmlFor={`nu-edit-p-${l.id}`}>Protein (g)</label>
                      <input
                        id={`nu-edit-p-${l.id}`}
                        type="number"
                        inputMode="decimal"
                        value={form.p}
                        onChange={(e) => setForm((x) => ({ ...x, p: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field" htmlFor={`nu-edit-c-${l.id}`}>Carbs (g)</label>
                      <input
                        id={`nu-edit-c-${l.id}`}
                        type="number"
                        inputMode="decimal"
                        value={form.c}
                        onChange={(e) => setForm((x) => ({ ...x, c: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field" htmlFor={`nu-edit-f-${l.id}`}>Fat (g)</label>
                      <input
                        id={`nu-edit-f-${l.id}`}
                        type="number"
                        inputMode="decimal"
                        value={form.f}
                        onChange={(e) => setForm((x) => ({ ...x, f: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="nu-log-edit-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={saveEdit}
                      disabled={savingEdit || !form.name.trim()}
                    >
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={l.id} className="pick-row">
                  <div className="pick-main">
                    <div className="pick-title">{l.name}</div>
                    <div className="pick-sub">
                      {l.calories} kcal · P{fmtNum(Number(l.protein_g))} C
                      {fmtNum(Number(l.carbs_g))} F{fmtNum(Number(l.fat_g))}
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    aria-label={`Edit logged ${l.name}`}
                    onClick={() => startEdit(l)}
                  >
                    ✎
                  </button>
                  {!savedNames.has(normaliseFoodName(l.name)) && (
                    <button
                      className="btn btn-secondary btn-sm"
                      aria-label={`Save ${l.name} to foods`}
                      title="Save to foods for one-tap logging next time"
                      onClick={() => saveLogAsFood(l.id)}
                    >
                      ☆ Save
                    </button>
                  )}
                  <button
                    className="btn btn-danger btn-sm"
                    aria-label={`Delete logged ${l.name}`}
                    onClick={() => remove('nutrition_logs', l.id)}
                  >
                    ✕
                  </button>
                </div>
              )
            )}
        </div>
      ))}
      {logs.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nothing logged for this day.</p>}
    </Card>
  );
}
