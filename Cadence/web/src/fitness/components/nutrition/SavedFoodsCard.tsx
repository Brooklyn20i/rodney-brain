// The primary logging path: one tap logs a saved food. Open by default,
// searchable, ± portion steppers, and a "Log to" meal slot that defaults to
// the time of day (a saved food's stored meal is just where it was first
// logged). Double-tap guarded with a brief "✓ Logged" confirmation.

import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../../lib/store';
import { Card } from '../bits';
import {
  buildSavedFoodPicker,
  mealForHour,
  normalisePortion,
  quickLogFromSavedFood,
  scaleMacros,
} from '../../lib/nutritionQuickLog';
import { fmtNum, MEAL_LABEL, MEALS } from '../../lib/util';
import type { MealType } from '../../lib/types';

export function SavedFoodsCard({ date }: { date: string }) {
  const { data, insert, remove } = useCadenceFitness();
  const [savedFoodQuery, setSavedFoodQuery] = useState('');
  const [savedFoodQty, setSavedFoodQty] = useState<Record<string, string>>({});
  const [showSaved, setShowSaved] = useState(true);
  const [logMeal, setLogMeal] = useState<MealType>(() => mealForHour(new Date().getHours()));
  const [busySavedId, setBusySavedId] = useState<string | null>(null);
  const [justLoggedId, setJustLoggedId] = useState<string | null>(null);

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

  const logSaved = async (id: string) => {
    if (busySavedId) return;
    const m = data.saved_meals.find((x) => x.id === id);
    if (!m) return;
    setBusySavedId(id);
    try {
      const qty = normalisePortion(savedFoodQty[id] ?? '1');
      await insert('nutrition_logs', quickLogFromSavedFood(m, date, qty, logMeal));
      setSavedFoodQty((prev) => ({ ...prev, [id]: '1' }));
      setJustLoggedId(id);
      setTimeout(() => setJustLoggedId((cur) => (cur === id ? null : cur)), 1600);
    } finally {
      setBusySavedId(null);
    }
  };

  const stepQty = (id: string, delta: number) => {
    const current = normalisePortion(savedFoodQty[id] ?? '1');
    const next = Math.min(10, Math.max(0.5, Math.round((current + delta) * 10) / 10));
    setSavedFoodQty((prev) => ({ ...prev, [id]: String(next) }));
  };

  return (
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
          <div className="nu-saved-search">
            <input
              type="search"
              value={savedFoodQuery}
              placeholder="Search saved foods…"
              onChange={(e) => setSavedFoodQuery(e.target.value)}
            />
            <label className="nu-log-to">
              Log to
              <select value={logMeal} onChange={(e) => setLogMeal(e.target.value as MealType)}>
                {MEALS.map((m) => (
                  <option key={m} value={m}>
                    {MEAL_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {data.saved_meals.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
              No saved foods yet. Use <strong>Quick add</strong> below with “Save to foods” to
              build your list.
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
                        {scaled.calories} kcal · P{fmtNum(scaled.protein_g)} C
                        {fmtNum(scaled.carbs_g)} F{fmtNum(scaled.fat_g)}
                        {portion !== 1 ? ` · ×${portion}` : ''}
                      </div>
                    </div>
                    <div className="nu-saved-actions">
                      <div className="nu-qty-group">
                        <button
                          className="nu-qty-btn"
                          aria-label={`Decrease quantity for ${m.name}`}
                          onClick={() => stepQty(m.id, -0.5)}
                        >
                          −
                        </button>
                        <input
                          aria-label={`Quantity for ${m.name}`}
                          type="number"
                          inputMode="decimal"
                          min="0.1"
                          max="10"
                          step="0.5"
                          value={qty}
                          onChange={(e) => setSavedFoodQty((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        />
                        <button
                          className="nu-qty-btn"
                          aria-label={`Increase quantity for ${m.name}`}
                          onClick={() => stepQty(m.id, 0.5)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        className={`btn btn-sm ${justLoggedId === m.id ? 'btn-secondary' : 'btn-primary'}`}
                        disabled={busySavedId !== null}
                        onClick={() => logSaved(m.id)}
                      >
                        {justLoggedId === m.id ? '✓ Logged' : busySavedId === m.id ? '…' : 'Log'}
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
              Showing your {savedFoodPicker.visible.length} most recent of {savedFoodPicker.total}.
              Search to find the rest.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
