import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  localDateStr,
  addDaysStr,
  fmtDM,
  fmtDMY,
  isOverdue,
  isDueToday,
  fmtDate,
  priorityScore,
  autoColor,
  AVATAR_COLORS,
} from '../util';
import type { WorkItem } from '../types';

// ── localDateStr ─────────────────────────────────────────────────────────────

describe('localDateStr', () => {
  it('formats a date in YYYY-MM-DD', () => {
    expect(localDateStr(new Date(2026, 5, 20))).toBe('2026-06-20'); // June (0-indexed)
  });

  it('pads single-digit month and day', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

// ── addDaysStr ───────────────────────────────────────────────────────────────

describe('addDaysStr', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20)); // 20 June 2026
  });

  it('adds 0 days = today', () => {
    expect(addDaysStr(0)).toBe('2026-06-20');
  });

  it('adds 1 day', () => {
    expect(addDaysStr(1)).toBe('2026-06-21');
  });

  it('rolls over month boundary', () => {
    expect(addDaysStr(11)).toBe('2026-07-01');
  });
});

// ── isOverdue / isDueToday ───────────────────────────────────────────────────

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20));
  });

  it('returns true for past date', () => {
    expect(isOverdue('2026-06-19')).toBe(true);
  });

  it('returns false for today', () => {
    expect(isOverdue('2026-06-20')).toBe(false);
  });

  it('returns false for future date', () => {
    expect(isOverdue('2026-06-21')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isOverdue(null)).toBe(false);
  });
});

describe('isDueToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20));
  });

  it('returns true when date is today', () => {
    expect(isDueToday('2026-06-20')).toBe(true);
  });

  it('returns false for yesterday', () => {
    expect(isDueToday('2026-06-19')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDueToday(null)).toBe(false);
  });
});

// ── fmtDate ──────────────────────────────────────────────────────────────────

describe('fmtDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20, 12)); // 20 June 2026, noon
  });

  it('returns empty string for null', () => {
    expect(fmtDate(null)).toBe('');
  });

  it('returns "Today" for today', () => {
    expect(fmtDate('2026-06-20')).toBe('Today');
  });

  it('returns "Tomorrow" for tomorrow', () => {
    expect(fmtDate('2026-06-21')).toBe('Tomorrow');
  });

  it('returns "Nd" for next few days', () => {
    expect(fmtDate('2026-06-23')).toBe('3d');
  });

  it('returns overdue label for past date', () => {
    expect(fmtDate('2026-06-18')).toBe('Overdue 2d');
  });
});

// ── priorityScore ────────────────────────────────────────────────────────────

describe('priorityScore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20));
  });

  const base = (overrides: Partial<WorkItem>): WorkItem =>
    ({
      id: 'x',
      owner_id: 'o',
      title: 'T',
      type: 'task',
      priority: 'low',
      due_date: null,
      project_id: null,
      person_id: null,
      notes: '',
      done: false,
      inboxed: false,
      source: '',
      completed_at: null,
      created_at: '',
      updated_at: '',
      deleted_at: null,
      ...overrides,
    }) as WorkItem;

  it('high priority outscores medium outscores low (no due date)', () => {
    const hi = priorityScore(base({ priority: 'high' }));
    const md = priorityScore(base({ priority: 'medium' }));
    const lo = priorityScore(base({ priority: 'low' }));
    expect(hi).toBeGreaterThan(md);
    expect(md).toBeGreaterThan(lo);
  });

  it('overdue gets a large score bonus', () => {
    const overdue = priorityScore(base({ due_date: '2026-06-19', priority: 'low' }));
    const noDue = priorityScore(base({ priority: 'high' }));
    expect(overdue).toBeGreaterThan(noDue);
  });

  it('due today adds score', () => {
    const today = priorityScore(base({ due_date: '2026-06-20', priority: 'low' }));
    const noDue = priorityScore(base({ priority: 'low' }));
    expect(today).toBeGreaterThan(noDue);
  });

  it('decision/risk type adds bonus', () => {
    const risk = priorityScore(base({ type: 'risk', priority: 'low' }));
    const task = priorityScore(base({ type: 'task', priority: 'low' }));
    expect(risk).toBeGreaterThan(task);
  });
});

// ── autoColor ────────────────────────────────────────────────────────────────

describe('autoColor', () => {
  it('always returns a valid color from AVATAR_COLORS', () => {
    const seeds = ['Alice', 'Bob', '', 'aaaa', '1234567890', 'Z'];
    for (const seed of seeds) {
      expect(AVATAR_COLORS).toContain(autoColor(seed));
    }
  });

  it('is deterministic for the same seed', () => {
    expect(autoColor('Rodney')).toBe(autoColor('Rodney'));
  });

  it('produces different colors for different seeds (at least sometimes)', () => {
    const colors = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank'].map(autoColor);
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);
  });
});

// ── formatters smoke tests ────────────────────────────────────────────────────
// We don't assert exact strings (locale rendering varies) but validate shape.

describe('date formatters', () => {
  it('fmtDM returns a string with a slash', () => {
    expect(fmtDM('2026-06-20')).toContain('/');
  });

  it('fmtDMY includes a 4-digit year', () => {
    expect(fmtDMY('2026-06-20')).toMatch(/2026/);
  });
});
