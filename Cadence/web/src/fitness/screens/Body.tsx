import { useEffect, useMemo, useRef, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric, WeightTrendChart } from '../components/bits';
import { ewmaWeightTrend, trendDelta, weightRangeStats, weightTrend } from '../lib/fitnessCalc';
import { addDays, fmtDayShort, fmtKg, fmtNum, SOURCE_LABEL, todayISO } from '../lib/util';
import {
  POSES,
  POSE_LABEL,
  comparePair,
  downscalePhoto,
  photoOwnerId,
  photoStoragePath,
  progressPhotoUrl,
  removeProgressPhotoFile,
  uploadProgressPhoto,
  weightOnOrNear,
} from '../lib/progressPhotos';
import type { PhotoPose } from '../lib/types';

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

// Renders a stored photo through a signed URL (or the demo object URL).
// Resolution is async, so hold a placeholder until the URL lands.
function PhotoImg({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void progressPhotoUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!url) return <div className="pp-img pp-img-loading" aria-label={`${alt} (loading)`} />;
  return <img className="pp-img" src={url} alt={alt} loading="lazy" />;
}

// Photo evidence for the diet. The scale argues; the mirror decides — a
// same-pose before/after with the weight delta is the whole point, so the
// compare view leads and the full timeline sits under it.
export function ProgressPhotosCard() {
  const { data, insert, remove } = useCadenceFitness();
  const today = todayISO();
  const photos = data.progress_photos.filter((p) => !p.deleted_at);

  const [pose, setPose] = useState<PhotoPose>('front');
  const [photoDate, setPhotoDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pair = comparePair(photos, pose);
  const delta =
    pair && pair.before.weight_kg != null && pair.after.weight_kg != null
      ? Number(pair.after.weight_kg) - Number(pair.before.weight_kg)
      : null;
  const daysBetween = pair
    ? Math.round(
        (new Date(pair.after.photo_date + 'T12:00:00').getTime() -
          new Date(pair.before.photo_date + 'T12:00:00').getTime()) /
          86_400_000
      )
    : 0;

  const timeline = [...photos].sort(
    (a, b) => b.photo_date.localeCompare(a.photo_date) || b.created_at.localeCompare(a.created_at)
  );

  const addPhoto = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const owner = await photoOwnerId();
      if (!owner) throw new Error('Sign in to add photos.');
      // Photos are binary — too big for the offline journal — so be honest
      // about needing a connection instead of pretending to queue.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error("No connection — photos can't be queued offline. Try again when you're back online.");
      }
      const blob = await downscalePhoto(file);
      const id = crypto.randomUUID();
      const path = photoStoragePath(owner, id);
      await uploadProgressPhoto(path, blob);
      await insert('progress_photos', {
        id,
        photo_date: photoDate,
        pose,
        storage_path: path,
        // Snapshot the weight now so later trend edits don't rewrite history.
        weight_kg: weightOnOrNear(data.body_metrics, photoDate),
        notes: '',
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "That photo didn't save — please try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deletePhoto = async (id: string, path: string) => {
    await remove('progress_photos', id);
    void removeProgressPhotoFile(path);
  };

  return (
    <Card title="Progress photos">
      <div className="pp-controls">
        <div className="rec-range">
          {POSES.map((p) => (
            <button key={p} className={pose === p ? 'active' : ''} onClick={() => setPose(p)}>
              {POSE_LABEL[p]}
              {photos.some((ph) => ph.pose === p) ? ` · ${photos.filter((ph) => ph.pose === p).length}` : ''}
            </button>
          ))}
        </div>
        <div className="pp-add">
          <input
            type="date"
            aria-label="Photo date"
            value={photoDate}
            max={today}
            onChange={(e) => setPhotoDate(e.target.value)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            aria-label="Progress photo file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addPhoto(f);
            }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Saving…' : `+ ${POSE_LABEL[pose]} photo`}
          </button>
        </div>
      </div>
      {error && (
        <p className="pp-error" role="alert">
          {error}
        </p>
      )}

      {pair ? (
        <div className="pp-compare">
          <figure className="pp-compare-cell">
            <PhotoImg path={pair.before.storage_path} alt={`Before — ${POSE_LABEL[pose]}, ${fmtDayShort(pair.before.photo_date)}`} />
            <figcaption>
              <strong>{fmtDayShort(pair.before.photo_date)}</strong>
              <span>{pair.before.weight_kg != null ? fmtKg(Number(pair.before.weight_kg)) : '—'}</span>
            </figcaption>
          </figure>
          <div className="pp-compare-delta">
            <span className={`pp-delta ${delta == null ? '' : delta <= 0 ? 'good' : 'bad'}`}>
              {delta == null ? '—' : `${delta > 0 ? '+' : ''}${fmtNum(delta, 1)}kg`}
            </span>
            <span className="pp-delta-days">{daysBetween} days</span>
          </div>
          <figure className="pp-compare-cell">
            <PhotoImg path={pair.after.storage_path} alt={`After — ${POSE_LABEL[pose]}, ${fmtDayShort(pair.after.photo_date)}`} />
            <figcaption>
              <strong>{fmtDayShort(pair.after.photo_date)}</strong>
              <span>{pair.after.weight_kg != null ? fmtKg(Number(pair.after.weight_kg)) : '—'}</span>
            </figcaption>
          </figure>
        </div>
      ) : (
        <p className="pp-empty">
          {photos.some((p) => p.pose === pose)
            ? `One ${POSE_LABEL[pose].toLowerCase()} photo so far — add another later and the before/after appears here.`
            : `No ${POSE_LABEL[pose].toLowerCase()} photos yet. Take one today — future you wants the “before”.`}
        </p>
      )}

      {timeline.length > 0 && (
        <div className="pp-grid">
          {timeline.map((p) => (
            <figure key={p.id} className="pp-thumb">
              <PhotoImg path={p.storage_path} alt={`${POSE_LABEL[p.pose]} — ${fmtDayShort(p.photo_date)}`} />
              <figcaption>
                <span className="pp-thumb-date">{fmtDayShort(p.photo_date)}</span>
                <span className="pp-thumb-meta">
                  {POSE_LABEL[p.pose]}
                  {p.weight_kg != null ? ` · ${fmtKg(Number(p.weight_kg))}` : ''}
                </span>
              </figcaption>
              <button
                className="pp-thumb-del"
                aria-label={`Delete ${POSE_LABEL[p.pose]} photo from ${fmtDayShort(p.photo_date)}`}
                onClick={() => void deletePhoto(p.id, p.storage_path)}
              >
                ✕
              </button>
            </figure>
          ))}
        </div>
      )}
    </Card>
  );
}

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

        <ProgressPhotosCard />

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
