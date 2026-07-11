import { useMemo } from 'react';
import { useCadence } from '../../lib/store';
import type { Note } from '../../lib/types';
import { readStrategy, STRATEGY_NOTE_TITLE, emptyWinState } from '../../lib/strategy';
import type { StrategyContent, WinState } from '../../lib/strategy';

// Strategy and win-state live as JSON inside notes — a deliberate privacy
// design (see lib/strategy.ts): confidential text stays behind auth, off the
// public static site. These hooks are the only read/write path.

const WIN_STATE_TITLE = '__win_state__';

export function useStrategy() {
  const { data, insert, update } = useCadence();
  const note = useMemo(() => data.notes.filter((n) => n.title === STRATEGY_NOTE_TITLE)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0], [data.notes]);
  const strategy = useMemo(() => readStrategy(data.notes), [data.notes]);
  const save = (next: StrategyContent) => {
    const body = JSON.stringify(next);
    if (note) update('notes', note.id, { body } as Partial<Note>);
    else insert('notes', { title: STRATEGY_NOTE_TITLE, body } as Partial<Note>);
  };
  return { strategy, save };
}

export function useWinState() {
  const { data, insert, update } = useCadence();
  const note = useMemo(() => data.notes.filter((n) => n.title === WIN_STATE_TITLE)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0], [data.notes]);
  const state: WinState = useMemo(() => {
    if (!note) return emptyWinState();
    try { return { ...emptyWinState(), ...JSON.parse(note.body || '{}') }; }
    catch { return emptyWinState(); }
  }, [note]);
  const save = (mut: (s: WinState) => WinState) => {
    const body = JSON.stringify(mut(state));
    if (note) update('notes', note.id, { body } as Partial<Note>);
    else insert('notes', { title: WIN_STATE_TITLE, body } as Partial<Note>);
  };
  return { state, save };
}
