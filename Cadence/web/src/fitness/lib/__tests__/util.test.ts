import { describe, expect, it } from 'vitest';
import { stripDayPrefix } from '../util';

describe('stripDayPrefix', () => {
  it('drops a leading weekday and separator', () => {
    expect(stripDayPrefix('Monday — Upper A')).toBe('Upper A');
    expect(stripDayPrefix('Tuesday - Lower')).toBe('Lower');
    expect(stripDayPrefix('Wed: Push')).toBe('Push');
    expect(stripDayPrefix('Fri · Pull')).toBe('Pull');
  });
  it('leaves names without a weekday-plus-separator untouched', () => {
    expect(stripDayPrefix('Upper A')).toBe('Upper A');
    expect(stripDayPrefix('Sunday Long Run')).toBe('Sunday Long Run'); // no separator
    expect(stripDayPrefix('Leg Day')).toBe('Leg Day');
  });
  it('never returns an empty string', () => {
    expect(stripDayPrefix('Monday —')).toBe('Monday —'); // stripping would empty it
    expect(stripDayPrefix('')).toBe('');
  });
});
