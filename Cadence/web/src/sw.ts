/// <reference lib="webworker" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};

// Capture this before skipWaiting activates this worker. During a first install
// there is no active worker; during an update it is the stale worker this build
// must replace. Client-side code cannot repair a page still running an older JS
// bundle, so the replacement worker owns the final handover itself.
const replacingActiveWorker = Boolean(self.registration.active);

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Each installed app route must receive its matching static shell. The previous
// generated worker served work.html for every navigation, allowing /financial
// to boot with Work's head/domain state until React corrected it.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/work.html'), {
  allowlist: [/^\/work\/?(?:\?.*)?$/],
}));
registerRoute(new NavigationRoute(createHandlerBoundToURL('/financial.html'), {
  allowlist: [/^\/financial\/?(?:\?.*)?$/],
}));
registerRoute(new NavigationRoute(createHandlerBoundToURL('/health.html'), {
  allowlist: [/^\/(?:health|fitness)\/?(?:\?.*)?$/],
}));

registerRoute(
  /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\//,
  new NetworkFirst({
    cacheName: 'supabase-api-v1',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
  'GET',
);
registerRoute(
  /^https:\/\/[a-z0-9]+\.supabase\.co\/auth\//,
  new NetworkOnly(),
  'GET',
);

self.addEventListener('activate', (event) => {
  if (!replacingActiveWorker) return;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appPaths = new Set(['/work', '/financial', '/health', '/fitness']);

    // Start the navigations but do not await them inside activate. Waiting for a
    // navigation that itself needs this worker to finish activating deadlocks
    // Chromium/WebKit at the deployment boundary.
    for (const client of clients) {
      const url = new URL(client.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      if (url.origin !== self.location.origin || !appPaths.has(path)) continue;

      // WindowClient.navigate re-enters through this newly active worker, which
      // now serves a coherent shell + hashed assets from one precache revision.
      if ('navigate' in client) void client.navigate(client.url);
    }
  })());
});
