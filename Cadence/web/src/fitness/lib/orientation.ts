type LockableOrientation = {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

type OrientationWindow = Window & {
  screen: Screen & { orientation?: LockableOrientation };
};

const GYM_FOCUS_CLASS = 'gym-focus-orientation-active';

function getOrientation(win: OrientationWindow | undefined): LockableOrientation | undefined {
  return win?.screen?.orientation;
}

export function lockCadencePortrait(win: OrientationWindow | undefined = typeof window === 'undefined' ? undefined : (window as OrientationWindow)) {
  try {
    const orientation = getOrientation(win);
    if (orientation && typeof orientation.lock === 'function') {
      void Promise.resolve(orientation.lock('portrait')).catch(() => {});
    }
  } catch {
    // Unsupported on iOS Safari/desktop; CSS rotate guard is the fallback.
  }
}

export function setGymFocusOrientationActive(active: boolean, win: OrientationWindow | undefined = typeof window === 'undefined' ? undefined : (window as OrientationWindow)) {
  if (!win) return;
  win.document.body.classList.toggle(GYM_FOCUS_CLASS, active);

  try {
    const orientation = getOrientation(win);
    if (!orientation) return;
    if (active) {
      if (typeof orientation.unlock === 'function') orientation.unlock();
    } else {
      lockCadencePortrait(win);
    }
  } catch {
    // Best-effort only. Unsupported platforms still get the CSS guard behaviour.
  }
}

export { GYM_FOCUS_CLASS };
