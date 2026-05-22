/**
 * triggerExport() — one-tap export entry point.
 *
 * Online path:  GET /api/v1/export → blob → <a>.click() → revoke URL.
 * Offline path: Read each Dexie store → assemble envelope → blob download.
 * Failure path: toast `Export failed — try again`.
 *
 * No retry of the server path during the same tap (per spec).
 * No confirmation dialog, no progress indicator.
 */

import { forgeDB } from "../db/forge-db";
import { ExportEnvelopeSchema, type ExportEnvelope } from "../../shared/export";
import { APP_VERSION } from "../../shared/version";
import type { Exercise, Equipment, Routine } from "../../shared";
import type { Session } from "../../shared/session";
import type { SessionSetLog } from "../../shared/session-log";
import type { Program, ProgramDay } from "../../shared/program";
import type { ProgramRun, ProgramRunDayState } from "../../shared/program-run";
import type { Goal } from "../../shared/goals";
import type { Settings } from "../../shared/settings";

// ---------------------------------------------------------------------------
// Filename helper — YYYY-MM-DD in local time
// ---------------------------------------------------------------------------
function localDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Trigger a browser download from a JSON string
// ---------------------------------------------------------------------------
function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Extract filename from Content-Disposition header
// ---------------------------------------------------------------------------
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1]! : null;
}

