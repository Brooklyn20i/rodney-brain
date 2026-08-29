import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  cadenceLabel,
  daysUntil,
  dueLabel,
  dueState,
  itemsDueSoon,
  needsAttention,
  rollForward,
} from '../lifeCalc';
import type { LifeItem, Obligation } from '../types';

const ob = (over: Partial<Obligation>): Obligation => ({
  id: over.id ?? crypto.randomUUID(),
  owner_id: 'o',
  name: 'Rego',
  category: 'vehicles',
  cadence_months: 12,
  next_due: '2026-09-01',
  lead_days: 14,
  amount: null,
  notes: '',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  deleted_at: null,
  ...over,
});

const item = (over: Partial<LifeItem>): LifeItem => ({
  id: over.id ?? crypto.randomUUID(),
  owner_id: 'o',
  title: 'Book flights',
  notes: '',
  status: 'open',
  category: 'travel',
  due_date: null,
  obligation_id: null,
  completed_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  deleted_at: null,
  ...over,
});

describe('addMonthsClamped', () => {
  it('adds calendar months', () => {
    expect(addMonthsClamped('2026-03-15', 3)).toBe('2026-06-15');
  });
  it('clamps month-end (Jan 31 + 1mo = Feb 28)', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29'); // leap year
  });
  it('wraps across years', () => {
    expect(addMonthsClamped('2026-11-10', 3)).toBe('2027-02-10');
    expect(addMonthsClamped('2026-06-30', 12)).toBe('2027-06-30');
  });
});

describe('daysUntil', () => {
  it('counts whole local days, negative for the past', () => {
    expect(daysUntil('2026-08-30', '2026-08-29')).toBe(1);
    expect(daysUntil('2026-08-29', '2026-08-29')).toBe(0);
    expect(daysUntil('2026-08-20', '2026-08-29')).toBe(-9);
  });
});

describe('rollForward', () => {
  it('rolls one cadence when ticked on time', () => {
    expect(rollForward(ob({ next_due: '2026-09-01', cadence_months: 3 }), '2026-08-29')).toBe('2026-12-01');
  });
  it('keeps the anniversary when ticked late — no cycle drift', () => {
    // Rego was due 1 Sep, paid 10 Sep: next year is still 1 Sep.
    expect(rollForward(ob({ next_due: '2026-09-01', cadence_months: 12 }), '2026-09-10')).toBe('2027-09-01');
  });
  it('catches up multiple missed cycles until the result is in the future', () => {
    // A monthly bill ignored for three months does not schedule three past dates.
    expect(rollForward(ob({ next_due: '2026-05-01', cadence_months: 1 }), '2026-08-29')).toBe('2026-09-01');
  });
});

describe('dueState', () => {
  it('overdue past the date, due inside the lead window, upcoming beyond it', () => {
    expect(dueState(ob({ next_due: '2026-08-28', lead_days: 14 }), '2026-08-29')).toBe('overdue');
    expect(dueState(ob({ next_due: '2026-09-05', lead_days: 14 }), '2026-08-29')).toBe('due');
    expect(dueState(ob({ next_due: '2026-10-20', lead_days: 14 }), '2026-08-29')).toBe('upcoming');
  });
});

describe('needsAttention', () => {
  it('overdue and inside-lead only, sorted by date; deleted excluded', () => {
    const late = ob({ id: 'late', next_due: '2026-08-20' });
    const soon = ob({ id: 'soon', next_due: '2026-09-03' });
    const far = ob({ id: 'far', next_due: '2027-03-01' });
    const gone = ob({ id: 'gone', next_due: '2026-08-01', deleted_at: '2026-08-02' });
    expect(needsAttention([soon, far, gone, late], '2026-08-29').map((o) => o.id)).toEqual(['late', 'soon']);
  });
});

describe('itemsDueSoon', () => {
  it('open/waiting dated items inside the horizon; done and undated excluded', () => {
    const rows = [
      item({ id: 'a', due_date: '2026-08-25' }), // overdue → included
      item({ id: 'b', due_date: '2026-09-05', status: 'waiting' }),
      item({ id: 'c', due_date: '2026-11-01' }), // beyond horizon
      item({ id: 'd', due_date: '2026-09-01', status: 'done' }),
      item({ id: 'e', due_date: null }),
    ];
    expect(itemsDueSoon(rows, '2026-08-29', 14).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('labels', () => {
  it('cadence reads like a person would say it', () => {
    expect(cadenceLabel(1)).toBe('Monthly');
    expect(cadenceLabel(3)).toBe('Quarterly');
    expect(cadenceLabel(12)).toBe('Yearly');
    expect(cadenceLabel(120)).toBe('Every 10 years');
    expect(cadenceLabel(5)).toBe('Every 5 months');
  });
  it('due label is plain language, overdue included', () => {
    expect(dueLabel('2026-08-29', '2026-08-29')).toBe('today');
    expect(dueLabel('2026-08-30', '2026-08-29')).toBe('tomorrow');
    expect(dueLabel('2026-09-03', '2026-08-29')).toBe('in 5 days');
    expect(dueLabel('2026-08-26', '2026-08-29')).toBe('3 days overdue');
  });
});
