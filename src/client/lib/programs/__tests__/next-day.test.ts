import { describe, it, expect } from "vitest";
import { computeCascadeSchedule } from "../next-day";
import type { Program, ProgramRun, ProgramRunDayState } from "../../../../shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Returns midnight local time for "today + offsetDays" as unix ms */
function today(offsetDays = 0): number {
  const d = new Date(2026, 8, 14);
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

  it("keeps the shifted rest day between completed and pending workouts", () => {
    // Program is overdue: Upper A, Rest, Lower A all started before today.
    // Upper A completed today: rest tomorrow, Lower A the following day.
    const startMs = today(-5);
    const program = makeProgramWithRestBetweenWorkouts(startMs);
    const run = makeRun(startMs, [
      makeDayState(0, 0, "completed", { completedAt: today() }),
    ]);

    const cascade = computeCascadeSchedule(program, run, today());

    expect(cascade.dateToSlot.get(dateKey(today(2)))).toEqual({
      weekIndex: 0,
      dayIndex: 2,
    });
    expect(cascade.slotToMs.get("0:1")).toBe(today(1));
    expect(cascade.slotToMs.get("0:2")).toBe(today(2));
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

    // Resume at the first unfinished day, including rest days.
    expect(cascade.dateToSlot.get(dateKey(today(0)))).toEqual({ weekIndex: 0, dayIndex: 2 });
    expect(cascade.dateToSlot.get(dateKey(today(1)))).toEqual({ weekIndex: 0, dayIndex: 3 });
    expect(cascade.dateToSlot.get(dateKey(today(2)))).toEqual({ weekIndex: 0, dayIndex: 4 });
    expect(cascade.dateToSlot.get(dateKey(today(3)))).toEqual({ weekIndex: 0, dayIndex: 5 });
    expect(cascade.dateToSlot.get(dateKey(today(4)))).toEqual({ weekIndex: 0, dayIndex: 6 });
    expect(cascade.dateToSlot.get(dateKey(today(5)))).toEqual({ weekIndex: 1, dayIndex: 0 });
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

  it("rolls an unfinished rest day forward instead of absorbing it", () => {
    const { program, run } = farBehindRun();
    expect(computeCascadeSchedule(program, run, today()).slotToMs.get("0:2")).toBe(today());
  });
});


describe("computeCascadeSchedule — agreed calendar rules", () => {
  const monday = new Date(2026, 8, 7).getTime();
  const day = (offset: number) => new Date(2026, 8, 7 + offset).getTime();

  it("shifts the whole sparse schedule each missed day, preserving gaps", () => {
    const program = makeProgram(monday);
    program.days = [0, 2, 4].map((dayIndex) => ({ ...program.days[0]!, id: `day-${dayIndex}`, dayIndex }));
    for (const missed of [1, 2]) {
      const schedule = computeCascadeSchedule(program, makeRun(monday), day(missed));
      expect([0, 2, 4].map((d) => schedule.slotToMs.get(`0:${d}`))).toEqual([0, 2, 4].map((d) => day(d + missed)));
    }
  });

  it("preserves the rest day after a late workout completion", () => {
    const program = makeProgramWithRestBetweenWorkouts(monday);
    const run = makeRun(monday, [makeDayState(0, 0, "completed", { completedAt: day(1) })]);
    const schedule = computeCascadeSchedule(program, run, day(1));
    expect(schedule.slotToMs.get("0:0")).toBe(day(1));
    expect(schedule.slotToMs.get("0:1")).toBe(day(2));
    expect(schedule.slotToMs.get("0:2")).toBe(day(3));
    expect(schedule.dateToSlot.has(dateKey(monday))).toBe(false);
  });

  it("moves later days earlier only after the offered workout is completed", () => {
    const program = makeFourOnThreeOffProgram(monday);
    const run = makeRun(monday, [
      makeDayState(0, 0, "completed", { completedAt: day(0) }),
      makeDayState(0, 1, "completed", { completedAt: day(1) }),
      makeDayState(0, 2, "completed", { completedAt: day(2) }),
    ]);
    expect(computeCascadeSchedule(program, run, day(2)).slotToMs.get("0:3")).toBe(day(3));
    run.dayStates.push(makeDayState(0, 3, "active"));
    expect(computeCascadeSchedule(program, run, day(2)).slotToMs.get("0:4")).toBe(day(4));
    run.dayStates[3] = makeDayState(0, 3, "completed", { completedAt: day(2) });
    const schedule = computeCascadeSchedule(program, run, day(2));
    expect(schedule.slotToMs.get("0:4")).toBe(day(3));
    expect(schedule.slotToMs.get("0:5")).toBe(day(4));
    expect(schedule.slotToMs.get("1:0")).toBe(day(6));
  });
});
