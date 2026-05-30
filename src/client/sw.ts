/// <reference lib="WebWorker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Injected by vite-plugin-pwa — the typed precache manifest.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
precacheAndRoute((self as any).__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// SPA navigation fallback — all navigations serve /index.html
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/index.html").then((r) => r ?? Response.error()),
      ),
    );
  }
});

// Background Sync — when the browser fires a sync event, tell all open clients
// to flush their pending write queue (they own the IndexedDB, not the SW).
self.addEventListener("sync", (event) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncEvent = event as any as { tag: string; waitUntil: (p: Promise<void>) => void };
  if (syncEvent.tag === "forge-flush") {
    syncEvent.waitUntil(notifyClientsToFlush());
  }
});

async function notifyClientsToFlush(): Promise<void> {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
  for (const client of clients) {
    client.postMessage({ type: "forge-flush" });
  }
}
