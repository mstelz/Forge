import { forgeDB } from "../db/forge-db";
import { hydrateIfEmpty } from "./hydrate";
import { syncLog } from "../sync/sync-logger";

declare global {
  interface Window {
    __forge?: {
      wipeAndRehydrate: () => Promise<void>;
      flushNow: () => Promise<void>;
      reconcileNow: () => Promise<void>;
    };
  }
}

export async function wipeAndRehydrate(): Promise<void> {
  await forgeDB.transaction(
    "rw",
    forgeDB.exercises,
    forgeDB.equipment,
    forgeDB.pendingWrites,
    forgeDB.meta,
    async () => {
      await Promise.all([
        forgeDB.exercises.clear(),
        forgeDB.equipment.clear(),
        forgeDB.pendingWrites.clear(),
        forgeDB.meta.clear(),
      ]);
    },
  );
  await hydrateIfEmpty();
  syncLog({ level: "info", category: "app", message: "Dexie wiped and re-hydrated from seed" });
}

export async function installDebugHelpers(): Promise<void> {
  const { flushNow } = await import("../sync/flusher");
  const { reconcileNow } = await import("../sync/reconcile");
  window.__forge = { wipeAndRehydrate, flushNow, reconcileNow };
}
