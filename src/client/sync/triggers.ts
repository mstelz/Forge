import { flushNow } from "./flusher";

const INTERVAL_MS = 30_000;
let installed = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

const safeFlush = () => {
  void flushNow().catch((err) => {
    console.error("[flusher] flushNow threw", err);
  });
};

export function installFlusherTriggers(): void {
  if (installed) return;
  installed = true;

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
