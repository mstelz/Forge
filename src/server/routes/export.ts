/**
 * GET /api/v1/export
 *
 * Reads every registry table inside a single SQLite read transaction and
 * returns a pretty-printed, versioned JSON envelope.
 *
 * Method allowlist: GET only; everything else returns 405.
 * No auth gate in v1 (single-user, local) — consistent with all other routes.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { db, sqlite } from "../../db/client";
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
} from "../../db/schema";
import { ExportEnvelopeSchema } from "../../shared/export";
import { APP_VERSION } from "../../shared/version";
import type {
  Exercise,
  Equipment,
  Routine,
  RoutineBlock,
  RoutineItem,
  SetTarget,
  Session,
  SessionSetLog,
  Goal,
  Settings,
} from "../../shared";
import type { Program, ProgramDay } from "../../shared/program";
import type { ProgramRun, ProgramRunDayState } from "../../shared/program-run";

export const exportRoute = new Hono();

// ---------------------------------------------------------------------------
// Method guard — 405 for everything except GET
// ---------------------------------------------------------------------------
exportRoute.all("/", (c) => {
  if (c.req.method !== "GET") {
    c.header("Allow", "GET");
    return c.json({ error: "method_not_allowed" }, 405);
  }
  return handleExport(c);
});

// ---------------------------------------------------------------------------
// Local date string YYYY-MM-DD
// ---------------------------------------------------------------------------
function localDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function rowToExercise(row: ExerciseRow): Exercise {
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

function rowToEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToSetTarget(row: RoutineSetTargetRow): SetTarget {
  return {
    id: row.id,
    order: row.order,
    reps: row.reps ?? undefined,
    repsMin: row.repsMin ?? undefined,
    repsMax: row.repsMax ?? undefined,
    rpe: row.rpe ?? undefined,
    setType: row.setType as SetTarget["setType"],
    techniqueNotes: row.techniqueNotes ?? null,
  };
}

function rowToItem(row: RoutineItemRow, targets: SetTarget[]): RoutineItem {
  const item: RoutineItem = {
    id: row.id,
    exerciseId: row.exerciseId,
    order: row.order,
    setCount: row.setCount,
    repMode: row.repMode as RoutineItem["repMode"],
    rpeMode: row.rpeMode as RoutineItem["rpeMode"],
    setTypeMode: row.setTypeMode as RoutineItem["setTypeMode"],
    uniformReps: row.uniformReps ?? undefined,
    uniformRepsMin: row.uniformRepsMin ?? undefined,
    uniformRepsMax: row.uniformRepsMax ?? undefined,
    uniformRpe: row.uniformRpe ?? undefined,
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

function rowToBlock(row: RoutineBlockRow, items: RoutineItem[]): RoutineBlock {
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

function rowToSession(row: SessionRow): Session {
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

function rowToSessionSetLog(row: SessionSetLogRow): SessionSetLog {
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

function rowToProgramDay(row: ProgramDayRow): ProgramDay {
  return {
    id: row.id,
    weekIndex: row.weekIndex,
    dayIndex: row.dayIndex,
    routineId: row.routineId ?? null,
    isRestDay: Boolean(row.isRestDay),
    notes: row.notes ?? null,
  };
}

function rowToProgram(row: ProgramRow, days: ProgramDay[]): Program {
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

function rowToProgramRunDayState(row: ProgramRunDayStateRow): ProgramRunDayState {
  return {
    id: row.id,
    weekIndex: row.weekIndex,
    dayIndex: row.dayIndex,
    status: row.status as ProgramRunDayState["status"],
    sessionId: row.sessionId ?? null,
    updatedAt: row.updatedAt,
  };
}

function rowToProgramRun(row: ProgramRunRow, dayStates: ProgramRunDayState[]): ProgramRun {
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

function rowToGoal(row: GoalRow): Goal {
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

function rowToSettings(row: SettingsRow): Settings {
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

// ---------------------------------------------------------------------------
// Try to read a table; return empty result on "no such table" errors
// ---------------------------------------------------------------------------
function trySelect<T>(fn: () => T[]): { rows: T[]; missing: boolean } {
  try {
    return { rows: fn(), missing: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such table")) {
      return { rows: [], missing: true };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
function handleExport(c: Context) {
  try {
    const warnings: string[] = [];
    const exportedAt = Date.now();

    // All reads inside a single sync SQLite transaction for snapshot consistency
    const result = sqlite.transaction(() => {
      // ── Exercises ────────────────────────────────────────────────────────
      const exerciseRows = db.select().from(exercises).all();
      const validExercises: Exercise[] = [];
      for (let i = 0; i < exerciseRows.length; i++) {
        const raw = rowToExercise(exerciseRows[i]!);
        const parsed = ExportEnvelopeSchema.shape.entities.shape.exercises.element.safeParse(raw);
        if (parsed.success) {
          validExercises.push(parsed.data);
        } else {
          warnings.push(`exercises[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
        }
      }

      // ── Equipment ────────────────────────────────────────────────────────
      const equipmentRows = db.select().from(equipment).all();
      const validEquipment: Equipment[] = [];
      for (let i = 0; i < equipmentRows.length; i++) {
        const raw = rowToEquipment(equipmentRows[i]!);
        const parsed = ExportEnvelopeSchema.shape.entities.shape.equipment.element.safeParse(raw);
        if (parsed.success) {
          validEquipment.push(parsed.data);
        } else {
          warnings.push(`equipment[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
        }
      }

      // ── Routines (normalized → nested) ────────────────────────────────────
      const routineRows = db.select().from(routines).all();
      const blockRows = db.select().from(routineBlocks).all();
      const itemRows = db.select().from(routineItems).orderBy(routineItems.order).all();
      const setTargetRows = db
        .select()
        .from(routineSetTargets)
        .orderBy(routineSetTargets.order)
        .all();

      // Group set targets by itemId
      const stByItem = new Map<string, SetTarget[]>();
      for (const st of setTargetRows) {
        const arr = stByItem.get(st.itemId) ?? [];
        arr.push(rowToSetTarget(st));
        stByItem.set(st.itemId, arr);
      }
      // Group items by blockId
      const itemsByBlock = new Map<string, RoutineItem[]>();
      for (const item of itemRows) {
        const targets = stByItem.get(item.id) ?? [];
        const arr = itemsByBlock.get(item.blockId) ?? [];
        arr.push(rowToItem(item, targets));
        itemsByBlock.set(item.blockId, arr);
      }
      // Group blocks by routineId
      const blocksByRoutine = new Map<string, RoutineBlock[]>();
      for (const b of blockRows) {
        const items = itemsByBlock.get(b.id) ?? [];
        const arr = blocksByRoutine.get(b.routineId) ?? [];
        arr.push(rowToBlock(b, items));
        blocksByRoutine.set(b.routineId, arr);
      }

      const validRoutines: Routine[] = [];
      for (let i = 0; i < routineRows.length; i++) {
        const row = routineRows[i]!;
        const blocks = (blocksByRoutine.get(row.id) ?? []).sort((a, b) => a.order - b.order);
        const raw: Routine = {
          id: row.id,
          name: row.name,
          notes: row.notes ?? null,
          estimatedDurationMin: row.estimatedDurationMin ?? null,
          blocks,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
        const parsed = ExportEnvelopeSchema.shape.entities.shape.routines.element.safeParse(raw);
        if (parsed.success) {
          validRoutines.push(parsed.data);
        } else {
          warnings.push(`routines[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
        }
      }

      // ── Sessions ─────────────────────────────────────────────────────────
      const { rows: sessionRows, missing: sessionsMissing } = trySelect(() =>
        db.select().from(sessions).all(),
      );
      const validSessions: Session[] = [];
      if (!sessionsMissing) {
        for (let i = 0; i < sessionRows.length; i++) {
          const raw = rowToSession(sessionRows[i]!);
          const parsed =
            ExportEnvelopeSchema.shape.entities.shape.sessions.element.safeParse(raw);
          if (parsed.success) {
            validSessions.push(parsed.data);
          } else {
            warnings.push(
              `sessions[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`,
            );
          }
        }
      }

      // ── SessionSetLogs ────────────────────────────────────────────────────
      const { rows: logRows, missing: logsMissing } = trySelect(() =>
        db.select().from(sessionSetLogs).all(),
      );
      const validLogs: SessionSetLog[] = [];
      if (!logsMissing) {
        for (let i = 0; i < logRows.length; i++) {
          const raw = rowToSessionSetLog(logRows[i]!);
          const parsed =
            ExportEnvelopeSchema.shape.entities.shape.sessionSetLogs.element.safeParse(raw);
          if (parsed.success) {
            validLogs.push(parsed.data);
          } else {
            warnings.push(
              `sessionSetLogs[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`,
            );
          }
        }
      }

      // ── Programs (normalized → nested) ────────────────────────────────────
      const { rows: programRows, missing: programsMissing } = trySelect(() =>
        db.select().from(programs).all(),
      );
      const { rows: programDayRows } = trySelect(() => db.select().from(programDays).all());

      const daysByProgram = new Map<string, ProgramDay[]>();
      for (const d of programDayRows) {
        const arr = daysByProgram.get(d.programId) ?? [];
        arr.push(rowToProgramDay(d));
        daysByProgram.set(d.programId, arr);
      }

      const validPrograms: Program[] = [];
      const validProgramDays: ProgramDay[] = [];
      if (!programsMissing) {
        for (let i = 0; i < programRows.length; i++) {
          const row = programRows[i]!;
          const days = daysByProgram.get(row.id) ?? [];
          const raw = rowToProgram(row, days);
          const parsed =
            ExportEnvelopeSchema.shape.entities.shape.programs.element.safeParse(raw);
          if (parsed.success) {
            validPrograms.push(parsed.data);
            validProgramDays.push(...days);
          } else {
            warnings.push(
              `programs[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`,
            );
          }
        }
      }

      // ── ProgramRuns (normalized → nested) ─────────────────────────────────
      const { rows: runRows, missing: runsMissing } = trySelect(() =>
        db.select().from(programRuns).all(),
      );
      const { rows: dayStateRows } = trySelect(() =>
        db.select().from(programRunDayStates).all(),
      );

      const statesByRun = new Map<string, ProgramRunDayState[]>();
      for (const s of dayStateRows) {
        const arr = statesByRun.get(s.programRunId) ?? [];
        arr.push(rowToProgramRunDayState(s));
        statesByRun.set(s.programRunId, arr);
      }

      const validProgramRuns: ProgramRun[] = [];
      const validProgramRunDayStates: ProgramRunDayState[] = [];
      if (!runsMissing) {
        for (let i = 0; i < runRows.length; i++) {
          const row = runRows[i]!;
          const dayStates = statesByRun.get(row.id) ?? [];
          const raw = rowToProgramRun(row, dayStates);
          const parsed =
            ExportEnvelopeSchema.shape.entities.shape.programRuns.element.safeParse(raw);
          if (parsed.success) {
            validProgramRuns.push(parsed.data);
            validProgramRunDayStates.push(...dayStates);
          } else {
            warnings.push(
              `programRuns[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`,
            );
          }
        }
      }

      // ── Goals ─────────────────────────────────────────────────────────────
      const { rows: goalRows, missing: goalsMissing } = trySelect(() =>
        db.select().from(goals).all(),
      );
      const validGoals: Goal[] = [];
      if (!goalsMissing) {
        for (let i = 0; i < goalRows.length; i++) {
          const raw = rowToGoal(goalRows[i]!);
          const parsed =
            ExportEnvelopeSchema.shape.entities.shape.goals.element.safeParse(raw);
          if (parsed.success) {
            validGoals.push(parsed.data);
          } else {
            warnings.push(
              `goals[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`,
            );
          }
        }
      }

      // ── Settings (singleton, optional) ────────────────────────────────────
      const { rows: settingsRows, missing: settingsMissing } = trySelect(() =>
        db.select().from(settings).limit(1).all(),
      );
      let validSettings: Settings | undefined;
      if (!settingsMissing && settingsRows.length > 0) {
        const raw = rowToSettings(settingsRows[0]!);
        const parsed = ExportEnvelopeSchema.shape.entities.shape.settings.safeParse(raw);
        if (parsed.success) {
          validSettings = parsed.data as Settings;
        } else {
          warnings.push(
            `settings: ${parsed.error.issues.map((e) => e.message).join("; ")}`,
          );
        }
      }

      return {
        validExercises,
        validEquipment,
        validRoutines,
        validSessions,
        validLogs,
        validPrograms,
        validProgramDays,
        validProgramRuns,
        validProgramRunDayStates,
        validGoals,
        validSettings,
      };
    })();

    // Assemble envelope
    const envelopeRaw = {
      schemaVersion: 1 as const,
      exportedAt,
      source: "server" as const,
      appVersion: APP_VERSION,
      entities: {
        exercises: result.validExercises,
        equipment: result.validEquipment,
        routines: result.validRoutines,
        programs: result.validPrograms,
        programDays: result.validProgramDays,
        programRuns: result.validProgramRuns,
        programRunDayStates: result.validProgramRunDayStates,
        sessions: result.validSessions,
        sessionSetLogs: result.validLogs,
        goals: result.validGoals,
        ...(result.validSettings ? { settings: result.validSettings } : {}),
      },
      ...(warnings.length > 0 ? { _warnings: warnings } : {}),
    };

    // Final validation of the assembled envelope
    const envelopeParsed = ExportEnvelopeSchema.safeParse(envelopeRaw);
    if (!envelopeParsed.success) {
      console.error("[export] Envelope validation failed:", envelopeParsed.error.issues);
      return c.json(
        { error: "export_failed", detail: "Envelope assembly failed validation" },
        500,
      );
    }

    const filename = `forge-export-${localDateStr()}.json`;
    const body = JSON.stringify(envelopeParsed.data, null, 2);

    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.body(body, 200);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[export] Export failed:", detail);
    return c.json({ error: "export_failed", detail }, 500);
  }
}
