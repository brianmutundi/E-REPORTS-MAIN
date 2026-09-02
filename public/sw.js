// Minimal service worker — required by browsers to treat the app as installable.
// Intentionally does no caching yet; safe to extend later with offline support.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Pass-through: let the network handle every request for now.
})
