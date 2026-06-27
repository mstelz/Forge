import { describe, expect, it } from "vitest";
import type { Goal } from "../../../shared/goals";
import type { SessionSetLog } from "../../../shared/session-log";
import { computeGoalProgress } from "../progress";

const createdAt = 1_000;
const exerciseId = "00000000-0000-0000-0000-000000000001";

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    category: "cardio",
    title: "Run a mile in under 7:00",
    direction: "down",
    startValue: null,
    targetValue: 420,
    currentValue: null,
    unit: "mm:ss",
    linkedExerciseId: exerciseId,
    linkedProgramRunId: null,
    deadline: null,
    notes: null,
    status: "active",
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function makeLog(overrides: Partial<SessionSetLog> = {}): SessionSetLog {
  return {
    id: "00000000-0000-0000-0000-000000000020",
    sessionId: "00000000-0000-0000-0000-000000000021",
    performedExerciseId: "00000000-0000-0000-0000-000000000022",
    exerciseId,
    sessionItemId: "00000000-0000-0000-0000-000000000023",
    plannedSetId: null,
    order: 0,
    reps: null,
    weightKg: null,
    rpe: null,
    durationSec: 390,
    distanceM: 1609.344,
    notes: null,
    setType: "normal",
    status: "logged",
    loggedAt: createdAt + 1,
    restAfterSec: null,
    enteredWeight: null,
    enteredWeightUnit: null,
    enteredDistance: null,
    enteredDistanceUnit: null,
    ...overrides,
  };
}

describe("computeGoalProgress", () => {
  it("computes cardio time goals even when baseline is blank", () => {
    const progress = computeGoalProgress(makeGoal(), { setLogs: [makeLog()] });

    expect(progress.currentValue).toBe(390);
    expect(progress.percent).toBe(1);
    expect(progress.isComplete).toBe(true);
    expect(progress.hasInsufficientData).toBe(false);
  });

  it("computes strength goals even when baseline is blank", () => {
    const progress = computeGoalProgress(
      makeGoal({
        category: "strength",
        title: "Squat 315 lb",
        direction: "up",
        targetValue: 315,
        unit: "lb",
      }),
      {
        setLogs: [
          makeLog({
            reps: 5,
            weightKg: 100,
            durationSec: null,
            distanceM: null,
          }),
        ],
      },
    );

    expect(progress.currentValue).toBeGreaterThan(250);
    expect(progress.percent).toBeGreaterThan(0);
    expect(progress.hasInsufficientData).toBe(false);
  });
});
