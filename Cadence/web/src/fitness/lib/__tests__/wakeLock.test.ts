import { describe, expect, it, vi } from 'vitest';
import { createWakeLock } from '../wakeLock';

function supportedNav() {
  const sentinel = { released: false, release: vi.fn(async () => { sentinel.released = true; }) };
  const request = vi.fn(async () => sentinel);
  return { nav: { wakeLock: { request } }, request, sentinel };
}

describe('wake lock manager', () => {
  it('is a graceful no-op where unsupported', async () => {
    const wl = createWakeLock({});
    expect(wl.isSupported()).toBe(false);
    await expect(wl.request()).resolves.toBeUndefined();
    await expect(wl.release()).resolves.toBeUndefined();
  });

  it('requests and releases a screen lock where supported', async () => {
    const { nav, request, sentinel } = supportedNav();
    const wl = createWakeLock(nav);
    expect(wl.isSupported()).toBe(true);
    await wl.request();
    expect(request).toHaveBeenCalledWith('screen');
    await wl.release();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('does not double-acquire while a lock is held', async () => {
    const { nav, request } = supportedNav();
    const wl = createWakeLock(nav);
    await wl.request();
    await wl.request();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected request', async () => {
    const request = vi.fn(async () => {
      throw new Error('denied');
    });
    const wl = createWakeLock({ wakeLock: { request } });
    await expect(wl.request()).resolves.toBeUndefined();
  });
});
