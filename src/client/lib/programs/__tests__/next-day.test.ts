import { describe, it, expect } from "vitest";
import { computeCascadeSchedule } from "../next-day";
import type { Program, ProgramRun, ProgramRunDayState } from "../../../../shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Returns midnight local time for "today + offsetDays" as unix ms */
function today(offsetDays = 0): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + offsetDays * MS_PER_DAY;
}

function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function makeDayState(
  weekIndex: number,
  dayIndex: number,
  status: ProgramRunDayState["status"],
  options: { completedAt?: number; sessionId?: string } = {},
): ProgramRunDayState {
  return {
    id: `state-${weekIndex}-${dayIndex}`,
    weekIndex,
    dayIndex,
    status,
    sessionId: options.sessionId ?? null,
    completedAt: options.completedAt,
    updatedAt: Date.now(),
  };
}

/** Two-week program: days 0, 1 are workouts; day 2 is a rest day */
function makeProgram(startAtMs: number): Program {
  return {
    id: "prog-1",
    name: "Test Program",
    durationWeeks: 2,
    days: [
      {
        id: "pd-0-0",
        weekIndex: 0,
        dayIndex: 0,
        routineId: "routine-upper-a",
        isRestDay: false,
        order: 0,
        overrides: null,
      },
      {
        id: "pd-0-1",
        weekIndex: 0,
        dayIndex: 1,
        routineId: "routine-lower-b",
        isRestDay: false,
        order: 0,
        overrides: null,
      },
      {
        id: "pd-0-2",
        weekIndex: 0,
        dayIndex: 2,
        routineId: null,
        isRestDay: true,
        order: 0,
        overrides: null,
      },
    ],
    createdAt: startAtMs,
    updatedAt: startAtMs,
  };
}

function makeRun(startAtMs: number, dayStates: ProgramRunDayState[] = []): ProgramRun {
  return {
    id: "run-1",
    programId: "prog-1",
    status: "active",
    startedAt: startAtMs,
    weekZeroStartDate: startAtMs,
    endedAt: null,
    currentWeekIndex: 0,
    currentDayIndex: 0,
    dayStates,
    createdAt: startAtMs,
    updatedAt: startAtMs,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeCascadeSchedule — normal flow", () => {
  it("maps first pending slot to today when program is overdue", () => {
    const startMs = today(-5); // program started 5 days ago
    const program = makeProgram(startMs);
    const run = makeRun(startMs);

    const cascade = computeCascadeSchedule(program, run, today());

    // Upper A (originally day 0 = 5 days ago) should cascade to today
    expect(cascade.dateToSlot.get(dateKey(today()))).toEqual({
      weekIndex: 0,
      dayIndex: 0,
    });
    // Lower B should cascade to tomorrow
    expect(cascade.dateToSlot.get(dateKey(today(1)))).toEqual({
      weekIndex: 0,
      dayIndex: 1,
    });
  });
});

describe("computeCascadeSchedule — completedAt behavior", () => {
  it("keeps completed shifted slot on its completion date (not original date)", () => {
    // Program started 5 days ago; Upper A was shifted to today and completed today
    const startMs = today(-5);
    const program = makeProgram(startMs);
    const run = makeRun(startMs, [
      makeDayState(0, 0, "completed", { completedAt: today() }),
    ]);

    const cascade = computeCascadeSchedule(program, run, today());

    // Upper A should map to TODAY (its completion date)
    expect(cascade.dateToSlot.get(dateKey(today()))).toEqual({
      weekIndex: 0,
      dayIndex: 0,
    });
  });

  it("cascades next pending slot to day after completion when prior slot was completed today", () => {
    // Upper A completed today → Lower B should cascade to tomorrow
    const startMs = today(-5);
    const program = makeProgram(startMs);
    const run = makeRun(startMs, [
      makeDayState(0, 0, "completed", { completedAt: today() }),
    ]);

    const cascade = computeCascadeSchedule(program, run, today());

    // Lower B must NOT cascade to today
    expect(cascade.dateToSlot.get(dateKey(today()))).not.toEqual({
      weekIndex: 0,
      dayIndex: 1,
    });
    // Lower B must cascade to tomorrow
    expect(cascade.dateToSlot.get(dateKey(today(1)))).toEqual({
      weekIndex: 0,
      dayIndex: 1,
    });
  });

  it("falls back to originalMs when completedAt is absent (backwards compatibility)", () => {
    // Old completed dayState without completedAt — should behave like before
    const startMs = today(-5);
    const program = makeProgram(startMs);
    const run = makeRun(startMs, [
      makeDayState(0, 0, "completed"),  // no completedAt
    ]);

    const cascade = computeCascadeSchedule(program, run, today());

    // Upper A without completedAt pins to original date (5 days ago)
    expect(cascade.slotToMs.get("0:0")).toBe(startMs); // originalMs = startMs + 0 days
  });

  it("completed slot on its original date does not disturb subsequent pending slots", () => {
    // User completed Upper A on time (day 0 = today was original date)
    const startMs = today(); // program starts today
    const program = makeProgram(startMs);
    const run = makeRun(startMs, [
      makeDayState(0, 0, "completed", { completedAt: today() }),
    ]);

    const cascade = computeCascadeSchedule(program, run, today());

    // Lower B (originally tomorrow) should still cascade to tomorrow
    expect(cascade.slotToMs.get("0:1")).toBe(today(1));
  });
});
