// Progress-photo plumbing: pure helpers (testable) + thin wrappers around
// Supabase Storage. Photos are the first binary payloads in Cadence — the
// offline WAL can't journal a multi-MB image through localStorage, so uploads
// are honest about needing a connection instead of pretending to queue.

import { supabase } from '../../lib/supabase';
import type { BodyMetric, PhotoPose, ProgressPhoto } from './types';

export const PHOTO_BUCKET = 'progress-photos';
export const POSES: PhotoPose[] = ['front', 'side', 'back'];
export const POSE_LABEL: Record<PhotoPose, string> = { front: 'Front', side: 'Side', back: 'Back' };

const OFFLINE = import.meta.env.VITE_DEMO === '1' || import.meta.env.VITE_E2E === '1';

// Storage RLS scopes access by the first path segment (= the uploader's user
// id), so the path shape is a security contract, not a convention.
export function photoStoragePath(ownerId: string, photoId: string): string {
  return `${ownerId}/${photoId}.jpg`;
}

// Longest edge capped: an iPhone original is ~4-5 MB / 4032px which is slow to
// upload on gym wifi and pointless for a comparison thumbnail. 1600px keeps
// visible detail (stripes, definition) at ~200-400 KB.
export const MAX_PHOTO_EDGE = 1600;
export function downscaleDims(width: number, height: number, maxEdge = MAX_PHOTO_EDGE): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const edge = Math.max(w, h);
  if (edge <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / edge;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// Re-encode to a capped JPEG in the browser. Any failure (unsupported format,
// canvas quirks) falls back to the original file — a big upload is better
// than a lost photo.
export async function downscalePhoto(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const { width, height } = downscaleDims(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      return blob ?? file;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

// The only honest before/after is oldest vs newest OF THE SAME POSE. Ties on
// date break by created_at so two same-day photos still order stably.
export function comparePair(photos: ProgressPhoto[], pose: PhotoPose): { before: ProgressPhoto; after: ProgressPhoto } | null {
  const ofPose = photos
    .filter((p) => p.pose === pose && !p.deleted_at)
    .sort((a, b) => a.photo_date.localeCompare(b.photo_date) || a.created_at.localeCompare(b.created_at));
  if (ofPose.length < 2) return null;
  return { before: ofPose[0], after: ofPose[ofPose.length - 1] };
}

// Weight to stamp on a photo: the weigh-in on that day, else the nearest one
// within `toleranceDays` (you don't always step on the scale the morning you
// take the photo). Null when nothing is close enough — an honest blank beats
// a stale number.
export function weightOnOrNear(metrics: BodyMetric[], date: string, toleranceDays = 3): number | null {
  let best: { dist: number; weight: number } | null = null;
  for (const m of metrics) {
    if (m.deleted_at || !m.weight_kg) continue;
    const dist = Math.abs(
      (new Date(m.date + 'T12:00:00').getTime() - new Date(date + 'T12:00:00').getTime()) / 86_400_000
    );
    if (dist > toleranceDays) continue;
    if (!best || dist < best.dist) best = { dist, weight: Number(m.weight_kg) };
  }
  return best ? best.weight : null;
}

// ── Storage wrappers ─────────────────────────────────────────────────────
// Demo/e2e have no live Supabase; photos live as in-memory object URLs so the
// feature is fully usable (and screenshot-able) offline.

const localPhotos = new Map<string, string>();

export async function uploadProgressPhoto(path: string, blob: Blob): Promise<void> {
  if (OFFLINE) {
    localPhotos.set(path, URL.createObjectURL(blob));
    return;
  }
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
}

// Signed URLs are cached until shortly before expiry so a grid of photos
// doesn't re-sign on every render.
const SIGNED_TTL_S = 3600;
const signedCache = new Map<string, { url: string; expires: number }>();

export async function progressPhotoUrl(path: string): Promise<string | null> {
  if (OFFLINE) return localPhotos.get(path) ?? null;
  const hit = signedCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_TTL_S);
  if (error || !data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, expires: Date.now() + (SIGNED_TTL_S - 60) * 1000 });
  return data.signedUrl;
}

// Best-effort: the row's soft-delete is what hides the photo; a failed object
// delete just leaves an unreachable file in a private bucket.
export async function removeProgressPhotoFile(path: string): Promise<void> {
  if (OFFLINE) {
    const url = localPhotos.get(path);
    if (url) URL.revokeObjectURL(url);
    localPhotos.delete(path);
    return;
  }
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  } catch {
    // ignore — see note above
  }
}

// The signed-in user's id, needed synchronously-ish for the storage path.
// Demo/e2e use the same placeholder owner as the store.
export async function photoOwnerId(): Promise<string | null> {
  if (OFFLINE) return 'demo-owner';
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
