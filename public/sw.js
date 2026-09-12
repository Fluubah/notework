/*
 * Deliberately does not cache anything.
 *
 * Its only job is to satisfy the installability criteria browsers apply
 * before offering "Install app" / "Add to Home Screen": they require a
 * registered service worker with a fetch handler. Offline caching is a
 * separate decision -- a stale cache for an app whose data lives in the
 * browser is worse than no cache -- so every request goes straight to the
 * network. Because nothing is stored, this worker can be replaced or
 * unregistered later without stranding anyone on cached assets.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // No respondWith(): the browser handles the request as if we weren't here.
})