// ---------------------------------------------------------------------------
// Client-side Dexie dump
// ---------------------------------------------------------------------------
async function clientDump(): Promise<string> {
  const warnings: string[] = [];

  // Check which stores exist in the current db version
  const storeNames = new Set(forgeDB.tables.map((t) => t.name));

  // Helper to validate rows from a store
  function validateRows<T>(
    rows: unknown[],
    schemaFn: (row: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } },
    entityKey: string,
  ): T[] {
    const valid: T[] = [];
    for (let i = 0; i < rows.length; i++) {
      const result = schemaFn(rows[i]);
      if (result.success) {
        valid.push(result.data);
      } else {
        warnings.push(
          `${entityKey}[${i}]: ${result.error.issues.map((e) => e.message).join("; ")}`,
        );
      }
    }
    return valid;
  }

  // ── Exercises ────────────────────────────────────────────────────────────
  const exerciseRows = storeNames.has("exercises") ? await forgeDB.exercises.toArray() : [];
  const validExercises = validateRows<Exercise>(
    exerciseRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.exercises.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.exercises.element.safeParse>,
    "exercises",
  );

  // ── Equipment ────────────────────────────────────────────────────────────
  const equipmentRows = storeNames.has("equipment") ? await forgeDB.equipment.toArray() : [];
  const validEquipment = validateRows<Equipment>(
    equipmentRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.equipment.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.equipment.element.safeParse>,
    "equipment",
  );

  // ── Routines ─────────────────────────────────────────────────────────────
  const routineRows = storeNames.has("routines") ? await forgeDB.routines.toArray() : [];
  const validRoutines = validateRows<Routine>(
    routineRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.routines.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.routines.element.safeParse>,
    "routines",
  );

  // ── Sessions ─────────────────────────────────────────────────────────────
  const sessionRows = storeNames.has("sessions") ? await forgeDB.sessions.toArray() : [];
  const validSessions = validateRows<Session>(
    sessionRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.sessions.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.sessions.element.safeParse>,
    "sessions",
  );

  // ── SessionSetLogs ────────────────────────────────────────────────────────
  const logRows = storeNames.has("sessionSetLogs") ? await forgeDB.sessionSetLogs.toArray() : [];
  const validLogs = validateRows<SessionSetLog>(
    logRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.sessionSetLogs.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.sessionSetLogs.element.safeParse>,
    "sessionSetLogs",
  );

  // ── Programs ─────────────────────────────────────────────────────────────
  const programRows = storeNames.has("programs") ? await forgeDB.programs.toArray() : [];
  const validPrograms = validateRows<Program>(
    programRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.programs.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.programs.element.safeParse>,
    "programs",
  );

  // ── ProgramDays ───────────────────────────────────────────────────────────
  const programDayRows = storeNames.has("programDays") ? await forgeDB.programDays.toArray() : [];
  const validProgramDays = validateRows<ProgramDay>(
    programDayRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.programDays.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.programDays.element.safeParse>,
    "programDays",
  );

  // ── ProgramRuns ───────────────────────────────────────────────────────────
  const runRows = storeNames.has("programRuns") ? await forgeDB.programRuns.toArray() : [];
  const validProgramRuns = validateRows<ProgramRun>(
    runRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.programRuns.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.programRuns.element.safeParse>,
    "programRuns",
  );

  // ── ProgramRunDayStates ────────────────────────────────────────────────────
  const stateRows = storeNames.has("programRunDayStates")
    ? await forgeDB.programRunDayStates.toArray()
    : [];
  const validProgramRunDayStates = validateRows<ProgramRunDayState>(
    stateRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.programRunDayStates.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.programRunDayStates.element.safeParse>,
    "programRunDayStates",
  );

  // ── Goals ─────────────────────────────────────────────────────────────────
  const goalRows = storeNames.has("goals") ? await forgeDB.goals.toArray() : [];
  const validGoals = validateRows<Goal>(
    goalRows,
    (r) => ExportEnvelopeSchema.shape.entities.shape.goals.element.safeParse(r) as ReturnType<typeof ExportEnvelopeSchema.shape.entities.shape.goals.element.safeParse>,
    "goals",
  );

  // ── Settings (singleton, optional) ────────────────────────────────────────
  let validSettings: Settings | undefined;
  if (storeNames.has("settings")) {
    const settingsRow = await forgeDB.settings.limit(1).first();
    if (settingsRow) {
      const parsed = ExportEnvelopeSchema.shape.entities.shape.settings.safeParse(settingsRow);
      if (parsed.success) {
        validSettings = parsed.data as Settings;
      } else {
        warnings.push(
          `settings: ${parsed.error.issues.map((e) => e.message).join("; ")}`,
        );
      }
    }
  }

  // Assemble envelope
  const envelopeRaw = {
    schemaVersion: 1 as const,
    exportedAt: Date.now(),
    source: "client" as const,
    appVersion: APP_VERSION,
    entities: {
      exercises: validExercises,
      equipment: validEquipment,
      routines: validRoutines,
      programs: validPrograms,
      programDays: validProgramDays,
      programRuns: validProgramRuns,
      programRunDayStates: validProgramRunDayStates,
      sessions: validSessions,
      sessionSetLogs: validLogs,
      goals: validGoals,
      ...(validSettings ? { settings: validSettings } : {}),
    },
    ...(warnings.length > 0 ? { _warnings: warnings } : {}),
  };

  const envelopeParsed = ExportEnvelopeSchema.safeParse(envelopeRaw);
  if (!envelopeParsed.success) {
    throw new Error(
      `Envelope assembly failed: ${envelopeParsed.error.issues.map((e) => e.message).join("; ")}`,
    );
  }

  return JSON.stringify(envelopeParsed.data, null, 2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ExportResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Trigger the export flow.
 *
 * Returns a result object so callers can surface errors as toasts.
 */
export async function triggerExport(): Promise<ExportResult> {
  // Online path
  if (navigator.onLine) {
    try {
      const res = await fetch("/api/v1/export");
      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition");
        const filename =
          filenameFromDisposition(disposition) ??
          `forge-export-${localDateStr()}.json`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { ok: true };
      }
      // Non-200 → fall through to client path
    } catch {
      // fetch threw (network error) → fall through to client path
    }
  }

  // Offline / server error path
  try {
    const json = await clientDump();
    const filename = `forge-export-${localDateStr()}.json`;
    downloadJson(json, filename);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}
