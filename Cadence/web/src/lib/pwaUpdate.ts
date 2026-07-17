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
};

/**
 * Keep an installed Cadence PWA on one coherent deployment.
 *
 * Workbox's auto-update worker claims an open iOS PWA immediately, but the
 * already-rendered page keeps its old JS/CSS until it is reloaded. That can
 * leave the light Financial shell paired with stale dark-theme foregrounds.
 * Reload once when a replacement worker takes control, and check for updates
 * whenever the suspended PWA resumes.
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
  const guardKey = `cad-pwa-controller-reload:${buildCommit}`;
  let hadController = Boolean(serviceWorker.controller);
  let reloading = false;

  const checkForUpdate = () => {
    void serviceWorker.getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined);
  };

  const onControllerChange = () => {
    // Installing Cadence for the first time should not cause a surprise reload.
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloading || storage.getItem(guardKey) === '1') return;
    reloading = true;
    storage.setItem(guardKey, '1');
    reload();
  };

  const onVisibilityChange = () => {
    if (documentRef.visibilityState === 'visible') checkForUpdate();
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
    serviceWorker.removeEventListener('controllerchange', onControllerChange);
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);
    windowRef.removeEventListener('load', onLoad);
  };
}
