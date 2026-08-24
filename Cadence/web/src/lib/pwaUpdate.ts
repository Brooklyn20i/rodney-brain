import { pwaUpdatesHeld } from './updateHold';

type RegistrationLike = { update: () => Promise<unknown> | unknown };
type ServiceWorkerContainerLike = EventTarget & {
  controller: unknown;
  getRegistration: () => Promise<RegistrationLike | undefined>;
};

type PwaRefreshDependencies = {
  serviceWorker?: ServiceWorkerContainerLike;
  documentRef?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener' | 'readyState'>;
  windowRef?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout'>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  reload?: () => void;
  buildCommit?: string;
  // False while a reload would interrupt something that must not be
  // interrupted (a live gym session — see updateHold.ts). Checks are skipped
  // and a pending handover reload is deferred until this returns true again.
  isUpdateSafe?: () => boolean;
};

// How often a deferred handover re-checks whether it may reload yet.
const DEFERRED_RELOAD_POLL_MS = 30_000;

/**
 * Keep an installed Cadence PWA on one coherent deployment.
 *
 * Workbox's auto-update worker claims an open iOS PWA immediately, but the
 * already-rendered page keeps its old JS/CSS until it is reloaded. That can
 * leave the light Financial shell paired with stale dark-theme foregrounds.
 * Reload once when a replacement worker takes control, and check for updates
 * whenever the suspended PWA resumes — EXCEPT while a live workout holds
 * updates: reloading mid-set was the "workout stops halfway" bug, so checks
 * pause and any pending handover waits for the session to finish.
 */
export function installPwaUpdateRefresh(deps: PwaRefreshDependencies = {}): () => void {
  const serviceWorker = deps.serviceWorker ?? (
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker as unknown as ServiceWorkerContainerLike
      : undefined
  );
  if (!serviceWorker) return () => undefined;

  const documentRef = deps.documentRef ?? document;
  const windowRef = deps.windowRef ?? window;
  const storage = deps.storage ?? sessionStorage;
  const reload = deps.reload ?? (() => window.location.reload());
  const buildCommit = deps.buildCommit ?? __BUILD_COMMIT__;
  const isUpdateSafe = deps.isUpdateSafe ?? (() => !pwaUpdatesHeld());
  const guardKey = `cad-pwa-controller-reload:${buildCommit}`;
  let hadController = Boolean(serviceWorker.controller);
  let reloading = false;
  let pendingReload = false;
  let stopped = false;

  const checkForUpdate = () => {
    if (!isUpdateSafe()) return; // a found update would claim + reload mid-session
    void serviceWorker.getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined);
  };

  const doReload = () => {
    if (reloading || storage.getItem(guardKey) === '1') return;
    reloading = true;
    storage.setItem(guardKey, '1');
    reload();
  };

  // A handover that arrived mid-session reloads as soon as the hold clears —
  // polled, because the hold is cleared by app code this module can't observe.
  const pollDeferredReload = () => {
    if (stopped || reloading) return;
    if (isUpdateSafe()) {
      pendingReload = false;
      doReload();
      return;
    }
    windowRef.setTimeout(pollDeferredReload, DEFERRED_RELOAD_POLL_MS);
  };

  const onControllerChange = () => {
    // Installing Cadence for the first time should not cause a surprise reload.
    if (!hadController) {
      hadController = true;
      return;
    }
    if (!isUpdateSafe()) {
      // A new deployment claimed the page mid-workout (e.g. the browser ran
      // its own update check). Don't yank the session away — finish it, then
      // hand over.
      if (!pendingReload) {
        pendingReload = true;
        windowRef.setTimeout(pollDeferredReload, DEFERRED_RELOAD_POLL_MS);
      }
      return;
    }
    doReload();
  };

  const onVisibilityChange = () => {
    if (documentRef.visibilityState !== 'visible') {
      // Going to the background is the least disruptive moment to hand over a
      // deferred deployment — the reload is invisible from the Home Screen.
      if (pendingReload && isUpdateSafe()) {
        pendingReload = false;
        doReload();
      }
      return;
    }
    if (pendingReload && isUpdateSafe()) {
      pendingReload = false;
      doReload();
      return;
    }
    checkForUpdate();
  };

  const onLoad = () => checkForUpdate();

  serviceWorker.addEventListener('controllerchange', onControllerChange);
  documentRef.addEventListener('visibilitychange', onVisibilityChange);
  if (documentRef.readyState === 'loading') windowRef.addEventListener('load', onLoad);
  else checkForUpdate();

  // A commit-scoped guard prevents reload loops but must not block the next
  // deployment in the same long-lived iOS PWA session.
  windowRef.setTimeout(() => storage.removeItem(guardKey), 5000);

  return () => {
    stopped = true;
    serviceWorker.removeEventListener('controllerchange', onControllerChange);
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);
    windowRef.removeEventListener('load', onLoad);
  };
}
