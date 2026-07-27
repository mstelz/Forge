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

/** One-week program: Upper A, rest, Lower A */
function makeProgramWithRestBetweenWorkouts(startAtMs: number): Program {
  return {
    id: "prog-1",
    name: "Test Program",
    durationWeeks: 1,
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
        routineId: null,
        isRestDay: true,
        order: 0,
        overrides: null,
      },
      {
        id: "pd-0-2",
        weekIndex: 0,
        dayIndex: 2,
        routineId: "routine-lower-a",
        isRestDay: false,
        order: 0,
        overrides: null,
      },
    ],
    createdAt: startAtMs,
    updatedAt: startAtMs,
  };
}

/**
 * Realistic two-week program with the common 4-on / 3-off shape:
 * d0 Upper A, d1 Lower A, d2 REST, d3 Upper B, d4 Lower B, d5 REST, d6 REST.
 */
function makeFourOnThreeOffProgram(startAtMs: number): Program {
  const week = [
    { routineId: "routine-upper-a", isRestDay: false },
    { routineId: "routine-lower-a", isRestDay: false },
    { routineId: null, isRestDay: true },
    { routineId: "routine-upper-b", isRestDay: false },
    { routineId: "routine-lower-b", isRestDay: false },
    { routineId: null, isRestDay: true },
    { routineId: null, isRestDay: true },
  ];
  return {
    id: "prog-1",
    name: "Test Program",
    durationWeeks: 2,
    days: [0, 1].flatMap((weekIndex) =>
      week.map((day, dayIndex) => ({
        id: `pd-${weekIndex}-${dayIndex}`,
        weekIndex,
        dayIndex,
        routineId: day.routineId,
        isRestDay: day.isRestDay,
        order: 0,
        overrides: null,
      })),
    ) as Program["days"],
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

  it("does not let an overdue rest day displace the next playable workout", () => {
    // Program is overdue: Upper A, Rest, Lower A all started before today.
    // Upper A was completed today, so Lower A should be tomorrow.
    const startMs = today(-5);
    const program = makeProgramWithRestBetweenWorkouts(startMs);
    const run = makeRun(startMs, [
      makeDayState(0, 0, "completed", { completedAt: today() }),
    ]);

    const cascade = computeCascadeSchedule(program, run, today());

    expect(cascade.dateToSlot.get(dateKey(today(1)))).toEqual({
      weekIndex: 0,
      dayIndex: 2,
    });
    expect(cascade.slotToMs.get("0:1")).toBe(startMs + MS_PER_DAY);
    expect(cascade.slotToMs.get("0:2")).toBe(today(1));
  });
});

describe("computeCascadeSchedule — rest days in the forward schedule", () => {
  // Mirrors the real-world report: a 4-on/3-off run abandoned for two months.
  // The catch-up must not flatten the program into an unbroken run of workouts.
  function farBehindRun() {
    const startMs = today(-59);
    return {
      startMs,
      program: makeFourOnThreeOffProgram(startMs),
      run: makeRun(startMs, [
        makeDayState(0, 0, "skipped"),
        makeDayState(0, 1, "completed"),
      ]),
    };
  }

  it("cascades rest days that follow the resumption point", () => {
    const { program, run } = farBehindRun();
    const cascade = computeCascadeSchedule(program, run, today());

    // Resume with the next unresolved workout today, then follow the program
    // order — including its rest days — on consecutive calendar days.
    expect(cascade.dateToSlot.get(dateKey(today(0)))).toEqual({ weekIndex: 0, dayIndex: 3 });
    expect(cascade.dateToSlot.get(dateKey(today(1)))).toEqual({ weekIndex: 0, dayIndex: 4 });
    expect(cascade.dateToSlot.get(dateKey(today(2)))).toEqual({ weekIndex: 0, dayIndex: 5 });
    expect(cascade.dateToSlot.get(dateKey(today(3)))).toEqual({ weekIndex: 0, dayIndex: 6 });
    expect(cascade.dateToSlot.get(dateKey(today(4)))).toEqual({ weekIndex: 1, dayIndex: 0 });
  });

  it("keeps the program's workout density instead of scheduling one every day", () => {
    const { program, run } = farBehindRun();
    const cascade = computeCascadeSchedule(program, run, today());

    const workoutDays = Array.from({ length: 7 }, (_, i) => today(i)).filter((ms) => {
      const slot = cascade.dateToSlot.get(dateKey(ms));
      if (!slot) return false;
      const entry = program.days.find(
        (pd) => pd.weekIndex === slot.weekIndex && pd.dayIndex === slot.dayIndex,
      );
      return entry != null && !entry.isRestDay && entry.routineId != null;
    });

    // 4-on/3-off means at most 4 workouts land in any 7-day window.
    expect(workoutDays).toHaveLength(4);
  });

  it("absorbs an overdue rest day that precedes the resumption point", () => {
    const { startMs, program, run } = farBehindRun();
    // w0d2 sits between the already-resolved w0d1 and the next pending workout,
    // so it stays on its original (past) date rather than consuming a future day.
    expect(computeCascadeSchedule(program, run, today()).slotToMs.get("0:2")).toBe(
      startMs + 2 * MS_PER_DAY,
    );
  });
});
