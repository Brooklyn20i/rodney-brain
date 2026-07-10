import { describe, expect, it } from 'vitest';
import { elapsedMsSince, formatElapsed } from '../elapsedClock';

describe('formatElapsed', () => {
  it('shows m:ss under an hour and is live within the first minute', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(5_000)).toBe('0:05'); // the "0 min looks frozen" case
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('switches to h:mm:ss at an hour', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_661_000)).toBe('1:01:01');
  });

  it('never renders a negative clock', () => {
    expect(formatElapsed(-5_000)).toBe('0:00');
    expect(formatElapsed(NaN)).toBe('0:00');
  });
});

describe('elapsedMsSince', () => {
  it('measures from an ISO start to now', () => {
    const start = '2026-07-10T06:00:00.000Z';
    const now = new Date('2026-07-10T06:05:30.000Z').getTime();
    expect(elapsedMsSince(start, now)).toBe(5 * 60_000 + 30_000);
  });

  it('clamps a future start and tolerates missing/invalid input', () => {
    const now = new Date('2026-07-10T06:00:00.000Z').getTime();
    expect(elapsedMsSince('2026-07-10T07:00:00.000Z', now)).toBe(0);
    expect(elapsedMsSince(null, now)).toBe(0);
    expect(elapsedMsSince('not-a-date', now)).toBe(0);
  });
});
