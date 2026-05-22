import { describe, it, expect } from "vitest";
import type { Session, SessionSetLog } from "../../../../shared";
import {
  getMondayWeekStart,
  computeStreakWeeks,
  computeWeeklyVolumeKg,
  calendarWeekDays,
  toYMD,
} from "../../../home/state";
import { isVolumeLog } from "../../../hooks/use-history";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    status: "finished",
    sourceType: "freeform",
    sourceRoutineId: null,
    sourceProgramId: null,
    sourceProgramWeekIndex: null,
    sourceProgramDayIndex: null,
    templateSnapshot: null,
    liveStructure: '{"blocks":[]}',
    restTimer: null,
    title: null,
    notes: null,
    startedAt: 1000000,
    endedAt: 1003600,
    pausedAt: null,
    createdAt: 1000000,
    updatedAt: 1000000,
    ...overrides,
  };
}

function makeLog(overrides: Partial<SessionSetLog> = {}): SessionSetLog {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    sessionId: "00000000-0000-0000-0000-000000000002",
    performedExerciseId: "00000000-0000-0000-0000-000000000003",
    exerciseId: "ex-1",
    sessionItemId: "00000000-0000-0000-0000-000000000004",
    plannedSetId: null,
    order: 0,
    reps: 5,
    weightKg: 100,
    rpe: null,
    durationSec: null,
    distanceM: null,
    notes: null,
    setType: "normal",
    status: "logged",
    loggedAt: 1000000,
    restAfterSec: null,
    enteredWeight: null,
    enteredWeightUnit: null,
    enteredDistance: null,
    enteredDistanceUnit: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test: getMondayWeekStart
// ---------------------------------------------------------------------------

describe("getMondayWeekStart", () => {
  it("returns Monday when given a Monday", () => {
    // 2024-01-15 is a Monday
    const monday = new Date(2024, 0, 15);
    const result = getMondayWeekStart(monday);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(15);
  });

  it("returns the previous Monday when given a Wednesday", () => {
    // 2024-01-17 is a Wednesday
    const wednesday = new Date(2024, 0, 17);
    const result = getMondayWeekStart(wednesday);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(15);
  });

  it("returns the previous Monday when given a Sunday", () => {
    // 2024-01-21 is a Sunday
    const sunday = new Date(2024, 0, 21);
    const result = getMondayWeekStart(sunday);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(15);
  });

  it("sets hours to 00:00:00.000", () => {
    const d = new Date(2024, 0, 17, 14, 30, 0);
    const result = getMondayWeekStart(d);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test: calendarWeekDays emits 7 entries Mon–Sun
// ---------------------------------------------------------------------------

describe("calendarWeekDays", () => {
  it("always emits exactly 7 entries", () => {
    const result = calendarWeekDays(new Date(2024, 0, 17)); // Wednesday
    expect(result).toHaveLength(7);
  });

  it("starts on Monday and ends on Sunday", () => {
    const result = calendarWeekDays(new Date(2024, 0, 17)); // Wednesday Jan 17
    expect(result[0]!.getDay()).toBe(1); // Monday
    expect(result[6]!.getDay()).toBe(0); // Sunday
    expect(result[0]!.getDate()).toBe(15); // Jan 15
    expect(result[6]!.getDate()).toBe(21); // Jan 21
  });
});

// ---------------------------------------------------------------------------
// Test: weekly volume predicate (must match workout-history exactly)
// ---------------------------------------------------------------------------

describe("isVolumeLog — weekly volume predicate", () => {
  it("includes normal set with reps > 0 and weightKg > 0", () => {
    const log = makeLog({ setType: "normal", status: "logged", reps: 5, weightKg: 100 });
    expect(isVolumeLog(log)).toBe(true);
  });

  it("includes amrap set with reps > 0 and weightKg > 0", () => {
    const log = makeLog({ setType: "amrap", status: "logged", reps: 12, weightKg: 60 });
    expect(isVolumeLog(log)).toBe(true);
  });

  it("excludes skipped set", () => {
    const log = makeLog({ status: "skipped" });
    expect(isVolumeLog(log)).toBe(false);
  });

  it("excludes zero reps", () => {
    const log = makeLog({ reps: 0, weightKg: 100 });
    expect(isVolumeLog(log)).toBe(false);
  });

  it("excludes null reps", () => {
    const log = makeLog({ reps: null, weightKg: 100 });
    expect(isVolumeLog(log)).toBe(false);
  });

  it("excludes zero weightKg", () => {
    const log = makeLog({ reps: 5, weightKg: 0 });
    expect(isVolumeLog(log)).toBe(false);
  });

  it("excludes null weightKg", () => {
    const log = makeLog({ reps: 5, weightKg: null });
    expect(isVolumeLog(log)).toBe(false);
  });

  it("excludes warmup set type", () => {
    // warmup is not in the allowed set types for volume
    const log = makeLog({ setType: "warmup", status: "logged", reps: 5, weightKg: 50 });
    expect(isVolumeLog(log)).toBe(false);
  });
});

describe("computeWeeklyVolumeKg", () => {
  it("sums weightKg * reps for volume-qualifying logs", () => {
    const logs = [
      makeLog({ id: "1", reps: 5, weightKg: 100, setType: "normal", status: "logged" }),
      makeLog({ id: "2", reps: 3, weightKg: 120, setType: "normal", status: "logged" }),
    ];
    const result = computeWeeklyVolumeKg(logs);
    expect(result).toBe(5 * 100 + 3 * 120); // 860
  });

  it("returns 0 for empty log list", () => {
    expect(computeWeeklyVolumeKg([])).toBe(0);
  });

  it("excludes skipped logs", () => {
    const logs = [
      makeLog({ id: "1", reps: 5, weightKg: 100, status: "logged" }),
      makeLog({ id: "2", reps: 5, weightKg: 100, status: "skipped" }),
    ];
    expect(computeWeeklyVolumeKg(logs)).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Test: computeStreakWeeks
// ---------------------------------------------------------------------------

describe("computeStreakWeeks", () => {
  it("returns 0 when no sessions", () => {
    const now = new Date(2024, 0, 17); // Wednesday
    expect(computeStreakWeeks([], now)).toBe(0);
  });

  it("returns 1 when only this week has a session", () => {
    const now = new Date(2024, 0, 17); // Wednesday Jan 17
    // Session on Jan 15 (same week)
    const s = makeSession({
      endedAt: new Date(2024, 0, 15).getTime(),
    });
    expect(computeStreakWeeks([s], now)).toBe(1);
  });

  it("returns 1 when only last week has a session (this week is empty)", () => {
    const now = new Date(2024, 0, 17); // Wednesday Jan 17
    // Session on Jan 8 (previous week)
    const s = makeSession({
      endedAt: new Date(2024, 0, 8).getTime(),
    });
    expect(computeStreakWeeks([s], now)).toBe(1);
  });

  it("returns 0 when no sessions and this week is empty", () => {
    const now = new Date(2024, 0, 17);
    expect(computeStreakWeeks([], now)).toBe(0);
  });

  it("counts consecutive weeks correctly", () => {
    const now = new Date(2024, 0, 17); // Wednesday Jan 17 (this week = Jan 15–21)
    const sessions = [
      // This week
      makeSession({ id: "1", endedAt: new Date(2024, 0, 15).getTime() }),
      // Last week (Jan 8–14)
      makeSession({ id: "2", endedAt: new Date(2024, 0, 8).getTime() }),
      // Two weeks ago (Jan 1–7)
      makeSession({ id: "3", endedAt: new Date(2024, 0, 1).getTime() }),
    ];
    expect(computeStreakWeeks(sessions, now)).toBe(3);
  });

  it("stops counting at a gap week", () => {
    const now = new Date(2024, 0, 17); // Wednesday Jan 17
    const sessions = [
      // This week
      makeSession({ id: "1", endedAt: new Date(2024, 0, 15).getTime() }),
      // Last week — MISSING (gap)
      // Two weeks ago (Jan 1–7)
      makeSession({ id: "3", endedAt: new Date(2024, 0, 1).getTime() }),
    ];
    // Should count 1 (this week only, last week has a gap)
    expect(computeStreakWeeks(sessions, now)).toBe(1);
  });

  it("returns 0 for in_progress sessions (not finished)", () => {
    const now = new Date(2024, 0, 17);
    const s = makeSession({
      status: "in_progress",
      endedAt: null,
    });
    expect(computeStreakWeeks([s], now)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test: toYMD
// ---------------------------------------------------------------------------

describe("toYMD", () => {
  it("returns correct year, month (1-based), day", () => {
    const d = new Date(2024, 2, 15); // March 15, 2024
    expect(toYMD(d)).toEqual({ y: 2024, m: 3, d: 15 });
  });

  it("handles January (month 1)", () => {
    const d = new Date(2024, 0, 1);
    expect(toYMD(d)).toEqual({ y: 2024, m: 1, d: 1 });
  });
});
