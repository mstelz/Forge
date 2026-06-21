import { describe, it, expect } from "vitest";
import type { Program, ProgramDay, ProgramRun, ProgramRunDayState } from "../../../../../shared";
import { DAY_LABELS, getDayState, computeCurrentWeekIndex } from "../schedule-helpers";

let idc = 0;
const id = () => `00000000-0000-0000-0000-${String(++idc).padStart(12, "0")}`;

function day(weekIndex: number, dayIndex: number, opts: Partial<ProgramDay> = {}): ProgramDay {
  return {
    id: id(),
    weekIndex,
    dayIndex,
    order: 0,
    label: null,
    routineId: opts.isRestDay ? null : id(),
    isRestDay: false,
    ...opts,
  };
}

function program(durationWeeks: number, days: ProgramDay[]): Program {
  return { id: id(), name: "P", description: null, durationWeeks, days, createdAt: 1000, updatedAt: 1000 };
}

function dayState(weekIndex: number, dayIndex: number, status: ProgramRunDayState["status"]): ProgramRunDayState {
  return { id: id(), weekIndex, dayIndex, status, sessionId: null, updatedAt: 1000 };
}

function run(overrides: Partial<ProgramRun> = {}): ProgramRun {
  return {
    id: id(),
    programId: id(),
    status: "active",
    startedAt: 1000,
    endedAt: null,
    currentWeekIndex: 0,
    currentDayIndex: 0,
    dayStates: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("getDayState", () => {
  it("returns undefined when there is no run", () => {
    expect(getDayState(null, 0, 0)).toBeUndefined();
    expect(getDayState(undefined, 0, 0)).toBeUndefined();
  });

  it("finds the matching (week, day) state", () => {
    const r = run({ dayStates: [dayState(0, 0, "completed"), dayState(1, 2, "active")] });
    expect(getDayState(r, 1, 2)?.status).toBe("active");
    expect(getDayState(r, 0, 0)?.status).toBe("completed");
    expect(getDayState(r, 3, 3)).toBeUndefined();
  });
});

describe("computeCurrentWeekIndex", () => {
  it("returns -1 when there is no active run", () => {
    const p = program(2, [day(0, 0)]);
    expect(computeCurrentWeekIndex(p, null)).toBe(-1);
    expect(computeCurrentWeekIndex(p, run({ status: "completed" }))).toBe(-1);
  });

  it("returns the week of the first not_started training day", () => {
    const p = program(2, [day(0, 0), day(0, 1), day(1, 0)]);
    // week 0 day 0 completed, day 1 completed -> first not_started is week 1
    const r = run({ dayStates: [dayState(0, 0, "completed"), dayState(0, 1, "completed")] });
    expect(computeCurrentWeekIndex(p, r)).toBe(1);
  });

  it("skips rest days and days without a routine", () => {
    const p = program(1, [
      day(0, 0, { isRestDay: true }),
      day(0, 1, { routineId: null, isRestDay: false }),
      day(0, 2),
    ]);
    // only (0,2) is a real training day and it's not_started -> week 0
    expect(computeCurrentWeekIndex(p, run())).toBe(0);
  });

  it("returns the last week when every training day is done", () => {
    const p = program(2, [day(0, 0), day(1, 0)]);
    const r = run({ dayStates: [dayState(0, 0, "completed"), dayState(1, 0, "completed")] });
    expect(computeCurrentWeekIndex(p, r)).toBe(1);
  });
});

describe("DAY_LABELS", () => {
  it("covers a 7-day week", () => {
    expect(DAY_LABELS).toHaveLength(7);
    expect(DAY_LABELS[0]).toBe("D1");
    expect(DAY_LABELS[6]).toBe("D7");
  });
});
