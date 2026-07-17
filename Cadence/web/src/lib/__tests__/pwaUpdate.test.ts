import { describe, expect, it, vi } from 'vitest';
import { installPwaUpdateRefresh } from '../pwaUpdate';

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  readyState: DocumentReadyState = 'complete';
}

class FakeWindow extends EventTarget {
  timeoutCallback: (() => void) | null = null;
  setTimeout = (callback: TimerHandler) => {
    this.timeoutCallback = callback as () => void;
    return 1;
  };
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

function setup(controller: unknown) {
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
