import { describe, it, expect } from "vitest";
import { drainGroupFor } from "../flusher";
import type { PendingWrite } from "../../../shared";

// ─── Causal drain grouping ────────────────────────────────────────────────────
// The flusher drains writes per causal group: a retry blocks only its own group
// so one poisoned write cannot starve unrelated writes behind it. The session
// family (session / session_log / session_times) must share a group because a
// session_log depends on its parent session existing on the server first.

describe("drainGroupFor", () => {
  it("groups the whole session family under 'session'", () => {
    expect(drainGroupFor("session")).toBe("session");
    expect(drainGroupFor("session_log")).toBe("session");
    expect(drainGroupFor("session_times")).toBe("session");
  });

  it("keeps every other entity in its own independent group", () => {
    const independent: PendingWrite["entity"][] = [
      "exercise",
      "equipment",
      "routine",
      "program",
      "program_run",
      "goal",
      "settings",
      "profile",
      "weight_log",
    ];
    for (const entity of independent) {
      expect(drainGroupFor(entity)).toBe(entity);
    }
  });

  it("places independent entities in distinct groups (so they drain in parallel)", () => {
    expect(drainGroupFor("exercise")).not.toBe(drainGroupFor("goal"));
    expect(drainGroupFor("goal")).not.toBe(drainGroupFor("session"));
  });
});

// ─── Per-group blocking semantics (pure simulation) ───────────────────────────
// Mirrors the drainPerGroup loop: iterate FIFO; when a send returns "retry",
// block that group only; entries in already-blocked groups are skipped while
// other groups keep draining.

describe("per-group drain semantics", () => {
  function simulateDrain(
    entries: { id: string; entity: PendingWrite["entity"] }[],
    send: (id: string) => "done" | "retry",
  ): string[] {
    const attempted: string[] = [];
    const blocked = new Set<string>();
    for (const e of entries) {
      const group = drainGroupFor(e.entity);
      if (blocked.has(group)) continue;
      attempted.push(e.id);
      if (send(e.id) === "retry") blocked.add(group);
    }
    return attempted;
  }

  it("a retry on one group does not block writes in other groups", () => {
    const entries = [
      { id: "ex1", entity: "exercise" as const },
      { id: "ex2", entity: "exercise" as const }, // same group as ex1 -> skipped after ex1 retries
      { id: "goal1", entity: "goal" as const }, // independent -> still attempted
      { id: "sess1", entity: "session" as const },
      { id: "log1", entity: "session_log" as const }, // same group as sess1 -> skipped after sess1 retries
    ];
    const attempted = simulateDrain(entries, (id) =>
      id === "ex1" || id === "sess1" ? "retry" : "done",
    );
    expect(attempted).toEqual(["ex1", "goal1", "sess1"]);
    expect(attempted).not.toContain("ex2"); // blocked by ex1's retry
    expect(attempted).not.toContain("log1"); // blocked by sess1's retry (same causal group)
  });

  it("drains everything when no write retries", () => {
    const entries = [
      { id: "a", entity: "exercise" as const },
      { id: "b", entity: "exercise" as const },
      { id: "c", entity: "goal" as const },
    ];
    const attempted = simulateDrain(entries, () => "done");
    expect(attempted).toEqual(["a", "b", "c"]);
  });
});
