import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app";
import { initTheme } from "./lib/theme";
import { hydrateIfEmpty } from "./seed/hydrate";
import { installFlusherTriggers } from "./sync/triggers";
import { installReconciliation } from "./sync/reconcile";

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

void hydrateIfEmpty()
  .catch((err) => console.error("[forge] hydration failed", err))
  .finally(() => {
    installFlusherTriggers();
    installReconciliation();
  });

if (import.meta.env.DEV) {
  void import("./seed/debug").then((m) => m.installDebugHelpers());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
