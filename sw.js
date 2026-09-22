// Retire v1's cache-first shell. Never cache itinerary API responses or old JS.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('japan-bros-')) await caches.delete(key);
  await self.clients.claim();
})()));
// No fetch handler: every refresh reaches the network, including /api/trip.
