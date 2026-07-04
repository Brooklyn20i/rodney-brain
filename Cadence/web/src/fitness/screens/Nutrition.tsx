import { useRef, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { supabase } from '../../lib/supabase';
import { ScreenHeader, Card, Tag } from '../components/bits';
import { dayNutrition, targetFor } from '../lib/fitnessCalc';
import { addDays, fmtDayShort, fmtNum, MEAL_LABEL, MEALS, PHASE_LABEL, todayISO } from '../lib/util';
import type { MealType, NutritionPhase } from '../lib/types';

interface PhotoEstimate {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'low' | 'medium' | 'high';
  notes: string;
}

// Downscale a photo before upload: vision doesn't need 12MP, and mobile
// uploads should stay small. Longest edge 1024px, JPEG q0.8.
async function fileToBase64Jpeg(file: File): Promise<{ base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

// Daily calories + macros: quick entry, one-tap saved meals, phased targets.
// Deliberately totals-first (not a food database) -- 90% of the MacroFactor
// value at a fraction of the friction; Kobe can log entries via MCP too.
export function Nutrition({ onMenu }: { onMenu: () => void }) {
  const { data, insert, remove } = useCadenceFitness();
  const [date, setDate] = useState(todayISO());

  const logs = data.nutrition_logs.filter((l) => l.date === date);
  const totals = dayNutrition(data.nutrition_logs, date);
  const target = targetFor(data.nutrition_targets, date);

  // ── Photo logging ─────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [estimate, setEstimate] = useState<PhotoEstimate | null>(null);
  const [estMeal, setEstMeal] = useState<MealType>('lunch');
  const [preview, setPreview] = useState<string | null>(null);

  const onPhotoPicked = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError('');
    setEstimate(null);
    setPhotoBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const { base64, mediaType } = await fileToBase64Jpeg(file);
      const { data: est, error } = await supabase.functions.invoke('food-vision', {
        body: { image_base64: base64, media_type: mediaType },
      });
      if (error) throw new Error(error.message || 'Estimate failed');
      if (est?.error) throw new Error(est.error);
      setEstimate(est as PhotoEstimate);
      const hour = new Date().getHours();
      setEstMeal(hour < 10 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 20 ? 'dinner' : 'snack');
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Could not read the photo — try again or enter it manually.');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearPhoto = () => {
    setEstimate(null);
    setPhotoError('');
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const logEstimate = async () => {
    if (!estimate) return;
    await insert('nutrition_logs', {
      date,
      meal: estMeal,
      name: estimate.name,
      calories: estimate.calories,
      protein_g: estimate.protein_g,
      carbs_g: estimate.carbs_g,
      fat_g: estimate.fat_g,
      notes: estimate.notes ? `Photo estimate (${estimate.confidence}): ${estimate.notes}` : 'Photo estimate',
    });
    clearPhoto();
  };

  // Quick add form
  const [meal, setMeal] = useState<MealType>('snack');
  const [name, setName] = useState('');
  const [cals, setCals] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const [saveAsMeal, setSaveAsMeal] = useState(false);
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
    await insert('nutrition_logs', {
      date,
      meal: m.meal,
      name: m.name,
      calories: m.calories,
      protein_g: Number(m.protein_g),
      carbs_g: Number(m.carbs_g),
      fat_g: Number(m.fat_g),
      notes: '',
    });
  };

  // Targets editor
  const [showTargets, setShowTargets] = useState(false);
  const [tPhase, setTPhase] = useState<NutritionPhase>('maintain');
  const [tCals, setTCals] = useState('');
  const [tP, setTP] = useState('');
  const [tC, setTC] = useState('');
  const [tF, setTF] = useState('');
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
    <>
      <ScreenHeader title="Nutrition" subtitle="Calories and macros vs target." onMenu={onMenu}>
        <button className="btn btn-secondary btn-sm" onClick={() => setDate(addDays(date, -1))}>
          ←
        </button>
        <input type="date" value={date} style={{ width: 150 }} onChange={(e) => setDate(e.target.value)} />
        <button className="btn btn-secondary btn-sm" onClick={() => setDate(addDays(date, 1))} disabled={date >= todayISO()}>
          →
        </button>
      </ScreenHeader>
      <div className="screen-content">
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
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setShowTargets(!showTargets)}>
            {showTargets ? 'Hide targets' : 'Set targets'}
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
                  <input type="number" inputMode="numeric" value={tCals} onChange={(e) => setTCals(e.target.value)} />
                </div>
                <div>
                  <label className="field">Protein (g)</label>
                  <input type="number" inputMode="numeric" value={tP} onChange={(e) => setTP(e.target.value)} />
                </div>
                <div>
                  <label className="field">Carbs (g)</label>
                  <input type="number" inputMode="numeric" value={tC} onChange={(e) => setTC(e.target.value)} />
                </div>
                <div>
                  <label className="field">Fat (g)</label>
                  <input type="number" inputMode="numeric" value={tF} onChange={(e) => setTF(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveTargets} disabled={!Number(tCals)}>
                Save targets from {fmtDayShort(date)}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Targets are phased: the newest row on or before a day applies, so past days keep their old targets.
              </p>
            </div>
          )}
        </Card>

        {data.saved_meals.length > 0 && (
          <Card title="Saved meals — one tap to log">
            {[...data.saved_meals]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((m) => (
                <div key={m.id} className="pick-row">
                  <div className="pick-main">
                    <div className="pick-title">{m.name}</div>
                    <div className="pick-sub">
                      {MEAL_LABEL[m.meal]} · {m.calories} kcal · P{fmtNum(Number(m.protein_g))} C{fmtNum(Number(m.carbs_g))} F
                      {fmtNum(Number(m.fat_g))}
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => logSaved(m.id)}>
                    Log
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove('saved_meals', m.id)}>
                    ✕
                  </button>
                </div>
              ))}
          </Card>
        )}

        <Card title="Log from a photo">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => onPhotoPicked(e.target.files?.[0])}
          />
          {!estimate && !photoBusy && (
            <>
              <button className="btn btn-primary nu-photo-btn" onClick={() => fileRef.current?.click()}>
                📷 Snap your meal
              </button>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                Kobe estimates calories and macros from the photo — you review before it's logged.
              </p>
            </>
          )}
          {photoBusy && (
            <div className="nu-photo-review">
              {preview && <img src={preview} alt="Your meal" className="nu-photo-thumb" />}
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>Estimating…</p>
            </div>
          )}
          {photoError && (
            <p style={{ fontSize: 13, color: 'var(--red)', marginTop: 8 }}>
              {photoError}
            </p>
          )}
          {estimate && (
            <div className="nu-photo-review">
              {preview && <img src={preview} alt="Your meal" className="nu-photo-thumb" />}
              <div className="form-grid" style={{ marginTop: 10 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="field">What</label>
                  <input
                    type="text"
                    value={estimate.name}
                    onChange={(e) => setEstimate({ ...estimate, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field">Meal</label>
                  <select value={estMeal} onChange={(e) => setEstMeal(e.target.value as MealType)}>
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
                    value={estimate.calories || ''}
                    onChange={(e) => setEstimate({ ...estimate, calories: Math.round(Number(e.target.value) || 0) })}
                  />
                </div>
                <div>
                  <label className="field">Protein (g)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={estimate.protein_g || ''}
                    onChange={(e) => setEstimate({ ...estimate, protein_g: Math.round(Number(e.target.value) || 0) })}
                  />
                </div>
                <div>
                  <label className="field">Carbs (g)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={estimate.carbs_g || ''}
                    onChange={(e) => setEstimate({ ...estimate, carbs_g: Math.round(Number(e.target.value) || 0) })}
                  />
                </div>
                <div>
                  <label className="field">Fat (g)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={estimate.fat_g || ''}
                    onChange={(e) => setEstimate({ ...estimate, fat_g: Math.round(Number(e.target.value) || 0) })}
                  />
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0 10px' }}>
                <Tag label={`${estimate.confidence} confidence`} tone={estimate.confidence === 'high' ? 'good' : estimate.confidence === 'low' ? 'warn' : 'info'} />{' '}
                {estimate.notes}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={logEstimate} disabled={!estimate.calories}>
                  Add to {fmtDayShort(date)}
                </button>
                <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                  Retake
                </button>
                <button className="btn btn-ghost" onClick={clearPhoto}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card title="Quick add">
          <div className="form-grid">
            <div style={{ gridColumn: 'span 2' }}>
              <label className="field">What</label>
              <input type="text" value={name} placeholder="e.g. Chicken, rice & greens" onChange={(e) => setName(e.target.value)} />
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
                <input type="checkbox" style={{ width: 'auto' }} checked={saveAsMeal} onChange={(e) => setSaveAsMeal(e.target.checked)} />
                Save as meal
              </label>
            </div>
          </div>
          <button className="btn btn-primary" onClick={quickAdd} disabled={!name.trim() || !Number(cals)}>
            Add to {fmtDayShort(date)}
          </button>
        </Card>

        <Card title="Logged">
          {MEALS.filter((m) => logs.some((l) => l.meal === m)).map((m) => (
            <div key={m}>
              <div className="cf-card-title nu-meal-head" style={{ margin: '8px 0 2px' }}>
                <span>{MEAL_LABEL[m]}</span>
                <span className="nu-meal-total">
                  {fmtNum(logs.filter((l) => l.meal === m).reduce((s, l) => s + Number(l.calories), 0))} kcal · P
                  {fmtNum(logs.filter((l) => l.meal === m).reduce((s, l) => s + Number(l.protein_g), 0))}
                </span>
              </div>
              {logs
                .filter((l) => l.meal === m)
                .map((l) => (
                  <div key={l.id} className="pick-row">
                    <div className="pick-main">
                      <div className="pick-title">{l.name}</div>
                      <div className="pick-sub">
                        {l.calories} kcal · P{fmtNum(Number(l.protein_g))} C{fmtNum(Number(l.carbs_g))} F{fmtNum(Number(l.fat_g))}
                      </div>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => remove('nutrition_logs', l.id)}>
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          ))}
          {logs.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nothing logged for this day.</p>}
        </Card>
      </div>
    </>
  );
}
