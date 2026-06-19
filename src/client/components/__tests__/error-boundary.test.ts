import { describe, it, expect, beforeEach } from "vitest";
import { ErrorBoundary } from "../error-boundary";
import { getSyncLogs, clearSyncLogs } from "../../sync/sync-logger";

// These exercise the boundary's pure logging contract without a DOM: the static
// state derivation and the componentDidCatch -> syncLog routing. Rendering the
// recovery UI is covered by the app build / manual verification (no jsdom in the
// test env).

describe("ErrorBoundary", () => {
  beforeEach(() => clearSyncLogs());

  it("getDerivedStateFromError stores the error so the fallback renders", () => {
    const err = new Error("kaboom");
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({ error: err });
  });

  it("componentDidCatch routes the failure through syncLog under the 'app' category", () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error("render blew up"), {
      componentStack: "\n    at HomePage\n    at App",
    });

    const logs = getSyncLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: "error",
      category: "app",
      message: "render error: render blew up",
    });
    expect(logs[0]?.detail).toContain("at HomePage");
  });
});
