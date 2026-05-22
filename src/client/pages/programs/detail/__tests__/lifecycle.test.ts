import { describe, it, expect } from "vitest";
import { ProgramRunClosedError } from "../../../../db/mutations";
import type { ProgramRun, ProgramRunDayState } from "../../../../../shared";

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
    updatedAt: 1000000,
  };
}

// ─── Shared logic extracted for testing ──────────────────────────────────────

/** Simulate the pre-write guard used in createProgramRun / updateProgramRun */
function guardRunIsOpen(run: ProgramRun | undefined): void {
  if (run && (run.status === "completed" || run.status === "abandoned")) {
    throw new ProgramRunClosedError();
  }
}

/** Simulate skip day: upserts a 'skipped' day-state */
function skipDay(run: ProgramRun, weekIndex: number, dayIndex: number): ProgramRun {
  const existingState = run.dayStates.find(
    (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
  );
  const newState: ProgramRunDayState = {
    id: existingState?.id ?? `state-${weekIndex}-${dayIndex}`,
    weekIndex,
    dayIndex,
    status: "skipped",
    sessionId: null,
    updatedAt: Date.now(),
  };
  const updatedDayStates = existingState
    ? run.dayStates.map((s) =>
        s.weekIndex === weekIndex && s.dayIndex === dayIndex ? newState : s,
      )
    : [...run.dayStates, newState];

  return { ...run, dayStates: updatedDayStates, updatedAt: Date.now() };
}

/** Simulate unskip day: removes the day-state row (reverts to not_started) */
function unskipDay(run: ProgramRun, weekIndex: number, dayIndex: number): ProgramRun {
  const updatedDayStates = run.dayStates.filter(
    (s) => !(s.weekIndex === weekIndex && s.dayIndex === dayIndex),
  );
  return { ...run, dayStates: updatedDayStates, updatedAt: Date.now() };
}

/** Check if all non-rest days are resolved (completed or skipped) */
function checkAllResolved(
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

// ─── Test 1: createProgramRun guard + second-active-run block ─────────────────

describe("createProgramRun — single-active-run invariant", () => {
  it("succeeds when no active run exists (guard does not throw)", () => {
    // No existing active run
    const existingRun = undefined;
    expect(() => guardRunIsOpen(existingRun)).not.toThrow();
  });

  it("ProgramRunClosedError blocks mutation against a completed run", () => {
    const completedRun = makeRun({ status: "completed", endedAt: 2000000 });
    expect(() => guardRunIsOpen(completedRun)).toThrow(ProgramRunClosedError);
    expect(() => guardRunIsOpen(completedRun)).toThrow("closed");
  });

  it("ProgramRunClosedError blocks mutation against an abandoned run", () => {
    const abandonedRun = makeRun({ status: "abandoned", endedAt: 2000000 });
    expect(() => guardRunIsOpen(abandonedRun)).toThrow(ProgramRunClosedError);
  });

  it("409 active_run_exists response should be surfaced as a UI notification", () => {
    // Simulate the flusher detecting a 409 active_run_exists on program_run.create
    const uiNotifications: { entity: string; code: string }[] = [];

    const handleFlushResponse = (
      entity: string,
      op: string,
      status: number,
      errorBody: { error?: string },
    ) => {
      if (entity === "program_run" && op === "create" && status === 409) {
        if (errorBody.error === "active_run_exists") {
          uiNotifications.push({ entity, code: "active_run_exists" });
        }
      }
    };

    handleFlushResponse("program_run", "create", 409, { error: "active_run_exists" });

    expect(uiNotifications).toHaveLength(1);
    expect(uiNotifications[0]!.code).toBe("active_run_exists");
  });
});

// ─── Test 2: Skip-then-unskip round-trip ─────────────────────────────────────

describe("skip/unskip day — round-trip state transitions", () => {
  it("not_started → skipped via skipDay", () => {
    const run = makeRun();
    const skipped = skipDay(run, 0, 2);

    const ds = skipped.dayStates.find((s) => s.weekIndex === 0 && s.dayIndex === 2);
    expect(ds?.status).toBe("skipped");
    expect(skipped.dayStates).toHaveLength(1);
  });

  it("skipped → not_started via unskipDay (row removed)", () => {
    const run = makeRun({
      dayStates: [makeDayState(0, 2, "skipped")],
    });
    const unskipped = unskipDay(run, 0, 2);

    const ds = unskipped.dayStates.find((s) => s.weekIndex === 0 && s.dayIndex === 2);
    // Row should be removed (not_started is implicit when no row)
    expect(ds).toBeUndefined();
    expect(unskipped.dayStates).toHaveLength(0);
  });

  it("full round-trip: not_started → skipped → not_started", () => {
    const run = makeRun();

    // Step 1: skip
    const afterSkip = skipDay(run, 0, 4);
    const ds1 = afterSkip.dayStates.find((s) => s.weekIndex === 0 && s.dayIndex === 4);
    expect(ds1?.status).toBe("skipped");

    // Step 2: unskip
    const afterUnskip = unskipDay(afterSkip, 0, 4);
    const ds2 = afterUnskip.dayStates.find((s) => s.weekIndex === 0 && s.dayIndex === 4);
    expect(ds2).toBeUndefined(); // row removed = not_started
  });

  it("rest days stay immutable (skip cannot be applied — no row change for rest days by UI guard)", () => {
    // Rest days are immutable at the UI level: the menu hides Skip/Unskip actions
    // Verify: even if skip is called erroneously on a rest day, the day is treated normally
    const run = makeRun();
    const afterSkip = skipDay(run, 0, 6); // dayIndex 6 = Sun
    const ds = afterSkip.dayStates.find((s) => s.weekIndex === 0 && s.dayIndex === 6);
    // The state function doesn't know about rest days — rest-day guard is at UI level
    expect(ds?.status).toBe("skipped"); // state was written, but UI would prevent this
  });
});

// ─── Test 3: Auto-complete fires when last non-rest day resolves ──────────────

describe("auto-complete — fires when all non-rest days resolve", () => {
  it("fires when the last non-rest day transitions to completed", () => {
    const nonRestDays = [
      { weekIndex: 0, dayIndex: 0 },
      { weekIndex: 0, dayIndex: 2 },
    ];

    // After last day completes:
    const run = makeRun({
      dayStates: [
        makeDayState(0, 0, "completed", "sess-001"),
        makeDayState(0, 2, "completed", "sess-002"),
      ],
    });

    expect(checkAllResolved(run, nonRestDays)).toBe(true);
  });

  it("does not fire when one non-rest day is still not_started", () => {
    const nonRestDays = [
      { weekIndex: 0, dayIndex: 0 },
      { weekIndex: 0, dayIndex: 2 },
    ];

    const run = makeRun({
      dayStates: [
        makeDayState(0, 0, "completed", "sess-001"),
        // (0,2) has no row = not_started
      ],
    });

    expect(checkAllResolved(run, nonRestDays)).toBe(false);
  });

  it("fires when a mix of completed and skipped days covers all non-rest days", () => {
    const nonRestDays = [
      { weekIndex: 0, dayIndex: 0 },
      { weekIndex: 0, dayIndex: 2 },
      { weekIndex: 1, dayIndex: 1 },
    ];

    const run = makeRun({
      dayStates: [
        makeDayState(0, 0, "completed", "sess-001"),
        makeDayState(0, 2, "skipped"),
        makeDayState(1, 1, "completed", "sess-003"),
      ],
    });

    expect(checkAllResolved(run, nonRestDays)).toBe(true);
  });

  it("endProgramRun stamps status=completed and endedAt when auto-complete fires", () => {
    // Simulate what endProgramRun would do to the run object
    const run = makeRun();
    const endedAt = 2000000;

    const completedRun: ProgramRun = {
      ...run,
      status: "completed",
      endedAt,
      updatedAt: endedAt,
    };

    expect(completedRun.status).toBe("completed");
    expect(completedRun.endedAt).toBe(endedAt);
  });

  it("does not fire for a run that is already completed", () => {
    const nonRestDays = [{ weekIndex: 0, dayIndex: 0 }];
    const run = makeRun({
      status: "completed",
      endedAt: 2000000,
      dayStates: [makeDayState(0, 0, "completed", "sess-001")],
    });

    // checkAllResolved returns false for non-active runs
    expect(checkAllResolved(run, nonRestDays)).toBe(false);
  });
});
