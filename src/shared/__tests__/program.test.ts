import { describe, it, expect } from "vitest";
import { ProgramCreateInput } from "../program";
import { ProgramRunCreateInput, ProgramRunUpdateInput } from "../program-run";
import { PendingEntityEnum } from "../pending-write";

// ─── Test 1: Valid ProgramCreateInput ─────────────────────────────────────────

describe("ProgramCreateInput", () => {
  it("parses valid input with sparse days and rejects routineId + isRestDay=true", () => {
    const validInput = {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Hypertrophy Block",
      durationWeeks: 4,
      days: [
        {
          id: "00000000-0000-0000-0000-000000000010",
          weekIndex: 0,
          dayIndex: 1,
          routineId: "00000000-0000-0000-0000-000000000020",
          isRestDay: false,
        },
        {
          id: "00000000-0000-0000-0000-000000000011",
          weekIndex: 0,
          dayIndex: 6,
          routineId: null,
          isRestDay: true,
        },
      ],
    };
    expect(ProgramCreateInput.safeParse(validInput).success).toBe(true);

    // routineId + isRestDay=true should fail
    const invalid = {
      ...validInput,
      days: [
        {
          id: "00000000-0000-0000-0000-000000000010",
          weekIndex: 0,
          dayIndex: 1,
          routineId: "00000000-0000-0000-0000-000000000020",
          isRestDay: true,
        },
      ],
    };
    const result = ProgramCreateInput.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("mutually exclusive"))).toBe(true);
    }
  });
});

// ─── Test 2: (weekIndex, dayIndex) uniqueness and out-of-bounds rejection ─────

describe("ProgramCreateInput — week/day bounds", () => {
  it("rejects duplicate (weekIndex, dayIndex) and weekIndex >= durationWeeks", () => {
    // Duplicate pair
    const duplicateDays = {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Test",
      durationWeeks: 4,
      days: [
        { id: "00000000-0000-0000-0000-000000000010", weekIndex: 0, dayIndex: 1, routineId: null, isRestDay: false },
        { id: "00000000-0000-0000-0000-000000000011", weekIndex: 0, dayIndex: 1, routineId: null, isRestDay: true },
      ],
    };
    const dupResult = ProgramCreateInput.safeParse(duplicateDays);
    expect(dupResult.success).toBe(false);
    if (!dupResult.success) {
      expect(dupResult.error.issues.some((i) => i.message.toLowerCase().includes("duplicate"))).toBe(true);
    }

    // weekIndex out of range
    const outOfBounds = {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Test",
      durationWeeks: 4,
      days: [
        { id: "00000000-0000-0000-0000-000000000010", weekIndex: 4, dayIndex: 0, routineId: null, isRestDay: false },
      ],
    };
    const oobResult = ProgramCreateInput.safeParse(outOfBounds);
    expect(oobResult.success).toBe(false);
    if (!oobResult.success) {
      expect(oobResult.error.issues.some((i) => i.message.includes("out of range"))).toBe(true);
    }
  });
});

// ─── Test 3: ProgramRunCreateInput + ProgramRunUpdateInput ────────────────────

describe("ProgramRunCreateInput and ProgramRunUpdateInput", () => {
  it("parses minimal create input and full update input with nested dayStates", () => {
    const createInput = {
      id: "00000000-0000-0000-0000-000000000001",
      programId: "00000000-0000-0000-0000-000000000002",
      startedAt: Date.now(),
    };
    expect(ProgramRunCreateInput.safeParse(createInput).success).toBe(true);

    const updateInput = {
      id: "00000000-0000-0000-0000-000000000001",
      programId: "00000000-0000-0000-0000-000000000002",
      status: "active",
      startedAt: 1000000,
      endedAt: null,
      currentWeekIndex: 0,
      currentDayIndex: 1,
      dayStates: [
        {
          id: "00000000-0000-0000-0000-000000000010",
          weekIndex: 0,
          dayIndex: 0,
          status: "completed",
          sessionId: "00000000-0000-0000-0000-000000000020",
          updatedAt: 1000000,
        },
        {
          id: "00000000-0000-0000-0000-000000000011",
          weekIndex: 0,
          dayIndex: 1,
          status: "active",
          sessionId: null,
          updatedAt: 1000000,
        },
      ],
      createdAt: 1000000,
      updatedAt: 1000000,
    };
    expect(ProgramRunUpdateInput.safeParse(updateInput).success).toBe(true);
  });
});

// ─── Test 4: PendingEntityEnum accepts program + program_run ─────────────────

describe("PendingEntityEnum", () => {
  it("accepts 'program' and 'program_run'; still accepts existing entities", () => {
    expect(PendingEntityEnum.safeParse("program").success).toBe(true);
    expect(PendingEntityEnum.safeParse("program_run").success).toBe(true);
    expect(PendingEntityEnum.safeParse("routine").success).toBe(true);
    expect(PendingEntityEnum.safeParse("session").success).toBe(true);
    expect(PendingEntityEnum.safeParse("exercise").success).toBe(true);
    expect(PendingEntityEnum.safeParse("equipment").success).toBe(true);
    expect(PendingEntityEnum.safeParse("unknown_entity").success).toBe(false);
  });
});
