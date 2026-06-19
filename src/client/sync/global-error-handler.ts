import { syncLog } from "./sync-logger";

let installed = false;

/**
 * Route otherwise-invisible global failures — unhandled promise rejections and
 * uncaught errors that escape React's render tree (event handlers, async
 * callbacks, timers) — through `syncLog` so they show up in the debug log
 * instead of vanishing into the console on a device with no devtools open.
 */
export function installGlobalErrorHandler(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    syncLog({
      level: "error",
      category: "app",
      message: `unhandled rejection: ${message}`,
      detail: reason instanceof Error ? reason.stack?.slice(0, 1000) : undefined,
    });
  });

  window.addEventListener("error", (event) => {
    // Ignore ResourceLoadingError-style events (no `error`), which are noisy and
    // not actionable failures of app logic.
    if (!event.error) return;
    const err = event.error as Error;
    syncLog({
      level: "error",
      category: "app",
      message: `uncaught error: ${err.message ?? event.message}`,
      detail: err.stack?.slice(0, 1000),
    });
  });
}
