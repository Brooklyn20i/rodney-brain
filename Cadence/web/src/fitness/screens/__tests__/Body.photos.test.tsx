import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CadenceFitnessCtx, type Ctx } from '../../lib/store';
import { emptyData, type CadenceFitnessData, type ProgressPhoto } from '../../lib/types';
import { ProgressPhotosCard } from '../Body';

// Storage is mocked (jsdom has no canvas/createImageBitmap and no Supabase);
// the PURE helpers (comparePair, weightOnOrNear) stay real so these tests
// exercise the actual pairing/weight-stamping logic the user sees.
const uploads = vi.hoisted(() => [] as Array<{ path: string; blob: Blob }>);
vi.mock('../../lib/progressPhotos', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/progressPhotos')>();
  return {
    ...real,
    downscalePhoto: vi.fn(async (f: Blob) => f),
    photoOwnerId: vi.fn(async () => 'owner-1'),
    uploadProgressPhoto: vi.fn(async (path: string, blob: Blob) => {
      uploads.push({ path, blob });
    }),
    progressPhotoUrl: vi.fn(async () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw='),
    removeProgressPhotoFile: vi.fn(async () => {}),
  };
});
import { removeProgressPhotoFile, uploadProgressPhoto } from '../../lib/progressPhotos';

const STAMP = { owner_id: 'owner-1', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', deleted_at: null };

const photo = (over: Partial<ProgressPhoto>): ProgressPhoto => ({
  id: crypto.randomUUID(),
  photo_date: '2026-08-01',
  pose: 'front',
  storage_path: 'owner-1/x.jpg',
  weight_kg: null,
  notes: '',
  ...STAMP,
  ...over,
});

function renderCard(seed?: (d: CadenceFitnessData) => void) {
  const d = emptyData();
  seed?.(d);
  const inserted: any[] = [];
  const removed: string[] = [];
  const ctx = {
    demo: false,
    data: d,
    insert: vi.fn(async (_t: string, row: any) => {
      inserted.push(row);
      return row;
    }),
    update: vi.fn(),
    upsert: vi.fn(),
    insertMany: vi.fn(),
    remove: vi.fn(async (_t: string, id: string) => {
      removed.push(id);
    }),
    syncError: null,
    clearSyncError: vi.fn(),
    saving: false,
    pendingCount: 0,
    ready: true,
  } as unknown as Ctx;
  render(<CadenceFitnessCtx.Provider value={ctx}><ProgressPhotosCard /></CadenceFitnessCtx.Provider>);
  return { inserted, removed };
}

beforeEach(() => {
  uploads.length = 0;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('ProgressPhotosCard', () => {
  it('shows the empty prompt when there are no photos for the pose', () => {
    renderCard();
    expect(screen.getByText(/No front photos yet/)).toBeTruthy();
  });

  it('pairs oldest vs newest of the SAME pose and shows the weight delta', async () => {
    renderCard((d) => {
      d.progress_photos.push(
        photo({ photo_date: '2026-06-01', weight_kg: 98.2, storage_path: 'owner-1/a.jpg' }),
        photo({ photo_date: '2026-08-15', weight_kg: 94.7, storage_path: 'owner-1/b.jpg' }),
        photo({ pose: 'side', photo_date: '2026-05-01', storage_path: 'owner-1/s.jpg' })
      );
    });
    expect(screen.getByText('-3.5kg')).toBeTruthy();
    expect(screen.getByText('75 days')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByAltText(/Before — Front/)).toBeTruthy();
      expect(screen.getByAltText(/After — Front/)).toBeTruthy();
    });
  });

  it('switching pose re-filters the compare (one side photo → no pair)', () => {
    renderCard((d) => {
      d.progress_photos.push(
        photo({ photo_date: '2026-06-01', storage_path: 'owner-1/a.jpg' }),
        photo({ photo_date: '2026-08-15', storage_path: 'owner-1/b.jpg' }),
        photo({ pose: 'side', photo_date: '2026-05-01', storage_path: 'owner-1/s.jpg' })
      );
    });
    fireEvent.click(screen.getByRole('button', { name: /Side · 1/ }));
    expect(screen.getByText(/One side photo so far/)).toBeTruthy();
  });

  it('adding a photo uploads under the owner path and inserts a row stamped with the nearest weigh-in', async () => {
    const { inserted } = renderCard((d) => {
      d.body_metrics.push({
        id: 'bm', date: new Date().toISOString().slice(0, 10), weight_kg: 95.5,
        body_fat_pct: null, muscle_mass_kg: null, source: 'renpho', notes: '', ...STAMP,
      } as never);
    });
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Progress photo file'), { target: { files: [file] } });
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(vi.mocked(uploadProgressPhoto)).toHaveBeenCalledTimes(1);
    const row = inserted[0];
    expect(row.storage_path).toBe(`owner-1/${row.id}.jpg`);
    expect(row.pose).toBe('front');
    expect(row.weight_kg).toBe(95.5);
  });

  it('a failed upload surfaces an error and inserts NO orphan row', async () => {
    vi.mocked(uploadProgressPhoto).mockRejectedValueOnce(new Error('Bucket not found'));
    const { inserted } = renderCard();
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Progress photo file'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Bucket not found/));
    expect(inserted).toHaveLength(0);
  });

  it('deleting a photo soft-deletes the row and clears the stored file', async () => {
    const { removed } = renderCard((d) => {
      d.progress_photos.push(photo({ id: 'p1', photo_date: '2026-08-01', storage_path: 'owner-1/p1.jpg' }));
    });
    fireEvent.click(screen.getByRole('button', { name: /Delete Front photo/ }));
    await waitFor(() => expect(removed).toEqual(['p1']));
    expect(vi.mocked(removeProgressPhotoFile)).toHaveBeenCalledWith('owner-1/p1.jpg');
  });
});
