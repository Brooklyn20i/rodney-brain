// Per-key action dedupe for frequent mutations (add set, tick a set, log
// cardio…). The ref blocks re-entry SYNCHRONOUSLY so a same-tick double-tap
// can never insert a duplicate row; the state drives disabled buttons. Keyed
// so independent rows still run in parallel.

import { useRef, useState } from 'react';

export function useKeyedLocks() {
  const locks = useRef<Set<string>>(new Set());
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const runLocked = async (key: string, fn: () => Promise<void>) => {
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setBusyKeys((b) => (b.includes(key) ? b : [...b, key]));
    try {
      await fn();
    } catch {
      // Write failures already show as `syncError`; swallow so a same-tick
      // onClick can't raise an unhandled rejection.
    } finally {
      locks.current.delete(key);
      setBusyKeys((b) => b.filter((k) => k !== key));
    }
  };
  const isBusy = (key: string) => busyKeys.includes(key);
  return { runLocked, isBusy };
}
