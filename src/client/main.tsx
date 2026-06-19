import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app";
import { initTheme } from "./lib/theme";
import { hydrateIfEmpty } from "./seed/hydrate";
import { installFlusherTriggers } from "./sync/triggers";
import { installReconciliation } from "./sync/reconcile";
import { installGlobalErrorHandler } from "./sync/global-error-handler";
import { SettingsProvider } from "./contexts/settings-context";
import { forgeDB } from "./db/forge-db";
import { SettingsSchema, SETTINGS_ID } from "../shared/settings";

installGlobalErrorHandler();
initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

async function bootstrapSettings(): Promise<void> {
  try {
    const count = await forgeDB.settings.count();
    if (count > 0) return; // Already have settings, no-op

    // Try to fetch from server
    try {
      const res = await fetch("/api/v1/settings");
      if (res.ok) {
        const json = await res.json();
        const parsed = SettingsSchema.parse(json);
        await forgeDB.settings.put(parsed);
        return;
      }
    } catch {
      // Network error or server unavailable — fall through to local defaults
    }

    // Offline fallback: create local defaults
    const now = Date.now();
    const defaults = SettingsSchema.parse({
      id: SETTINGS_ID,
      weightUnit: "kg",
      distanceUnit: "km",
      heightUnit: "cm",
      timezone: "America/Chicago",
      weekStartsOn: "mon",
      showRpe: true,
      showCardio: true,
      theme: "system",
      createdAt: now,
      updatedAt: now,
    });
    await forgeDB.settings.put(defaults);
  } catch (err) {
    console.error("[forge] settings bootstrap failed", err);
  }
}

void hydrateIfEmpty()
  .catch((err) => console.error("[forge] hydration failed", err))
  .finally(() => {
    installFlusherTriggers();
    installReconciliation();
  });

void bootstrapSettings();

if (navigator.storage?.persist) {
  void navigator.storage.persist().then((granted) => {
    void forgeDB.meta.put({ key: "storagePersisted", value: String(granted), updatedAt: Date.now() });
    console.log("[forge] storage.persist:", granted);
  });
}

if (import.meta.env.DEV) {
  void import("./seed/debug").then((m) => m.installDebugHelpers());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
