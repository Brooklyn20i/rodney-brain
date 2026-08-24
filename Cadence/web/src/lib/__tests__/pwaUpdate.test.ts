import { describe, expect, it, vi } from 'vitest';
import { installPwaUpdateRefresh } from '../pwaUpdate';

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  readyState: DocumentReadyState = 'complete';
}

class FakeWindow extends EventTarget {
  timeoutCallbacks: Array<() => void> = [];
  setTimeout = (callback: TimerHandler) => {
    this.timeoutCallbacks.push(callback as () => void);
    return this.timeoutCallbacks.length;
  };
  runTimeouts() {
    const pending = this.timeoutCallbacks;
    this.timeoutCallbacks = [];
    for (const cb of pending) cb();
  }
}

class FakeServiceWorkerContainer extends EventTarget {
  controller: unknown;
  update = vi.fn(async () => undefined);

  constructor(controller: unknown) {
    super();
    this.controller = controller;
  }

  getRegistration = vi.fn(async () => ({ update: this.update }));
}

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function setup(controller: unknown, isUpdateSafe?: () => boolean) {
  const serviceWorker = new FakeServiceWorkerContainer(controller);
  const documentRef = new FakeDocument();
  const windowRef = new FakeWindow();
  const reload = vi.fn();
  const session = storage();
  const cleanup = installPwaUpdateRefresh({
    serviceWorker: serviceWorker as never,
    documentRef: documentRef as never,
    windowRef: windowRef as never,
    storage: session,
    reload,
    buildCommit: 'abc1234',
    isUpdateSafe,
  });
  return { serviceWorker, documentRef, windowRef, reload, session, cleanup };
}

describe('installed PWA deployment refresh', () => {
  it('reloads exactly once when a replacement service worker takes control', () => {
    const { serviceWorker, reload } = setup({ scriptURL: '/sw.js' });

    serviceWorker.dispatchEvent(new Event('controllerchange'));
    serviceWorker.dispatchEvent(new Event('controllerchange'));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the first service worker controls a new installation', () => {
    const { serviceWorker, reload } = setup(null);

    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();

    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('checks for a new deployment on load and whenever a suspended PWA resumes', async () => {
    const { serviceWorker, documentRef } = setup({ scriptURL: '/sw.js' });
    await Promise.resolve();
    expect(serviceWorker.update).toHaveBeenCalledTimes(1);

    documentRef.visibilityState = 'hidden';
    documentRef.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(serviceWorker.update).toHaveBeenCalledTimes(1);

    documentRef.visibilityState = 'visible';
    documentRef.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(serviceWorker.update).toHaveBeenCalledTimes(2);
  });
});

describe('live-workout update hold', () => {
  it('skips update checks entirely while the hold is up — resuming mid-workout finds no new deploy', async () => {
    const { serviceWorker, documentRef } = setup({ scriptURL: '/sw.js' }, () => false);
    await Promise.resolve();
    expect(serviceWorker.update).not.toHaveBeenCalled();

    documentRef.visibilityState = 'visible';
    documentRef.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(serviceWorker.update).not.toHaveBeenCalled();
  });

  it('defers a handover that lands mid-workout and reloads once the session ends (poll)', () => {
    let safe = false;
    const { serviceWorker, windowRef, reload } = setup({ scriptURL: '/sw.js' }, () => safe);

    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled(); // mid-set: no yank

    windowRef.runTimeouts(); // still unsafe — poll re-arms, no reload
    expect(reload).not.toHaveBeenCalled();

    safe = true; // workout finished
    windowRef.runTimeouts();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('hands a deferred deployment over when the app is backgrounded after the session', () => {
    let safe = false;
    const { serviceWorker, documentRef, reload } = setup({ scriptURL: '/sw.js' }, () => safe);

    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();

    // Backgrounding mid-workout must NOT reload either.
    documentRef.visibilityState = 'hidden';
    documentRef.dispatchEvent(new Event('visibilitychange'));
    expect(reload).not.toHaveBeenCalled();

    safe = true; // workout finished, then app backgrounded — invisible moment
    documentRef.dispatchEvent(new Event('visibilitychange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('resuming after the session ended completes the deferred handover', () => {
    let safe = false;
    const { serviceWorker, documentRef, reload } = setup({ scriptURL: '/sw.js' }, () => safe);

    serviceWorker.dispatchEvent(new Event('controllerchange'));
    safe = true;
    documentRef.visibilityState = 'visible';
    documentRef.dispatchEvent(new Event('visibilitychange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
