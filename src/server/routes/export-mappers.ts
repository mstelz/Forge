/**
 * Pure row-mapper functions for the export route: DB row -> domain object.
 * Extracted from routes/export.ts (issue 09). No I/O, no Hono — pure transforms.
 */

import {
  exercises,
  equipment,
  routines,
  routineBlocks,
  routineItems,
  routineSetTargets,
  sessions,
  sessionSetLogs,
  programs,
  programDays,
  programRuns,
  programRunDayStates,
  goals,
  settings,
  profiles,
  weightLogs,
} from "../../db/schema";
import type {
  Exercise,
  Equipment,
  RoutineBlock,
  RoutineItem,
  SetTarget,
  Session,
  SessionSetLog,
  Goal,
  Settings,
  Profile,
  WeightLog,
} from "../../shared";
import type { Program, ProgramDay } from "../../shared/program";
import type { ProgramRun, ProgramRunDayState } from "../../shared/program-run";

// ---------------------------------------------------------------------------
// Helpers: parse JSON arrays stored as text in SQLite
// ---------------------------------------------------------------------------
const parseArray = (s: string | null | undefined): unknown[] => {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Row mappers: produce domain objects from raw DB rows
// ---------------------------------------------------------------------------
type ExerciseRow = typeof exercises.$inferSelect;
type EquipmentRow = typeof equipment.$inferSelect;
type RoutineRow = typeof routines.$inferSelect;
type RoutineBlockRow = typeof routineBlocks.$inferSelect;
type RoutineItemRow = typeof routineItems.$inferSelect;
type RoutineSetTargetRow = typeof routineSetTargets.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;
type SessionSetLogRow = typeof sessionSetLogs.$inferSelect;
type ProgramRow = typeof programs.$inferSelect;
type ProgramDayRow = typeof programDays.$inferSelect;
type ProgramRunRow = typeof programRuns.$inferSelect;
type ProgramRunDayStateRow = typeof programRunDayStates.$inferSelect;
type GoalRow = typeof goals.$inferSelect;
type SettingsRow = typeof settings.$inferSelect;
type ProfileRow = typeof profiles.$inferSelect;
type WeightLogRow = typeof weightLogs.$inferSelect;

export function rowToExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Exercise["type"],
    primaryMuscles: parseArray(row.primaryMuscles) as Exercise["primaryMuscles"],
    secondaryMuscles: parseArray(row.secondaryMuscles) as Exercise["secondaryMuscles"],
    equipmentIds: parseArray(row.equipmentIds) as string[],
    aliases: parseArray(row.aliases) as string[],
    description: row.description ?? null,
    instructions: row.instructions ?? null,
    videoUrls: parseArray(row.videoUrls) as string[],
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt ?? null,
  };
}

export function rowToEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToSetTarget(row: RoutineSetTargetRow): SetTarget {
  return {
    id: row.id,
    order: row.order,
    reps: row.reps ?? undefined,
    repsMin: row.repsMin ?? undefined,
    repsMax: row.repsMax ?? undefined,
    setType: row.setType as SetTarget["setType"],
    techniqueNotes: row.techniqueNotes ?? null,
  };
}

export function rowToItem(row: RoutineItemRow, targets: SetTarget[]): RoutineItem {
  const item: RoutineItem = {
    id: row.id,
    exerciseId: row.exerciseId,
    order: row.order,
    setCount: row.setCount,
    repMode: row.repMode as RoutineItem["repMode"],
    setTypeMode: row.setTypeMode as RoutineItem["setTypeMode"],
    uniformReps: row.uniformReps ?? undefined,
    uniformRepsMin: row.uniformRepsMin ?? undefined,
    uniformRepsMax: row.uniformRepsMax ?? undefined,
    uniformSetType: row.uniformSetType != null
      ? (row.uniformSetType as RoutineItem["uniformSetType"])
      : undefined,
    durationSec: row.durationSec ?? undefined,
    durationMinSec: row.durationMinSec ?? undefined,
    durationMaxSec: row.durationMaxSec ?? undefined,
    notes: row.notes ?? null,
  };
  if (targets.length > 0) {
    item.setTargets = targets;
  }
  return item;
}

export function rowToBlock(row: RoutineBlockRow, items: RoutineItem[]): RoutineBlock {
  return {
    id: row.id,
    type: row.type as RoutineBlock["type"],
    order: row.order,
    roundCount: row.roundCount ?? null,
    restSec: row.restSec ?? null,
    tempo: row.tempo ?? null,
    notes: row.notes ?? null,
    items,
  };
}

