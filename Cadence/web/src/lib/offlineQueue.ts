// Offline write queue — persists pending mutations to localStorage so they
// survive page reloads and are replayed automatically when the network returns.

export type QueuedOp =
  | { op: 'insert'; table: string; row: Record<string, unknown> }
  | { op: 'update'; table: string; id: string; patch: Record<string, unknown> }
  | { op: 'remove'; table: string; id: string };

interface QueueEntry {
  qid: string;
  timestamp: number;
  op: QueuedOp;
}

const KEY = 'cadence_offline_queue';

function load(): QueueEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persist(entries: QueueEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function enqueue(op: QueuedOp): string {
  const qid = crypto.randomUUID();
  const entries = load();
  entries.push({ qid, timestamp: Date.now(), op });
  persist(entries);
  return qid;
}

export function dequeueAll(): QueueEntry[] {
  return load();
}

export function dropEntry(qid: string): void {
  persist(load().filter((e) => e.qid !== qid));
}

export function clearQueue(): void {
  localStorage.removeItem(KEY);
}

export function queueCount(): number {
  return load().length;
}

// Returns true when the error is a transient network failure rather than a
// permanent validation or auth error. Network errors should be queued for
// retry; validation errors should surface to the user.
export function isNetworkError(error: unknown): boolean {
  if (!navigator.onLine) return true;
  const msg = String((error as any)?.message ?? (error as any)?.code ?? error ?? '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||    // Safari
    msg.includes('timeout') ||
    msg.includes('err_internet')
  );
}
