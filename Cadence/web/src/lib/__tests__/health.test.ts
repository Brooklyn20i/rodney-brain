/**
 * Health presentation contract — one map per concern, imported everywhere.
 * These tests pin the labels and CSS hooks so a screen-level refactor can't
 * silently reintroduce a divergent copy with different wording or colours.
 */
import { describe, it, expect } from 'vitest';
import {
  HEALTH_LABEL, HEALTH_COLOR, HEALTH_BG, HEALTH_PILL_CLASS, HEALTH_OPTIONS,
  STATUS_LABEL, STATUS_ORDER,
} from '../health';
import type { Health } from '../types';

const ALL_HEALTH: Health[] = ['green', 'amber', 'red'];

describe('health maps', () => {
  it('labels every health value with the canonical wording', () => {
    expect(HEALTH_LABEL).toEqual({ green: 'On track', amber: 'At risk', red: 'Off track' });
  });

  it('amber renders with the orange token pair (historical convention)', () => {
    expect(HEALTH_COLOR.amber).toBe('var(--orange)');
    expect(HEALTH_BG.amber).toBe('var(--orange-bg)');
  });

  it('every map covers every health value', () => {
    for (const h of ALL_HEALTH) {
      expect(HEALTH_LABEL[h]).toBeTruthy();
      expect(HEALTH_COLOR[h]).toMatch(/^var\(--/);
      expect(HEALTH_BG[h]).toMatch(/-bg\)$/);
      expect(HEALTH_PILL_CLASS[h]).toBe(`health-${h}`);
    }
  });

  it('picker options follow green → amber → red order with matching labels', () => {
    expect(HEALTH_OPTIONS.map((o) => o.v)).toEqual(ALL_HEALTH);
    for (const o of HEALTH_OPTIONS) expect(o.label).toContain(HEALTH_LABEL[o.v]);
  });
});

describe('status maps', () => {
  it('labels each project status and keeps canonical order', () => {
    expect(STATUS_LABEL).toEqual({ active: 'Active', onHold: 'On Hold', completed: 'Completed' });
    expect(STATUS_ORDER).toEqual(['active', 'onHold', 'completed']);
  });
});
