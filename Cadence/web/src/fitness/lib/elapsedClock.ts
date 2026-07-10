// A live, compact workout clock. `m:ss` under an hour, then `h:mm:ss`. Driven
// from an absolute `started_at`, so it stays honest across re-renders,
// backgrounding and route round-trips (unlike a "0 min" that only ticks once a
// minute and looks frozen for the first 60 seconds).

const two = (n: number) => String(n).padStart(2, '0');

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${two(minutes)}:${two(seconds)}`;
  return `${minutes}:${two(seconds)}`;
}

/** Elapsed milliseconds between an ISO `started_at` and `now`, clamped at 0. */
export function elapsedMsSince(startedAt: string | null | undefined, now: number): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, now - start);
}
