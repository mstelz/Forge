import { describe, it, expect } from "vitest";
import { SessionCreateInput, LiveStructureSchema } from "../session";
import { SessionSetLogSchema } from "../session-log";
import { PendingEntityEnum } from "../pending-write";

// ─── Test 1: SessionCreateInput cross-field refinements ───────────────────────

describe("SessionCreateInput cross-field refinements", () => {
  const baseInput = {
    id: "00000000-0000-0000-0000-000000000001",
    templateSnapshot: null,
    liveStructure: '{"blocks":[]}',
    startedAt: 1000000,
    createdAt: 1000000,
    updatedAt: 1000000,
  };

  it("parses valid routine create (requires sourceRoutineId)", () => {
    const result = SessionCreateInput.safeParse({
      ...baseInput,
      sourceType: "routine",
      sourceRoutineId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.success).toBe(true);
  });

  it("parses valid freeform create", () => {
    const result = SessionCreateInput.safeParse({
      ...baseInput,
      sourceType: "freeform",
    });
    expect(result.success).toBe(true);
  });

  it("rejects freeform with a sourceRoutineId", () => {
    const result = SessionCreateInput.safeParse({
      ...baseInput,
      sourceType: "freeform",
      sourceRoutineId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.success).toBe(false);
  });

  it("rejects routine without sourceRoutineId", () => {
    const result = SessionCreateInput.safeParse({
      ...baseInput,
      sourceType: "routine",
      sourceRoutineId: null,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Test 2: LiveStructureSchema setTargets materialization ───────────────────

describe("LiveStructureSchema setTargets materialization", () => {
  const makeBlock = (setCount: number, setTargets: unknown[]) => ({
    id: "00000000-0000-0000-0000-000000000010",
    type: "single",
    order: 0,
    items: [
      {
        id: "00000000-0000-0000-0000-000000000011",
        performedExerciseId: "00000000-0000-0000-0000-000000000012",
        sessionItemId: "00000000-0000-0000-0000-000000000011",
        exerciseId: "00000000-0000-0000-0000-000000000013",
        order: 0,
        setCount,
        setTargets,
      },
    ],
  });

  it("passes when setTargets length matches setCount=3", () => {
    const setTargets = Array.from({ length: 3 }, (_, i) => ({
      id: `00000000-0000-0000-0000-00000000${String(i).padStart(4, "0")}`,
      order: i,
      setType: "normal",
    }));
    const result = LiveStructureSchema.safeParse({ blocks: [makeBlock(3, setTargets)] });
    expect(result.success).toBe(true);
  });

  it("fails when setTargets length (2) mismatches setCount (3)", () => {
    const setTargets = Array.from({ length: 2 }, (_, i) => ({
      id: `00000000-0000-0000-0000-00000000${String(i).padStart(4, "0")}`,
      order: i,
      setType: "normal",
    }));
    const result = LiveStructureSchema.safeParse({ blocks: [makeBlock(3, setTargets)] });
    expect(result.success).toBe(false);
  });
});

// ─── Test 3: SessionSetLogSchema cross-field rules ────────────────────────────

describe("SessionSetLogSchema cross-field rules", () => {
  const baseLog = {
    id: "00000000-0000-0000-0000-000000000020",
    sessionId: "00000000-0000-0000-0000-000000000021",
    performedExerciseId: "00000000-0000-0000-0000-000000000022",
    exerciseId: "00000000-0000-0000-0000-000000000023",
    sessionItemId: "00000000-0000-0000-0000-000000000024",
    plannedSetId: "00000000-0000-0000-0000-000000000025",
    order: 0,
    reps: null,
    weightKg: null,
    rpe: null,
    durationSec: null,
    distanceM: null,
    notes: null,
    setType: "normal" as const,
    status: "logged" as const,
    loggedAt: 1000000,
    restAfterSec: null,
    enteredWeight: null,
    enteredWeightUnit: null,
    enteredDistance: null,
    enteredDistanceUnit: null,
  };

  it("accepts a strength log (weightKg + reps)", () => {
    const result = SessionSetLogSchema.safeParse({
      ...baseLog,
      reps: 5,
      weightKg: 100,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a cardio-only log (durationSec only)", () => {
    const result = SessionSetLogSchema.safeParse({
      ...baseLog,
      setType: "normal",
      durationSec: 300,
      // no weightKg or reps — cardio only
    });
    expect(result.success).toBe(true);
  });

  it("rejects status='logged' row with no metrics at all", () => {
    const result = SessionSetLogSchema.safeParse({
      ...baseLog,
      // no weightKg, reps, durationSec, distanceM
    });
    expect(result.success).toBe(false);
  });

  it("rejects status='logged', setType='normal', weightKg=100, reps=0 (reps must be > 0)", () => {
    const result = SessionSetLogSchema.safeParse({
      ...baseLog,
      weightKg: 100,
      reps: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Test 4: PendingEntityEnum ────────────────────────────────────────────────

describe("PendingEntityEnum", () => {
  it("parses 'session' and 'session_log'", () => {
    expect(PendingEntityEnum.safeParse("session").success).toBe(true);
    expect(PendingEntityEnum.safeParse("session_log").success).toBe(true);
  });

  it("still parses 'exercise' and 'routine'", () => {
    expect(PendingEntityEnum.safeParse("exercise").success).toBe(true);
    expect(PendingEntityEnum.safeParse("routine").success).toBe(true);
  });

  it("rejects 'unknown'", () => {
    expect(PendingEntityEnum.safeParse("unknown").success).toBe(false);
  });
});
