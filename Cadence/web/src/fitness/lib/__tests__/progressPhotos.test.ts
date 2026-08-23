import { describe, expect, it } from 'vitest';
import { comparePair, downscaleDims, photoStoragePath, weightOnOrNear, MAX_PHOTO_EDGE } from '../progressPhotos';
import type { BodyMetric, ProgressPhoto } from '../types';

const photo = (over: Partial<ProgressPhoto>): ProgressPhoto => ({
  id: over.id ?? crypto.randomUUID(),
  owner_id: 'o',
  photo_date: '2026-08-01',
  pose: 'front',
  storage_path: 'o/x.jpg',
  weight_kg: null,
  notes: '',
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
  deleted_at: null,
  ...over,
});

const metric = (date: string, weight: number, deleted = false): BodyMetric =>
  ({ id: date, owner_id: 'o', date, weight_kg: weight, body_fat_pct: null, muscle_mass_kg: null, source: 'renpho', notes: '', created_at: date, updated_at: date, deleted_at: deleted ? date : null }) as BodyMetric;

describe('photoStoragePath', () => {
  it('puts the owner id first — the segment storage RLS scopes on', () => {
    expect(photoStoragePath('owner-1', 'photo-9')).toBe('owner-1/photo-9.jpg');
  });
});

describe('downscaleDims', () => {
  it('leaves small images untouched', () => {
    expect(downscaleDims(800, 600)).toEqual({ width: 800, height: 600 });
    expect(downscaleDims(MAX_PHOTO_EDGE, 900)).toEqual({ width: MAX_PHOTO_EDGE, height: 900 });
  });

  it('caps the longest edge and preserves aspect ratio (portrait iPhone shot)', () => {
    const d = downscaleDims(3024, 4032); // 3:4
    expect(d.height).toBe(1600);
    expect(d.width).toBe(1200);
  });

  it('caps landscape by width', () => {
    const d = downscaleDims(4032, 3024);
    expect(d.width).toBe(1600);
    expect(d.height).toBe(1200);
  });

  it('never collapses a degenerate dimension to zero', () => {
    const d = downscaleDims(10000, 1);
    expect(d.width).toBe(1600);
    expect(d.height).toBeGreaterThanOrEqual(1);
  });
});

describe('comparePair', () => {
  it('needs two photos of the SAME pose', () => {
    expect(comparePair([photo({ pose: 'front' }), photo({ pose: 'side', photo_date: '2026-08-10' })], 'front')).toBeNull();
  });

  it('pairs oldest vs newest within the pose, ignoring other poses', () => {
    const a = photo({ id: 'a', photo_date: '2026-06-01' });
    const mid = photo({ id: 'mid', photo_date: '2026-07-01' });
    const b = photo({ id: 'b', photo_date: '2026-08-15' });
    const side = photo({ id: 's', pose: 'side', photo_date: '2026-05-01' });
    const pair = comparePair([mid, b, side, a], 'front');
    expect(pair?.before.id).toBe('a');
    expect(pair?.after.id).toBe('b');
  });

  it('skips deleted photos', () => {
    const a = photo({ id: 'a', photo_date: '2026-06-01', deleted_at: '2026-06-02' });
    const b = photo({ id: 'b', photo_date: '2026-08-15' });
    expect(comparePair([a, b], 'front')).toBeNull();
  });

  it('breaks same-day ties by created_at so ordering is stable', () => {
    const first = photo({ id: 'first', photo_date: '2026-08-01', created_at: '2026-08-01T08:00:00Z' });
    const second = photo({ id: 'second', photo_date: '2026-08-01', created_at: '2026-08-01T09:00:00Z' });
    const pair = comparePair([second, first], 'front');
    expect(pair?.before.id).toBe('first');
    expect(pair?.after.id).toBe('second');
  });
});

describe('weightOnOrNear', () => {
  const metrics = [metric('2026-08-01', 96.4), metric('2026-08-05', 95.8), metric('2026-08-20', 94.9)];

  it('uses the same-day weigh-in when there is one', () => {
    expect(weightOnOrNear(metrics, '2026-08-05')).toBe(95.8);
  });

  it('falls back to the nearest weigh-in within tolerance', () => {
    expect(weightOnOrNear(metrics, '2026-08-02')).toBe(96.4); // 1 day back beats 3 days forward
    expect(weightOnOrNear(metrics, '2026-08-07')).toBe(95.8);
  });

  it('returns null when nothing is close enough — no stale numbers', () => {
    expect(weightOnOrNear(metrics, '2026-08-12')).toBeNull(); // 5+ days from either side
  });

  it('ignores deleted and zero-weight rows', () => {
    const rows = [metric('2026-08-10', 95.0, true), metric('2026-08-11', 0)];
    expect(weightOnOrNear(rows, '2026-08-10')).toBeNull();
  });
});
