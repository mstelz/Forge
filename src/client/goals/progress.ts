import type { Goal } from "../../shared/goals";
import type { SessionSetLog } from "../../shared/session-log";
import { epley } from "../lib/session/epley";

// Re-export for use by reconcile.ts and other callers
export { epley };

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal shape for program run */
export type ProgramRun = {
  id: string;
  totalWeeks?: number;
  totalDays?: number;
  [key: string]: unknown;
};

/** Minimal shape for program run day state */
export type ProgramRunDayState = {
  programRunId: string;
  state: string;
  [key: string]: unknown;
};

export type GoalProgress = {
  currentValue: number | null;
  percent: number;       // clamped [0, 1]
  isComplete: boolean;   // percent >= 1 OR status === 'completed'
  hasInsufficientData: boolean;
};

export type GoalProgressContext = {
  setLogs: SessionSetLog[];
  programRun?: ProgramRun;
  programDayStates?: ProgramRunDayState[];
};

// ─── Weight conversion helpers ────────────────────────────────────────────────

export { convertWeight } from "../lib/units";

// ─── Cardio metric helpers ─────────────────────────────────────────────────────

/**
 * Returns the best (direction=down) cardio value for a linked exercise.
 * For time-based units (containing ":") → use minimum durationSec (as seconds).
 * For distance units (km, mi, m) → use max distanceM (converted).
 * For kcal → use max kcal from distanceM field (approximated as stored value).
 */
function bestCardioValue(
  logs: SessionSetLog[],
  exerciseId: string,
  unit: string | null,
  createdAt: number,
): number | null {
  const eligible = logs.filter(
    (l) =>
      l.exerciseId === exerciseId &&
      l.status === "logged" &&
      l.loggedAt >= createdAt,
  );

  if (eligible.length === 0) return null;

  // Time-based goal: find minimum durationSec
  if (unit && unit.includes(":")) {
    const withDuration = eligible.filter((l) => l.durationSec != null && l.durationSec > 0);
    if (withDuration.length === 0) return null;
    return Math.min(...withDuration.map((l) => l.durationSec!));
  }

  // Distance-based goal
  if (unit === "km" || unit === "mi" || unit === "m") {
    const withDistance = eligible.filter((l) => l.distanceM != null && l.distanceM > 0);
    if (withDistance.length === 0) return null;
    const maxM = Math.max(...withDistance.map((l) => l.distanceM!));
    if (unit === "km") return maxM / 1000;
    if (unit === "mi") return maxM / 1609.344;
    return maxM; // meters
  }

  return null;
}

// ─── clamp helper ─────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ─── percent computation per direction ────────────────────────────────────────

function computePercent(
  current: number,
  start: number,
  target: number,
  direction: "up" | "down",
): number {
  const range = target - start;
  if (range === 0) return 0;

  if (direction === "up") {
    return clamp((current - start) / range, 0, 1);
  } else {
    // direction = 'down': target < start
    return clamp((start - current) / (start - target), 0, 1);
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function computeGoalProgress(
  goal: Goal,
  ctx: GoalProgressContext,
): GoalProgress {
  const { setLogs, programRun, programDayStates } = ctx;

  // Manual categories: weight, measurement, other
  if (
    goal.category === "weight" ||
    goal.category === "measurement" ||
    goal.category === "other"
  ) {
    const current = goal.currentValue;
    const start = goal.startValue;
    const target = goal.targetValue;

    if (current == null || start == null || target == null) {
      return {
        currentValue: current,
        percent: 0,
        isComplete: goal.status === "completed",
        hasInsufficientData: false,
      };
    }

    const percent = computePercent(current, start, target, goal.direction);
    return {
      currentValue: current,
      percent,
      isComplete: percent >= 1 || goal.status === "completed",
      hasInsufficientData: false,
    };
  }

  // Strength category
  if (goal.category === "strength") {
    if (!goal.linkedExerciseId || goal.startValue == null || goal.targetValue == null) {
      return {
        currentValue: goal.startValue,
        percent: 0,
        isComplete: goal.status === "completed",
        hasInsufficientData: true,
      };
    }

    const eligibleLogs = setLogs.filter(
      (l) =>
        l.exerciseId === goal.linkedExerciseId &&
        l.status === "logged" &&
        ["normal", "amrap", "to_failure", "drop_set", "rest_pause", "failure", "drop"].includes(l.setType) &&
        l.reps != null &&
        l.reps > 0 &&
        l.weightKg != null &&
        l.weightKg > 0 &&
        l.loggedAt >= goal.createdAt,
    );

    if (eligibleLogs.length === 0) {
      return {
        currentValue: goal.startValue,
        percent: 0,
        isComplete: goal.status === "completed",
        hasInsufficientData: true,
      };
    }

    // Compute max Epley 1RM
    let maxEpley = 0;
    for (const log of eligibleLogs) {
      const e = epley(log.weightKg!, log.reps!);
      if (e > maxEpley) maxEpley = e;
    }

    // Convert to goal unit
    const currentKg = maxEpley;
    // Use inline conversion to avoid circular import issues with the unit string type
    const current = goal.unit === "lb" ? currentKg * 2.20462 : currentKg;

    const percent = computePercent(current, goal.startValue, goal.targetValue, "up");
    return {
      currentValue: current,
      percent,
      isComplete: percent >= 1 || goal.status === "completed",
      hasInsufficientData: false,
    };
  }

  // Cardio category
  if (goal.category === "cardio") {
    if (!goal.linkedExerciseId || goal.startValue == null || goal.targetValue == null) {
      return {
        currentValue: goal.startValue,
        percent: 0,
        isComplete: goal.status === "completed",
        hasInsufficientData: true,
      };
    }

    const current = bestCardioValue(setLogs, goal.linkedExerciseId, goal.unit, goal.createdAt);

    if (current == null) {
      return {
        currentValue: goal.startValue,
        percent: 0,
        isComplete: goal.status === "completed",
        hasInsufficientData: true,
      };
    }

    // Cardio direction is always "down" (lower time = better)
    const percent = computePercent(current, goal.startValue, goal.targetValue, "down");
    return {
      currentValue: current,
      percent,
      isComplete: percent >= 1 || goal.status === "completed",
      hasInsufficientData: false,
    };
  }

  // Program category
  if (goal.category === "program") {
    if (!programRun || !programDayStates) {
      return {
        currentValue: null,
        percent: 0,
        isComplete: goal.status === "completed",
        hasInsufficientData: true,
      };
    }

    const completedDays = programDayStates.filter(
      (s) => s.programRunId === goal.linkedProgramRunId && s.state === "completed",
    ).length;

    const totalDays = programRun.totalDays ?? programDayStates.filter(
      (s) => s.programRunId === goal.linkedProgramRunId,
    ).length;

    if (totalDays === 0) {
      return {
        currentValue: 0,
        percent: 0,
        isComplete: goal.status === "completed",
        hasInsufficientData: true,
      };
    }

    const percent = clamp(completedDays / totalDays, 0, 1);
    return {
      currentValue: completedDays,
      percent,
      isComplete: percent >= 1 || goal.status === "completed",
      hasInsufficientData: false,
    };
  }

  // Fallback
  return {
    currentValue: null,
    percent: 0,
    isComplete: goal.status === "completed",
    hasInsufficientData: true,
  };
}
