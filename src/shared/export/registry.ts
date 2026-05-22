/**
 * EXPORT_REGISTRY — single source of truth for "what's in the export".
 *
 * Each entry maps an entity key to:
 *   - drizzleTable: the Drizzle table reference (used server-side)
 *   - dexieStore:   the Dexie store name (used client-side)
 *   - schema:       the Zod schema for per-row validation
 *   - optional:     if true, skip the entry when table/store is missing or empty
 *   - singleton:    if true, emit a single object (not an array); used for settings
 *
 * Future entities: add one line here. Resist scattering "which tables are
 * user-owned" knowledge anywhere else.
 *
 * `pending_writes` is intentionally absent — it is in-flight outbox state,
 * not user-owned data.
 */

import { z } from "zod";
import { ExerciseSchema } from "../exercise";
import { EquipmentSchema } from "../equipment";
import { RoutineSchema } from "../routine";
import { ProgramSchema, ProgramDaySchema } from "../program";
import { ProgramRunSchema, ProgramRunDayStateSchema } from "../program-run";
import { SessionSchema } from "../session";
import { SessionSetLogSchema } from "../session-log";
import { GoalSchema } from "../goals";
import { SettingsSchema } from "../settings";

// Drizzle tables are referenced by name here to keep this file importable on
// the client (where drizzle/bun-sqlite is unavailable). Server-side code must
// import the actual table objects separately; this registry uses string
// identifiers for the drizzle side and the server importer maps them.
//
// To keep things simple and type-safe, we use a discriminated union approach:
// the registry contains the table NAME (string) server-side importers use,
// and the Zod schema. The server export route imports the actual table objects
// directly from schema.ts.

export interface RegistryEntry<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Key used in the entities object of the export envelope */
  key: ExportEntityKey;
  /** Name of the Drizzle table (server uses this to look up the actual table object) */
  drizzleTableName: string;
  /** Name of the Dexie store (client uses this) */
  dexieStore: string;
  /** Zod schema for per-row validation */
  schema: S;
  /** If true, skip when table/store is missing; never emit undefined for non-optional */
  optional?: boolean;
  /** If true, emit a single object under entities.<key> instead of an array */
  singleton?: boolean;
}

export const EXPORT_REGISTRY: readonly RegistryEntry[] = [
  {
    key: "exercises",
    drizzleTableName: "exercises",
    dexieStore: "exercises",
    schema: ExerciseSchema,
  },
  {
    key: "equipment",
    drizzleTableName: "equipment",
    dexieStore: "equipment",
    schema: EquipmentSchema,
  },
  {
    key: "routines",
    drizzleTableName: "routines",
    dexieStore: "routines",
    schema: RoutineSchema,
  },
  {
    key: "routineExercises",
    drizzleTableName: "routine_exercises",
    dexieStore: "routineExercises",
    schema: z.unknown(),
    optional: true,
  },
  {
    key: "programs",
    drizzleTableName: "programs",
    dexieStore: "programs",
    schema: ProgramSchema,
  },
  {
    key: "programDays",
    drizzleTableName: "program_days",
    dexieStore: "programDays",
    schema: ProgramDaySchema,
  },
  {
    key: "programRuns",
    drizzleTableName: "program_runs",
    dexieStore: "programRuns",
    schema: ProgramRunSchema,
  },
  {
    key: "programRunDayStates",
    drizzleTableName: "program_run_day_states",
    dexieStore: "programRunDayStates",
    schema: ProgramRunDayStateSchema,
  },
  {
    key: "sessions",
    drizzleTableName: "sessions",
    dexieStore: "sessions",
    schema: SessionSchema,
  },
  {
    key: "sessionSetLogs",
    drizzleTableName: "session_set_logs",
    dexieStore: "sessionSetLogs",
    schema: SessionSetLogSchema,
  },
  {
    key: "goals",
    drizzleTableName: "goals",
    dexieStore: "goals",
    schema: GoalSchema,
  },
  {
    key: "settings",
    drizzleTableName: "settings",
    dexieStore: "settings",
    schema: SettingsSchema,
    optional: true,
    singleton: true,
  },
] as const;

export type ExportEntityKey =
  | "exercises"
  | "equipment"
  | "routines"
  | "routineExercises"
  | "programs"
  | "programDays"
  | "programRuns"
  | "programRunDayStates"
  | "sessions"
  | "sessionSetLogs"
  | "goals"
  | "settings";
