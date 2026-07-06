import { useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric, SparkBars } from '../components/bits';
import { trendDelta, weightTrend } from '../lib/fitnessCalc';
import { fmtDayShort, fmtKg, fmtNum, SOURCE_LABEL, todayISO } from '../lib/util';

// Scale data (Renpho or manual): daily weight + body fat, with a 7-day
// moving-average trend so single weigh-ins don't cause panic. One row per
// day -- re-saving a day updates it. Renpho API sync is a planned phase-2.
export function Body({ onMenu }: { onMenu: () => void }) {
  const { data, upsert, remove } = useCadenceFitness();
  const today = todayISO();

  const rows = [...data.body_metrics].sort((a, b) => b.date.localeCompare(a.date));
  const latestBody = rows[0];
  const trend = weightTrend(data.body_metrics);
  const latest = trend[trend.length - 1];
  const delta7 = trendDelta(trend, 7);
  const delta28 = trendDelta(trend, 28);

  const [date, setDate] = useState(today);
  const existing = data.body_metrics.find((m) => m.date === date);
  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');

  const save = async () => {
    const patch = {
      weight_kg: weight === '' ? Number(existing?.weight_kg ?? 0) : Number(weight),
      body_fat_pct: fat === '' ? (existing?.body_fat_pct ?? null) : Number(fat),
      source: 'renpho' as const,
    };
    if (!patch.weight_kg) return;
    // Upsert on (owner_id, date): re-saving a day updates it even if the
    // in-memory `existing` lookup is stale, instead of hitting the UNIQUE
    // constraint. Columns omitted here keep their values on update.
    await upsert('body_metrics', { date, ...patch }, 'owner_id,date');
    setWeight('');
    setFat('');
  };

  const spark = trend.slice(-30).map((p) => ({ label: fmtDayShort(p.date), value: Number(p.weight_kg) }));
  const metricValue = (value: number | null | undefined, unit = '', decimals = 1) =>
    value == null ? '—' : `${fmtNum(Number(value), decimals)}${unit}`;
  const metricKg = (value: number | null | undefined) => (value == null ? '—' : fmtKg(Number(value)));

  return (
    <>
      <ScreenHeader title="Body" subtitle="Weight and body fat from the Renpho scale." onMenu={onMenu} />
      <div className="screen-content">
        <div className="cf-metric-grid">
          <Metric label="Weight (latest)" value={latest ? fmtKg(latest.weight_kg) : '—'} />
          <Metric label="Trend (7d avg)" value={latest ? fmtKg(latest.avg) : '—'} />
          <Metric
            label="Change / week"
            value={delta7 !== null ? `${delta7 >= 0 ? '+' : ''}${fmtNum(delta7, 2)}kg` : '—'}
            tone={delta7 === null ? 'neutral' : delta7 <= 0 ? 'good' : 'bad'}
          />
          <Metric
            label="Change / 4 weeks"
            value={delta28 !== null ? `${delta28 >= 0 ? '+' : ''}${fmtNum(delta28, 2)}kg` : '—'}
            tone={delta28 === null ? 'neutral' : delta28 <= 0 ? 'good' : 'bad'}
          />
        </div>

        {spark.length > 1 && (
          <Card title="Weight, last 30 entries">
            <SparkBars points={spark} formatTip={(p) => `${p.label}: ${p.value}kg`} />
          </Card>
        )}

        {latestBody && (
          <Card title={`Latest body composition — ${fmtDayShort(latestBody.date)}`}>
            <div className="cf-metric-grid">
              <Metric label="Body fat mass" value={metricKg(latestBody.body_fat_mass_kg)} />
              <Metric label="Fat-free mass" value={metricKg(latestBody.fat_free_mass_kg)} />
              <Metric label="Skeletal muscle" value={metricKg(latestBody.skeletal_muscle_mass_kg)} />
              <Metric label="Muscle mass" value={metricKg(latestBody.muscle_mass_kg)} />
              <Metric label="BMI" value={metricValue(latestBody.bmi, '', 1)} />
              <Metric label="BMR" value={latestBody.bmr_kcal != null ? `${Math.round(Number(latestBody.bmr_kcal))} kcal` : '—'} />
              <Metric label="Visceral fat" value={metricValue(latestBody.visceral_fat, '', 1)} />
              <Metric label="Subcutaneous fat" value={metricValue(latestBody.subcutaneous_fat_pct, '%', 1)} />
              <Metric label="Body water" value={metricKg(latestBody.body_water_mass_kg)} />
              <Metric label="Bone mass" value={metricKg(latestBody.bone_mass_kg)} />
              <Metric label="Protein mass" value={metricKg(latestBody.protein_mass_kg)} />
              <Metric label="WHR" value={metricValue(latestBody.whr, '', 2)} />
              <Metric label="SMI" value={latestBody.smi_kg_m2 != null ? `${fmtNum(Number(latestBody.smi_kg_m2), 1)} kg/m²` : '—'} />
              <Metric label="Metabolic age" value={latestBody.metabolic_age != null ? String(Math.round(Number(latestBody.metabolic_age))) : '—'} />
              <Metric label="Body score" value={latestBody.body_score != null ? `${Math.round(Number(latestBody.body_score))}/100` : '—'} />
            </div>
          </Card>
        )}

        <Card title={existing ? `Update ${fmtDayShort(date)}` : `Log ${fmtDayShort(date)}`}>
          <div className="form-grid">
            <div>
              <label className="field">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="field">Weight (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weight}
                placeholder={existing ? String(Number(existing.weight_kg)) : 'from Renpho'}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <div>
              <label className="field">Body fat %</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={fat}
                placeholder={existing?.body_fat_pct != null ? String(Number(existing.body_fat_pct)) : 'optional'}
                onChange={(e) => setFat(e.target.value)}
              />
            </div>
          </div>
          <button className="btn btn-primary" onClick={save} disabled={weight === '' && !existing}>
            {existing ? 'Update day' : 'Save day'}
          </button>
        </Card>

        <Card title="Recent entries">
          <div className="cf-table-wrap">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Weight</th>
                  <th>Body fat</th>
                  <th>Fat mass</th>
                  <th>Skeletal muscle</th>
                  <th>BMI</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 21).map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDayShort(m.date)}</td>
                    <td>{fmtKg(Number(m.weight_kg))}</td>
                    <td>{m.body_fat_pct != null ? `${fmtNum(Number(m.body_fat_pct), 1)}%` : '—'}</td>
                    <td>{metricKg(m.body_fat_mass_kg)}</td>
                    <td>{metricKg(m.skeletal_muscle_mass_kg)}</td>
                    <td>{metricValue(m.bmi, '', 1)}</td>
                    <td>{SOURCE_LABEL[m.source]}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => remove('body_metrics', m.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>No weigh-ins yet.</p>}
        </Card>
      </div>
    </>
  );
}
