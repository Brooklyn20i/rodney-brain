import { describe, expect, it } from 'vitest';
import { parseCSV, parseWeightCSV, parseWhoopCSV, toISO } from '../csvImport';

describe('parseCSV', () => {
  it('handles quoted fields with commas and CRLF', () => {
    const grid = parseCSV('a,b\r\n"1,5",x\r\n');
    expect(grid).toEqual([
      ['a', 'b'],
      ['1,5', 'x'],
    ]);
  });
});

describe('toISO', () => {
  it('accepts ISO, slashed, timestamped and day-first dates', () => {
    expect(toISO('2026-06-01 06:12:34')).toBe('2026-06-01');
    expect(toISO('2026/6/1')).toBe('2026-06-01');
    expect(toISO('01/06/2026')).toBe('2026-06-01');
    expect(toISO('nonsense')).toBeNull();
  });
});

describe('parseWhoopCSV', () => {
  const csv = [
    'Cycle start time,Cycle end time,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Day Strain,Energy burned (cal),Asleep duration (min),Sleep performance %',
    '2026-06-01 06:12:34,2026-06-02 06:40:00,74,52,85,14.2,2450,432,88',
    '2026-06-02 06:40:00,2026-06-03 06:20:00,33,58,61,18.9,2890,366,71',
    'not-a-date,,,,,,,,',
  ].join('\n');

  it('maps the standard physiological_cycles export', () => {
    const r = parseWhoopCSV(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.from).toBe('2026-06-01');
    expect(r.to).toBe('2026-06-02');
    expect(r.rows[0]).toEqual({
      date: '2026-06-01',
      recovery_pct: 74,
      resting_hr: 52,
      hrv_ms: 85,
      strain: 14.2,
      active_energy_kcal: 2450,
      sleep_hours: 7.2,
      sleep_performance_pct: 88,
    });
  });

  it('converts kilojoules when the header says so', () => {
    const kj = 'Cycle start time,Energy burned (kilojoule)\n2026-06-01,10251';
    const r = parseWhoopCSV(kj);
    expect(r.rows[0].active_energy_kcal).toBe(2450);
  });

  it('returns empty on a CSV with no recognisable date column', () => {
    const r = parseWhoopCSV('foo,bar\n1,2');
    expect(r.rows).toHaveLength(0);
  });
});

describe('parseWeightCSV', () => {
  it('maps a Renpho-style export and keeps the last reading per day', () => {
    const csv = [
      'Date,Weight (kg),Body Fat (%),Muscle Mass (kg)',
      '2026-06-01 07:01,90.4,21.5,60.1',
      '2026-06-01 21:30,89.9,21.2,60.0',
      '2026-06-02 07:05,90.1,21.4,60.2',
    ].join('\n');
    const r = parseWeightCSV(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ date: '2026-06-01', measurement_at: '2026-06-01 21:30', weight_kg: 89.9, body_fat_pct: 21.2, muscle_mass_kg: 60 });
  });

  it('converts pounds when the header says lb', () => {
    const csv = 'Date,Weight (lb)\n2026-06-01,200';
    const r = parseWeightCSV(csv);
    expect(r.rows[0].weight_kg).toBeCloseTo(90.72, 2);
  });

  it('skips rows without weight', () => {
    const csv = 'Date,Weight (kg)\n2026-06-01,\n2026-06-02,90';
    const r = parseWeightCSV(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });
});
