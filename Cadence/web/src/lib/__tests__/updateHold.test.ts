import { describe, expect, it } from 'vitest';
import { holdPwaUpdates, pwaUpdatesHeld, UPDATE_HOLD_TTL_MS } from '../updateHold';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe('PWA update hold', () => {
  it('is off by default and on after a hold is raised', () => {
    const s = storage();
    expect(pwaUpdatesHeld(Date.now(), s)).toBe(false);
    holdPwaUpdates(true, s);
    expect(pwaUpdatesHeld(Date.now(), s)).toBe(true);
  });

  it('clearing the hold releases updates immediately', () => {
    const s = storage();
    holdPwaUpdates(true, s);
    holdPwaUpdates(false, s);
    expect(pwaUpdatesHeld(Date.now(), s)).toBe(false);
  });

  it('a hold that was never cleared expires — one crashed session cannot block deployments forever', () => {
    const s = storage();
    const raised = Date.now();
    holdPwaUpdates(true, s);
    expect(pwaUpdatesHeld(raised + UPDATE_HOLD_TTL_MS - 1000, s)).toBe(true);
    expect(pwaUpdatesHeld(raised + UPDATE_HOLD_TTL_MS + 1000, s)).toBe(false);
  });

  it('garbage in storage reads as no hold', () => {
    const s = storage();
    s.setItem('cadence-pwa-update-hold', 'not-a-timestamp');
    expect(pwaUpdatesHeld(Date.now(), s)).toBe(false);
  });
});
