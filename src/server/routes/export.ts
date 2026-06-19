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
  profiles,
  weightLogs,
} from "../../db/schema";
import { ExportEnvelopeSchema } from "../../shared/export";
import { ProfileSchema, WeightLogSchema } from "../../shared/profile";
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
  Profile,
  WeightLog,
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

import {
  rowToExercise,
  rowToEquipment,
  rowToSetTarget,
  rowToItem,
  rowToBlock,
  rowToSession,
  rowToSessionSetLog,
  rowToProgramDay,
  rowToProgram,
  rowToProgramRunDayState,
  rowToProgramRun,
  rowToGoal,
  rowToSettings,
  rowToProfile,
  rowToWeightLog,
} from "./export-mappers";

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

      // ── Profiles ──────────────────────────────────────────────────────────
      const { rows: profileRows, missing: profilesMissing } = trySelect(() =>
        db.select().from(profiles).all(),
      );
      const validProfiles: Profile[] = [];
      if (!profilesMissing) {
        for (let i = 0; i < profileRows.length; i++) {
          const raw = rowToProfile(profileRows[i]!);
          const parsed = ProfileSchema.safeParse(raw);
          if (parsed.success) {
            validProfiles.push(parsed.data);
          } else {
            warnings.push(`profiles[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
          }
        }
      }

      // ── WeightLogs ────────────────────────────────────────────────────────
      const { rows: weightLogRows, missing: weightLogsMissing } = trySelect(() =>
        db.select().from(weightLogs).all(),
      );
      const validWeightLogs: WeightLog[] = [];
      if (!weightLogsMissing) {
        for (let i = 0; i < weightLogRows.length; i++) {
          const raw = rowToWeightLog(weightLogRows[i]!);
          const parsed = WeightLogSchema.safeParse(raw);
          if (parsed.success) {
            validWeightLogs.push(parsed.data);
          } else {
            warnings.push(`weightLogs[${i}]: ${parsed.error.issues.map((e) => e.message).join("; ")}`);
          }
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
        validProfiles,
        validWeightLogs,
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
        profiles: result.validProfiles,
        weightLogs: result.validWeightLogs,
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
