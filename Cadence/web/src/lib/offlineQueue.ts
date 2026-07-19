// Offline write queue — persists pending mutations to localStorage so they
// survive page reloads and are replayed automatically when the network returns.
// `createOfflineQueue(key)` gives each domain store its own isolated queue
// (Work replays against `public`, Fitness against the `fitness` schema — the
// wrong drainer must never pick up the other's ops). The module-level
// functions remain bound to the original Work-store key.

export type QueuedOp =
  | { op: 'insert'; table: string; row: Record<string, unknown> }
  | { op: 'update'; table: string; id: string; patch: Record<string, unknown> }
  | { op: 'remove'; table: string; id: string };

interface QueueEntry {
  qid: string;
  timestamp: number;
  op: QueuedOp;
}

export interface OfflineQueue {
  enqueue: (op: QueuedOp) => string;
  dequeueAll: () => QueueEntry[];
  dropEntry: (qid: string) => void;
  clearQueue: () => void;
  queueCount: () => number;
}

export function createOfflineQueue(key: string): OfflineQueue {
  const load = (): QueueEntry[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
      return [];
    }
  };
  const persist = (entries: QueueEntry[]): void => {
    localStorage.setItem(key, JSON.stringify(entries));
  };
  return {
    enqueue(op: QueuedOp): string {
      const qid = crypto.randomUUID();
      const entries = load();
      entries.push({ qid, timestamp: Date.now(), op });
      persist(entries);
      return qid;
    },
    dequeueAll: () => load(),
    dropEntry(qid: string): void {
      persist(load().filter((e) => e.qid !== qid));
    },
    clearQueue(): void {
      localStorage.removeItem(key);
    },
    queueCount: () => load().length,
  };
}

const KEY = 'cadence_offline_queue';
const workQueue = createOfflineQueue(KEY);

export function enqueue(op: QueuedOp): string {
  return workQueue.enqueue(op);
}

export function dequeueAll(): QueueEntry[] {
  return workQueue.dequeueAll();
}

export function dropEntry(qid: string): void {
  workQueue.dropEntry(qid);
}

export function clearQueue(): void {
  workQueue.clearQueue();
}

export function queueCount(): number {
  return workQueue.queueCount();
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
