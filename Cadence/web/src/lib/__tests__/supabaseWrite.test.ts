import { describe, it, expect } from 'vitest';
import { dropMissingColumn, writeWithColumnDrift } from '../supabaseWrite';

describe('dropMissingColumn', () => {
  it('strips a PostgREST PGRST204 missing column', () => {
    const out = dropMissingColumn(
      { a: 1, workout_id: 'x', b: 2 },
      { message: "Could not find the 'workout_id' column of 'cardio_sessions' in the schema cache" }
    );
    expect(out).toEqual({ a: 1, b: 2 });
  });

  it('strips a Postgres 42703 quoted column from details', () => {
    const out = dropMissingColumn({ foo: 1, bar: 2 }, { message: 'error', details: 'column "bar" does not exist' });
    expect(out).toEqual({ foo: 1 });
  });

  it('returns null when the error is not a missing-column error', () => {
    expect(dropMissingColumn({ a: 1 }, { message: 'duplicate key value violates unique constraint' })).toBeNull();
  });

  it('returns null when the named column is not in the payload (avoids infinite retry)', () => {
    expect(dropMissingColumn({ a: 1 }, { message: "could not find the 'zzz' column" })).toBeNull();
  });
});

describe('writeWithColumnDrift', () => {
  it('returns immediately on success without stripping', async () => {
    let calls = 0;
    const res = await writeWithColumnDrift({ a: 1, b: 2 }, async (p) => {
      calls++;
      return { data: { id: '1', ...p }, error: null };
    });
    expect(calls).toBe(1);
    expect(res.error).toBeNull();
    expect(res.payload).toEqual({ a: 1, b: 2 });
  });

  it('strips an unknown column and retries until it succeeds', async () => {
    const seen: Record<string, unknown>[] = [];
    const res = await writeWithColumnDrift({ a: 1, ghost: 9, b: 2 }, async (p) => {
      seen.push(p);
      if ('ghost' in p) return { data: null, error: { message: "could not find the 'ghost' column" } };
      return { data: { ok: true }, error: null };
    });
    expect(seen.length).toBe(2); // first with ghost, then without
    expect(res.error).toBeNull();
    expect(res.payload).toEqual({ a: 1, b: 2 });
  });

  it('stops and returns a non-missing-column error without looping', async () => {
    let calls = 0;
    const res = await writeWithColumnDrift({ a: 1 }, async () => {
      calls++;
      return { data: null, error: { message: 'permission denied' } };
    });
    expect(calls).toBe(1);
    expect(res.data).toBeNull();
    expect((res.error as { message: string }).message).toBe('permission denied');
  });

  it('gives up after maxTries of persistent (unstrippable) errors', async () => {
    let calls = 0;
    const res = await writeWithColumnDrift({ a: 1 }, async () => {
      calls++;
      // Names a column that isn't in the payload → dropMissingColumn returns null → stop.
      return { data: null, error: { message: "could not find the 'other' column" } };
    }, 8);
    expect(calls).toBe(1);
    expect(res.data).toBeNull();
  });
});
