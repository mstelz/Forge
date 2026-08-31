/**
 * Shapes the live workout logger works in.
 *
 * `liveStructure` is stored on the session as a JSON string — it is the mutable
 * copy of the plan that the logger edits mid-session, so it deliberately does not
 * share a type with the routine/program structures it was built from.
 */

export type PlannedSlot = {
  id: string;
  reps?: number;
  repsMin?: number;
  repsMax?: number;
  rpe?: number;
  setType?: string;
};

export type LiveItem = {
  performedExerciseId: string;
  sessionItemId: string;
  exerciseId: string;
  setCount: number;
  uniformReps?: number;
  restSec?: number;
  notes?: string;
  setTargets: PlannedSlot[];
};

export type LiveBlock = {
  id: string;
  type: "single" | "superset";
  roundCount?: number;
  restSec?: number;
  notes?: string | null;
  items: LiveItem[];
};

export type LiveStructure = {
  blocks: LiveBlock[];
};

export type CursorPos = {
  blockIdx: number;
  itemIdx: number;
  slotIdx: number;
  /** When true, this position represents a newly-added extra set (no plannedSetId). */
  isExtra?: boolean;
};

export type RestTimerData = {
  status: "idle" | "running" | "paused";
  startedAt: number | null;
  durationSec: number;
  pausedAt: number | null;
  remainingSec: number | null;
};

/** Re-exported so the logger has one name for it; the enum lives with the schema. */
export type { LogSetType } from "../../../../shared/session-log";
