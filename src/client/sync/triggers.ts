import { flushNow } from "./flusher";
import { forgeDB } from "../db/forge-db";

const INTERVAL_MS = 30_000;
let installed = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

const safeFlush = () => {
  void flushNow().catch((err) => {
    console.error("[flusher] flushNow threw", err);
  });
};

function tryRegisterBackgroundSync(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (reg as any).sync?.register("forge-flush");
    })
    .catch(() => { /* not supported or HTTPS required */ });
}

export function installFlusherTriggers(): void {
  if (installed) return;
  installed = true;

  // Flush immediately whenever a new pending write is queued
  forgeDB.pendingWrites.hook("creating", () => {
    setTimeout(safeFlush, 0);
    tryRegisterBackgroundSync();
  });

  // Listen for SW-triggered flush (Background Sync API postMessage)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if ((event.data as { type?: string })?.type === "forge-flush") safeFlush();
    });
  }

  window.addEventListener("online", safeFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") safeFlush();
  });
  window.addEventListener("focus", safeFlush);

  intervalId = setInterval(safeFlush, INTERVAL_MS);

  safeFlush();
}

export function uninstallFlusherTriggers(): void {
  if (!installed) return;
  installed = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
