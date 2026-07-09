import { describe, expect, it, vi } from 'vitest';
import { GYM_FOCUS_CLASS, lockCadencePortrait, setGymFocusOrientationActive } from '../orientation';

function makeOrientationWindow() {
  const body = document.createElement('body');
  const lock = vi.fn(() => Promise.resolve());
  const unlock = vi.fn();
  const win = {
    document: { body },
    screen: { orientation: { lock, unlock } },
  } as unknown as Parameters<typeof setGymFocusOrientationActive>[1];
  return { win, body, lock, unlock };
}

describe('gym focus orientation', () => {
  it('locks normal Cadence screens to portrait best-effort', () => {
    const { win, lock } = makeOrientationWindow();

    lockCadencePortrait(win);

    expect(lock).toHaveBeenCalledWith('portrait');
  });

  it('marks Gym Focus as landscape-capable and suppresses the rotate guard without forcing rotation', () => {
    const { win, body, lock, unlock } = makeOrientationWindow();

    setGymFocusOrientationActive(true, win);

    expect(body.classList.contains(GYM_FOCUS_CLASS)).toBe(true);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(lock).not.toHaveBeenCalledWith('landscape');
  });

  it('restores portrait behaviour when leaving Gym Focus', () => {
    const { win, body, lock } = makeOrientationWindow();

    setGymFocusOrientationActive(true, win);
    setGymFocusOrientationActive(false, win);

    expect(body.classList.contains(GYM_FOCUS_CLASS)).toBe(false);
    expect(lock).toHaveBeenLastCalledWith('portrait');
  });
});
