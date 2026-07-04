// ── Recovery drivers ────────────────────────────────────────────────────────
// What actually moves recovery, learned from the whole picture — Whoop plus
// the workouts, cardio, sauna and nutrition logged in the same app. Each
// "driver" contrasts recovery under a condition vs without it (e.g. the day
// after a sauna vs otherwise), with a Welch t-test so weak/noisy signals are
// held back rather than dressed up as findings. Association, not proof — and
// only shown when there's enough data to mean something.

import type { CardioSession, NutritionLog, RecoveryMetric, SaunaSession, Workout, WorkoutSet } from './types';

// The slice of the app's data the driver analysis needs.
export interface InsightInput {
  recovery_metrics: RecoveryMetric[];
  workouts: Workout[];
  workout_sets: WorkoutSet[];
  cardio_sessions: CardioSession[];
  sauna_sessions: SaunaSession[];
  nutrition_logs: NutritionLog[];
}

function addDay(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const variance = (xs: number[], m: number) =>
  xs.length > 1 ? xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) : 0;

export interface Contrast {
  nWith: number;
  nWithout: number;
  meanWith: number;
  meanWithout: number;
  delta: number; // with − without
  t: number; // Welch's t statistic (magnitude used for confidence)
}

// Welch's two-sample t between the "condition holds" group and the rest.
export function welchContrast(withVals: number[], withoutVals: number[]): Contrast {
  const m1 = mean(withVals);
  const m2 = mean(withoutVals);
  const v1 = variance(withVals, m1);
  const v2 = variance(withoutVals, m2);
  const se = Math.sqrt(v1 / Math.max(1, withVals.length) + v2 / Math.max(1, withoutVals.length));
  const t = se > 0 ? (m1 - m2) / se : 0;
  return { nWith: withVals.length, nWithout: withoutVals.length, meanWith: m1, meanWithout: m2, delta: m1 - m2, t };
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Driver {
  id: string;
  label: string; // "After a sauna"
  detail: string; // "the day after a sauna session"
  target: 'recovery';
  meanWith: number;
  meanWithout: number;
  delta: number; // direction-aware sign kept (with − without)
  pct: number; // delta / without
  nWith: number;
  nWithout: number;
  confidence: Confidence;
  helps: boolean; // does the condition associate with better recovery
  sentence: string;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

// Build the raw materials once: recovery/strain/sleep by date, and the set of
// days each behaviour happened on.
function buildFrame(input: InsightInput) {
  const recovery = new Map<string, number>();
  const strain = new Map<string, number>();
  const sleep = new Map<string, number>();
  for (const r of input.recovery_metrics) {
    if (r.deleted_at) continue;
    const rec = num(r.recovery_pct);
    if (rec != null) recovery.set(r.date, rec);
    const st = num(r.strain);
    if (st != null) strain.set(r.date, st);
    const sl = num(r.sleep_hours);
    if (sl != null) sleep.set(r.date, sl);
  }
  const liftDays = new Set(
    input.workouts.filter((w) => !w.deleted_at && w.status === 'completed').map((w) => w.date)
  );
  const cardioDays = new Set(input.cardio_sessions.filter((c) => !c.deleted_at).map((c) => c.date));
  const saunaDays = new Set(input.sauna_sessions.filter((s) => !s.deleted_at).map((s) => s.date));
  const proteinByDate = new Map<string, number>();
  for (const l of input.nutrition_logs) {
    if (l.deleted_at) continue;
    proteinByDate.set(l.date, (proteinByDate.get(l.date) ?? 0) + Number(l.protein_g));
  }
  return { recovery, strain, sleep, liftDays, cardioDays, saunaDays, proteinByDate };
}

// Minimum group sizes and effect thresholds — below these we don't claim a
// finding. Recovery is a 0–100 scale; a <2-point difference isn't worth a card.
// MIN_N is deliberately conservative: with ~6 hypotheses tested, small samples
// throw false positives, so a behaviour needs ~3 weeks of days before it can
// surface a driver, and the t-thresholds lean strict (multiple comparisons).
const MIN_N = 20;
const MIN_ABS_DELTA = 2;

function confidenceOf(t: number, nWith: number, nWithout: number): Confidence | null {
  if (nWith < MIN_N || nWithout < MIN_N) return null;
  const a = Math.abs(t);
  if (a >= 2.8) return 'high'; // ~p < 0.005
  if (a >= 2.1) return 'medium'; // ~p < 0.04
  return null; // not distinguishable from noise
}

// A lag driver: does behaviour on day D associate with recovery on day D+1?
// Partitions every recovery day by whether the prior day had the behaviour.
function lagDriver(
  frame: ReturnType<typeof buildFrame>,
  behaviourDays: Set<string>,
  id: string,
  label: string,
  detail: string
): Driver | null {
  const withVals: number[] = [];
  const withoutVals: number[] = [];
  for (const [date, rec] of frame.recovery) {
    const prev = addDay(date, -1);
    if (!frame.recovery.has(prev) && !behaviourDays.has(prev)) continue; // only compare adjacent-day pairs we can trust
    (behaviourDays.has(prev) ? withVals : withoutVals).push(rec);
  }
  return finishDriver(id, label, detail, withVals, withoutVals);
}

// A same-/prior-day split by a numeric threshold (e.g. sleep ≥7h vs <6.5h),
// evaluated against same-day recovery.
function thresholdDriver(
  frame: ReturnType<typeof buildFrame>,
  valueByDate: Map<string, number>,
  hi: number,
  lo: number,
  lagDays: number,
  id: string,
  label: string,
  detail: string
): Driver | null {
  const withVals: number[] = [];
  const withoutVals: number[] = [];
  for (const [date, rec] of frame.recovery) {
    const srcDate = lagDays ? addDay(date, -lagDays) : date;
    const v = valueByDate.get(srcDate);
    if (v == null) continue;
    if (v >= hi) withVals.push(rec);
    else if (v < lo) withoutVals.push(rec);
  }
  return finishDriver(id, label, detail, withVals, withoutVals);
}

function finishDriver(
  id: string,
  label: string,
  detail: string,
  withVals: number[],
  withoutVals: number[]
): Driver | null {
  const c = welchContrast(withVals, withoutVals);
  const conf = confidenceOf(c.t, c.nWith, c.nWithout);
  if (!conf) return null;
  if (Math.abs(c.delta) < MIN_ABS_DELTA) return null;
  const helps = c.delta > 0; // recovery is higher-is-better
  const pct = c.meanWithout !== 0 ? c.delta / c.meanWithout : 0;
  const sign = c.delta >= 0 ? '+' : '−';
  const sentence = `${label}: recovery averages ${Math.round(c.meanWith)}% vs ${Math.round(
    c.meanWithout
  )}% ${detail} (${sign}${Math.abs(Math.round(c.delta))} pts).`;
  return {
    id,
    label,
    detail,
    target: 'recovery',
    meanWith: c.meanWith,
    meanWithout: c.meanWithout,
    delta: c.delta,
    pct,
    nWith: c.nWith,
    nWithout: c.nWithout,
    confidence: conf,
    helps,
    sentence,
  };
}

// Tercile cut points for a set of values (returns [lowMax, highMin]). Returns
// null for a distribution too small or too degenerate to split cleanly (the
// bottom and top cut points must differ, or the groups would overlap).
function terciles(values: number[]): [number, number] | null {
  if (values.length < 6) return null;
  const s = [...values].sort((a, b) => a - b);
  const loMax = s[Math.floor(s.length / 3)];
  const hiMin = s[Math.floor((2 * s.length) / 3)];
  return hiMin > loMax ? [loMax, hiMin] : null;
}

export interface DriverReport {
  drivers: Driver[]; // ranked, strongest & most reliable first
  consideredDays: number; // recovery days available
  note: string; // honest framing / what's missing
}

// The headline analysis: everything we can defensibly say about what moves
// recovery, ranked by reliability then effect size.
export function recoveryDrivers(input: InsightInput): DriverReport {
  const frame = buildFrame(input);
  const consideredDays = frame.recovery.size;
  const drivers: Driver[] = [];

  // Sleep (same night → that morning's recovery).
  const sleepD = thresholdDriver(frame, frame.sleep, 7, 6.5, 0, 'sleep', 'After 7h+ sleep', 'after nights under 6.5h');
  if (sleepD) drivers.push(sleepD);

  // Prior-day strain (terciles) → next-day recovery.
  const strainT = terciles([...frame.strain.values()]);
  if (strainT) {
    const [loMax, hiMin] = strainT;
    const withVals: number[] = [];
    const withoutVals: number[] = [];
    for (const [date, rec] of frame.recovery) {
      const s = frame.strain.get(addDay(date, -1));
      if (s == null) continue;
      if (s >= hiMin) withVals.push(rec);
      else if (s <= loMax) withoutVals.push(rec);
    }
    const d = finishDriver('strain', 'After a hard day', 'after an easy day', withVals, withoutVals);
    if (d) drivers.push(d);
  }

  // Prior-day behaviours → next-day recovery.
  const lag = [
    lagDriver(frame, frame.saunaDays, 'sauna', 'After a sauna', 'otherwise'),
    lagDriver(frame, frame.cardioDays, 'cardio', 'After cardio', 'on other days'),
    lagDriver(frame, frame.liftDays, 'lift', 'After lifting', 'on non-lifting days'),
  ];
  for (const d of lag) if (d) drivers.push(d);

  // Prior-day protein (terciles) → next-day recovery.
  const protT = terciles([...frame.proteinByDate.values()]);
  if (protT) {
    const [loMax, hiMin] = protT;
    const withVals: number[] = [];
    const withoutVals: number[] = [];
    for (const [date, rec] of frame.recovery) {
      const p = frame.proteinByDate.get(addDay(date, -1));
      if (p == null) continue;
      if (p >= hiMin) withVals.push(rec);
      else if (p <= loMax) withoutVals.push(rec);
    }
    const d = finishDriver('protein', 'After high-protein days', 'after low-protein days', withVals, withoutVals);
    if (d) drivers.push(d);
  }

  // Rank: reliability first (high before medium), then effect size.
  const rank: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
  drivers.sort((a, b) => rank[b.confidence] - rank[a.confidence] || Math.abs(b.delta) - Math.abs(a.delta));

  const note = drivers.length
    ? 'Associations across your own data, not proof of cause. Effects strengthen as you log more.'
    : consideredDays < 30
      ? 'Not enough recovery history yet to find drivers.'
      : 'No strong drivers stand out yet. Logging workouts, sauna and nutrition will surface more.';

  return { drivers, consideredDays, note };
}
