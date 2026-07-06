import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric, WeightTrendChart } from '../components/bits';
import { ewmaWeightTrend, trendDelta, weightRangeStats, weightTrend } from '../lib/fitnessCalc';
import { addDays, fmtDayShort, fmtKg, fmtNum, SOURCE_LABEL, todayISO } from '../lib/util';

type WRange = '1w' | '1m' | '3m' | '6m' | '1y' | 'all';
const WEIGHT_RANGES: { key: WRange; label: string; days: number | null }[] = [
  { key: '1w', label: '1W', days: 7 },
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 90 },
  { key: '6m', label: '6M', days: 182 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All', days: null },
];

// '28 Jul 2025'
const fmtRangeDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

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

  // MacroFactor-style trend: EWMA over all history, sliced to the chosen window
  // (computed on the full series so the trend entering the window is warmed up).
  const [wRange, setWRange] = useState<WRange>('3m');
  const fullTrend = useMemo(() => ewmaWeightTrend(data.body_metrics), [data.body_metrics]);
  const rangeDays = WEIGHT_RANGES.find((r) => r.key === wRange)!.days;
  const shownTrend = useMemo(() => {
    if (rangeDays == null) return fullTrend;
    const cutoff = addDays(today, -rangeDays);
    return fullTrend.filter((p) => p.date >= cutoff);
  }, [fullTrend, rangeDays, today]);
  const wStats = weightRangeStats(shownTrend);

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

  const metricValue = (value: number | null | undefined, unit = '', decimals = 1) =>
    value == null ? '—' : `${fmtNum(Number(value), decimals)}${unit}`;
  const metricKg = (value: number | null | undefined) => (value == null ? '—' : fmtKg(Number(value)));

  return (
    <>
      <ScreenHeader title="Body" subtitle="Weight and body fat from the Renpho scale." onMenu={onMenu} />
      <div className="screen-content">
        <Card title="Weight trend">
          <div className="wt-head">
            <div className="wt-stat">
              <span className="wt-stat-label">Average</span>
              <span className="wt-stat-value">
                {wStats ? fmtNum(wStats.averageKg, 1) : '—'}
                <span className="wt-unit">kg</span>
              </span>
            </div>
            <div className="wt-stat">
              <span className="wt-stat-label">Difference</span>
              <span className={`wt-stat-value ${wStats ? (wStats.differenceKg <= 0 ? 'good' : 'bad') : ''}`}>
                {wStats ? `${wStats.differenceKg > 0 ? '+' : ''}${fmtNum(wStats.differenceKg, 1)}` : '—'}
                <span className="wt-unit">kg</span>
              </span>
            </div>
            {wStats && (
              <div className="wt-stat" style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                <span className="wt-range-caption">
                  {fmtRangeDate(wStats.startDate)} – {fmtRangeDate(wStats.endDate)}
                </span>
              </div>
            )}
          </div>

          <div className="rec-range" style={{ marginBottom: 12 }}>
            {WEIGHT_RANGES.map((r) => (
              <button key={r.key} className={wRange === r.key ? 'active' : ''} onClick={() => setWRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>

          <WeightTrendChart points={shownTrend} />

          <div className="wt-legend">
            <span>
              <i className="scale" /> Scale weight
            </span>
            <span>
              <i className="trend" /> Trend weight
            </span>
          </div>
        </Card>

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
