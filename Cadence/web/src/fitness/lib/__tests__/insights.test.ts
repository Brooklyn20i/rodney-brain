import { describe, expect, it } from 'vitest';
import { recoveryDrivers, welchContrast, type InsightInput } from '../insights';
import type { CardioSession, RecoveryMetric, SaunaSession } from '../types';

const base = { owner_id: 'o', created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null };

function iso(dayOffset: number): string {
  const d = new Date('2025-01-01T12:00:00');
  d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rec(day: number, recovery: number, extra: Partial<RecoveryMetric> = {}): RecoveryMetric {
  return {
    id: `r${day}`,
    date: iso(day),
    recovery_pct: recovery,
    strain: null,
    resting_hr: null,
    hrv_ms: null,
    sleep_hours: null,
    sleep_performance_pct: null,
    active_energy_kcal: null,
    steps: null,
    source: 'whoop',
    notes: '',
    ...base,
    ...extra,
  };
}

const empty: InsightInput = {
  recovery_metrics: [],
  workouts: [],
  workout_sets: [],
  cardio_sessions: [],
  sauna_sessions: [],
  nutrition_logs: [],
};

describe('welchContrast', () => {
  it('reports means, delta and a t statistic that grows with separation', () => {
    const near = welchContrast([60, 61, 59, 60], [58, 59, 57, 58]);
    const far = welchContrast([70, 72, 68, 71], [50, 49, 51, 50]);
    expect(near.delta).toBeCloseTo(2, 1);
    expect(Math.abs(far.t)).toBeGreaterThan(Math.abs(near.t));
  });
});

describe('recoveryDrivers', () => {
  it('detects a planted sauna → next-day recovery effect, with direction', () => {
    // 120 days. Every 3rd day is a sauna day; the day AFTER sauna gets +14
    // recovery. Everything else ~58.
    const recovery: RecoveryMetric[] = [];
    const sauna: SaunaSession[] = [];
    for (let d = 0; d < 120; d++) {
      const saunaYesterday = (d - 1) % 3 === 0;
      recovery.push(rec(d, (saunaYesterday ? 72 : 58) + (d % 2)));
      if (d % 3 === 0) {
        sauna.push({ id: `s${d}`, date: iso(d), duration_min: 20, temperature_c: 90, rounds: 1, notes: '', ...base } as SaunaSession);
      }
    }
    const report = recoveryDrivers({ ...empty, recovery_metrics: recovery, sauna_sessions: sauna });
    const saunaDriver = report.drivers.find((x) => x.id === 'sauna');
    expect(saunaDriver).toBeDefined();
    expect(saunaDriver!.helps).toBe(true);
    expect(saunaDriver!.delta).toBeGreaterThan(8);
    expect(saunaDriver!.confidence).toBe('high');
    expect(saunaDriver!.sentence).toContain('recovery averages');
  });

  it('detects sleep and prior-day strain drivers from the Whoop table alone', () => {
    const recovery: RecoveryMetric[] = [];
    const strainOf = (d: number) => 6 + (d % 8) * 1.7; // continuous ~6 → ~18
    for (let d = 0; d < 200; d++) {
      const goodSleep = d % 2 === 0; // good sleep → higher recovery
      const strain = strainOf(d);
      const strainPrev = strainOf(d - 1);
      // recovery falls ~1.3 pts per strain point the prior day
      const r = (goodSleep ? 66 : 54) - (strainPrev - 6) * 1.3;
      recovery.push(rec(d, r, { sleep_hours: goodSleep ? 7.6 : 5.9, strain }));
    }
    const report = recoveryDrivers({ ...empty, recovery_metrics: recovery });
    const ids = report.drivers.map((d) => d.id);
    expect(ids).toContain('sleep');
    expect(ids).toContain('strain');
    expect(report.drivers.find((d) => d.id === 'sleep')!.helps).toBe(true);
    expect(report.drivers.find((d) => d.id === 'strain')!.helps).toBe(false); // after a hard day = worse
    // ranked, strongest first
    expect(report.drivers[0].confidence).toBe('high');
  });

  it('surfaces nothing when a behaviour has no real effect', () => {
    // cardio scattered but recovery is pure noise unrelated to it
    const recovery: RecoveryMetric[] = [];
    const cardio: CardioSession[] = [];
    for (let d = 0; d < 120; d++) {
      recovery.push(rec(d, 60 + (d % 5) - 2)); // ~58–62, no cardio link
      if (d % 2 === 0)
        cardio.push({ id: `c${d}`, date: iso(d), kind: 'run', duration_min: 30, distance_km: 5, avg_hr: 150, calories: 300, notes: '', ...base } as CardioSession);
    }
    const report = recoveryDrivers({ ...empty, recovery_metrics: recovery, cardio_sessions: cardio });
    expect(report.drivers.find((d) => d.id === 'cardio')).toBeUndefined();
  });

  it('handles empty and thin data without throwing', () => {
    expect(recoveryDrivers(empty).drivers).toEqual([]);
    expect(recoveryDrivers(empty).note).toMatch(/not enough/i);
    const thin = recoveryDrivers({ ...empty, recovery_metrics: [rec(0, 60), rec(1, 61)] });
    expect(thin.drivers).toEqual([]);
  });
});