export function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    status: row.status as Session["status"],
    sourceType: row.sourceType as Session["sourceType"],
    sourceRoutineId: row.sourceRoutineId ?? null,
    sourceProgramId: row.sourceProgramId ?? null,
    sourceProgramWeekIndex: row.sourceProgramWeekIndex ?? null,
    sourceProgramDayIndex: row.sourceProgramDayIndex ?? null,
    templateSnapshot: row.templateSnapshot ?? null,
    liveStructure: row.liveStructure,
    restTimer: row.restTimer ?? null,
    title: row.title ?? null,
    notes: row.notes ?? null,
    startedAt: Number(row.startedAt),
    endedAt: row.endedAt != null ? Number(row.endedAt) : null,
    pausedAt: row.pausedAt != null ? Number(row.pausedAt) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToSessionSetLog(row: SessionSetLogRow): SessionSetLog {
  return {
    id: row.id,
    sessionId: row.sessionId,
    performedExerciseId: row.performedExerciseId,
    exerciseId: row.exerciseId,
    sessionItemId: row.sessionItemId,
    plannedSetId: row.plannedSetId ?? null,
    order: row.order,
    reps: row.reps ?? null,
    weightKg: row.weightKg ?? null,
    rpe: row.rpe ?? null,
    durationSec: row.durationSec ?? null,
    distanceM: row.distanceM ?? null,
    notes: row.notes ?? null,
    setType: row.setType as SessionSetLog["setType"],
    status: row.status as SessionSetLog["status"],
    loggedAt: Number(row.loggedAt),
    restAfterSec: row.restAfterSec ?? null,
    enteredWeight: row.enteredWeight ?? null,
    enteredWeightUnit: (row.enteredWeightUnit ?? null) as SessionSetLog["enteredWeightUnit"],
    enteredDistance: row.enteredDistance ?? null,
    enteredDistanceUnit: (row.enteredDistanceUnit ?? null) as SessionSetLog["enteredDistanceUnit"],
  };
}

export function rowToProgramDay(row: ProgramDayRow): ProgramDay {
  return {
    id: row.id,
    weekIndex: row.weekIndex,
    dayIndex: row.dayIndex,
    order: row.order ?? 0,
    label: row.label ?? null,
    routineId: row.routineId ?? null,
    isRestDay: Boolean(row.isRestDay),
    notes: row.notes ?? null,
  };
}

export function rowToProgram(row: ProgramRow, days: ProgramDay[]): Program {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    durationWeeks: row.durationWeeks,
    days,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToProgramRunDayState(row: ProgramRunDayStateRow): ProgramRunDayState {
  return {
    id: row.id,
    weekIndex: row.weekIndex,
    dayIndex: row.dayIndex,
    status: row.status as ProgramRunDayState["status"],
    sessionId: row.sessionId ?? null,
    updatedAt: row.updatedAt,
  };
}

export function rowToProgramRun(row: ProgramRunRow, dayStates: ProgramRunDayState[]): ProgramRun {
  return {
    id: row.id,
    programId: row.programId,
    status: row.status as ProgramRun["status"],
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
    currentWeekIndex: row.currentWeekIndex,
    currentDayIndex: row.currentDayIndex,
    dayStates,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    category: row.category as Goal["category"],
    title: row.title,
    direction: row.direction as Goal["direction"],
    startValue: row.startValue ?? null,
    targetValue: row.targetValue ?? null,
    currentValue: row.currentValue ?? null,
    unit: row.unit ?? null,
    linkedExerciseId: row.linkedExerciseId ?? null,
    linkedProgramRunId: row.linkedProgramRunId ?? null,
    deadline: row.deadline ?? null,
    notes: row.notes ?? null,
    status: row.status as Goal["status"],
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToSettings(row: SettingsRow): Settings {
  return {
    id: row.id,
    weightUnit: row.weightUnit as Settings["weightUnit"],
    distanceUnit: row.distanceUnit as Settings["distanceUnit"],
    heightUnit: row.heightUnit as Settings["heightUnit"],
    timezone: row.timezone,
    weekStartsOn: row.weekStartsOn as Settings["weekStartsOn"],
    showRpe: row.showRpe,
    showCardio: row.showCardio,
    theme: row.theme as Settings["theme"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    avatarDataUrl: row.avatarDataUrl ?? null,
    heightCm: row.heightCm ?? null,
    dateOfBirth: row.dateOfBirth ?? null,
    sex: (row.sex as Profile["sex"]) ?? null,
    activityLevel: (row.activityLevel as Profile["activityLevel"]) ?? null,
    goalType: (row.goalType as Profile["goalType"]) ?? null,
    targetWeightKg: row.targetWeightKg ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToWeightLog(row: WeightLogRow): WeightLog {
  return {
    id: row.id,
    profileId: row.profileId,
    weightKg: row.weightKg,
    date: row.date,
    note: row.note ?? null,
    createdAt: row.createdAt,
  };
}
