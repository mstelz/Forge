import { describe, it, expect } from "vitest";
import type { ProgramRun, ProgramRunDayState } from "../../../shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<ProgramRun> = {}): ProgramRun {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    programId: "00000000-0000-0000-0000-000000000001",
    status: "active",
    startedAt: 1000000,
    endedAt: null,
    currentWeekIndex: 0,
    currentDayIndex: 0,
    dayStates: [],
    createdAt: 1000000,
    updatedAt: 1000000,
    ...overrides,
  };
}

function makeDayState(
  weekIndex: number,
  dayIndex: number,
  status: ProgramRunDayState["status"],
  sessionId: string | null = null,
): ProgramRunDayState {
  return {
    id: `state-${weekIndex}-${dayIndex}`,
    weekIndex,
    dayIndex,
    status,
    sessionId,
    updatedAt: Date.now(),
  };
}

// ─── Reconciler logic (pure functions extracted for testing) ──────────────────

function upsertDayState(
  run: ProgramRun,
  weekIndex: number,
  dayIndex: number,
  targetStatus: ProgramRunDayState["status"],
  sessionId: string,
  newStateId: string,
): { run: ProgramRun; changed: boolean } {
  const existingIdx = run.dayStates.findIndex(
    (ds) => ds.weekIndex === weekIndex && ds.dayIndex === dayIndex,
  );

  if (existingIdx === -1) {
    const newDs: ProgramRunDayState = {
      id: newStateId,
      weekIndex,
      dayIndex,
      status: targetStatus,
      sessionId,
      updatedAt: Date.now(),
    };
    return {
      run: { ...run, dayStates: [...run.dayStates, newDs], updatedAt: Date.now() },
      changed: true,
    };
  }

  const existing = run.dayStates[existingIdx]!;
  if (existing.status === targetStatus && existing.sessionId === sessionId) {
    return { run, changed: false };
  }

  const updated: ProgramRunDayState = {
    ...existing,
    status: targetStatus,
    sessionId,
    updatedAt: Date.now(),
  };
  const newDayStates = [...run.dayStates];
  newDayStates[existingIdx] = updated;
  return {
    run: { ...run, dayStates: newDayStates, updatedAt: Date.now() },
    changed: true,
  };
}

function checkAutoComplete(
  run: ProgramRun,
  nonRestDays: { weekIndex: number; dayIndex: number }[],
): boolean {
  if (run.status !== "active" || nonRestDays.length === 0) return false;
  return nonRestDays.every(({ weekIndex, dayIndex }) => {
    const ds = run.dayStates.find(
      (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
    );
    return ds?.status === "completed" || ds?.status === "skipped";
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("reconciler — upserts day-state to completed when session finishes", () => {
  it("creates a new day-state row with status=completed when none exists", () => {
    const run = makeRun();
    const { run: updatedRun, changed } = upsertDayState(
      run,
      0,
      1,
      "completed",
      "sess-001",
      "new-state-id",
    );

    expect(changed).toBe(true);
    const ds = updatedRun.dayStates.find(
      (s) => s.weekIndex === 0 && s.dayIndex === 1,
    );
    expect(ds?.status).toBe("completed");
    expect(ds?.sessionId).toBe("sess-001");
  });

  it("upserts existing active->completed with sessionId link", () => {
    const run = makeRun({
      dayStates: [makeDayState(0, 1, "active", "sess-001")],
    });

    const { run: updatedRun, changed } = upsertDayState(
      run,
      0,
      1,
      "completed",
      "sess-001",
      "unused-id",
    );

    expect(changed).toBe(true);
    const ds = updatedRun.dayStates.find(
      (s) => s.weekIndex === 0 && s.dayIndex === 1,
    );
    expect(ds?.status).toBe("completed");
    expect(ds?.sessionId).toBe("sess-001");
  });

  it("is idempotent — returns changed=false when already completed with same sessionId", () => {
    const run = makeRun({
      dayStates: [makeDayState(0, 1, "completed", "sess-001")],
    });

    const { changed } = upsertDayState(run, 0, 1, "completed", "sess-001", "unused-id");
    expect(changed).toBe(false);
  });
});

describe("reconciler — auto-complete run when all non-rest days resolve", () => {
  it("fires when the last remaining non-rest day transitions to completed", () => {
    // Program has 2 non-rest days: (0,0) and (0,2)
    // Both are now completed
    const nonRestDays = [
      { weekIndex: 0, dayIndex: 0 },
      { weekIndex: 0, dayIndex: 2 },
    ];

    const run = makeRun({
      dayStates: [
        makeDayState(0, 0, "completed", "sess-001"),
        makeDayState(0, 2, "completed", "sess-002"),
      ],
    });

    expect(checkAutoComplete(run, nonRestDays)).toBe(true);
  });

  it("does not fire when one non-rest day remains not_started", () => {
    const nonRestDays = [
      { weekIndex: 0, dayIndex: 0 },
      { weekIndex: 0, dayIndex: 2 },
    ];

    // (0,2) has no day-state row (= not_started)
    const run = makeRun({
      dayStates: [makeDayState(0, 0, "completed", "sess-001")],
    });

    expect(checkAutoComplete(run, nonRestDays)).toBe(false);
  });

  it("fires when a mix of completed + skipped days covers all non-rest days", () => {
    const nonRestDays = [
      { weekIndex: 0, dayIndex: 0 },
      { weekIndex: 0, dayIndex: 2 },
      { weekIndex: 0, dayIndex: 4 },
    ];

    const run = makeRun({
      dayStates: [
        makeDayState(0, 0, "completed", "sess-001"),
        makeDayState(0, 2, "skipped"),
        makeDayState(0, 4, "completed", "sess-003"),
      ],
    });

    expect(checkAutoComplete(run, nonRestDays)).toBe(true);
  });

  it("does not fire for an already-completed run", () => {
    const nonRestDays = [{ weekIndex: 0, dayIndex: 0 }];
    const run = makeRun({
      status: "completed",
      endedAt: 2000000,
      dayStates: [makeDayState(0, 0, "completed", "sess-001")],
    });

    expect(checkAutoComplete(run, nonRestDays)).toBe(false);
  });
});
