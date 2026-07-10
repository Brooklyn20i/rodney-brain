/**
 * Ace turn-lifecycle helpers — the pure, Deno-free contract behind the Edge
 * Function's idempotency and loop-outcome handling. Exercised here under the web
 * unit tooling since the function itself isn't runnable in this repo.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidRequestId,
  isUniqueViolation,
  describeLoopResult,
  TOOL_LIMIT_MESSAGE,
  type LoopResult,
} from '../../../../backend/functions/ace-chat/turn';

describe('isValidRequestId', () => {
  it('accepts a well-formed UUID (case-insensitive, trimmed)', () => {
    expect(isValidRequestId('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(isValidRequestId('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(true);
    expect(isValidRequestId('  3f2504e0-4f89-41d3-9a0c-0305e82c3301  ')).toBe(true);
  });

  it('rejects missing, non-string, or malformed ids', () => {
    expect(isValidRequestId(undefined)).toBe(false);
    expect(isValidRequestId(null)).toBe(false);
    expect(isValidRequestId(42)).toBe(false);
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId('not-a-uuid')).toBe(false);
    expect(isValidRequestId('3f2504e0-4f89-41d3-9a0c')).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('detects Postgres unique_violation (23505) and nothing else', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe('describeLoopResult', () => {
  it('maps a completed turn to a success outcome with its text', () => {
    expect(describeLoopResult({ kind: 'completed', text: 'All set.' })).toEqual({
      status: 'ok',
      text: 'All set.',
    });
  });

  it('falls back to "Done." only for a genuinely completed but text-less turn', () => {
    expect(describeLoopResult({ kind: 'completed', text: '   ' })).toEqual({
      status: 'ok',
      text: 'Done.',
    });
  });

  it('maps an unexpected stop to an explicit failure', () => {
    const out = describeLoopResult({ kind: 'error', text: 'stopped early' });
    expect(out.status).toBe('failed');
    expect(out.text).toBe('stopped early');
  });

  it('maps loop exhaustion to a failure that never reads as success', () => {
    const out = describeLoopResult({ kind: 'exhausted' });
    expect(out.status).toBe('failed');
    expect(out.text).toBe(TOOL_LIMIT_MESSAGE);
    // Regression guard for finding 3: exhaustion must not surface as "Done." or
    // any success wording.
    expect(out.text).not.toMatch(/done\.?$/i);
    expect(out.text.toLowerCase()).toContain('limit');
  });

  it('never reports success wording for any failure kind', () => {
    const failures: LoopResult[] = [{ kind: 'exhausted' }, { kind: 'error', text: 'x' }];
    for (const f of failures) expect(describeLoopResult(f).status).toBe('failed');
  });
});
