import { forgeDB } from "../db/forge-db";
import { ExportEnvelopeSchema, type ExportEnvelope } from "../../shared/export";

export type ImportResult =
  | { ok: true; counts: Record<string, number> }
  | { ok: false; error: string };

export async function importFromJson(json: string): Promise<ImportResult> {
  let envelope: ExportEnvelope;
  try {
    const raw: unknown = JSON.parse(json);
    const result = ExportEnvelopeSchema.safeParse(raw);
    if (!result.success) {
      return {
        ok: false,
        error: `Invalid format: ${result.error.issues.map((e) => e.message).join("; ")}`,
      };
    }
    envelope = result.data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to parse JSON" };
  }

  const { entities } = envelope;
  const counts: Record<string, number> = {};

  try {
    await forgeDB.transaction(
      "rw",
      [
        forgeDB.exercises,
        forgeDB.equipment,
        forgeDB.routines,
        forgeDB.programs,
        forgeDB.programDays,
        forgeDB.programRuns,
        forgeDB.programRunDayStates,
        forgeDB.sessions,
        forgeDB.sessionSetLogs,
        forgeDB.goals,
        forgeDB.settings,
      ],
      async () => {
        if (entities.exercises.length) {
          await forgeDB.exercises.bulkPut(entities.exercises);
          counts.exercises = entities.exercises.length;
        }
        if (entities.equipment.length) {
          await forgeDB.equipment.bulkPut(entities.equipment);
          counts.equipment = entities.equipment.length;
        }
        if (entities.routines.length) {
          await forgeDB.routines.bulkPut(entities.routines);
          counts.routines = entities.routines.length;
        }
        if (entities.programs.length) {
          await forgeDB.programs.bulkPut(entities.programs);
          counts.programs = entities.programs.length;
        }
        if (entities.programDays.length) {
          await forgeDB.programDays.bulkPut(entities.programDays);
          counts.programDays = entities.programDays.length;
        }
        if (entities.programRuns.length) {
          await forgeDB.programRuns.bulkPut(entities.programRuns);
          counts.programRuns = entities.programRuns.length;
        }
        if (entities.programRunDayStates.length) {
          await forgeDB.programRunDayStates.bulkPut(entities.programRunDayStates);
          counts.programRunDayStates = entities.programRunDayStates.length;
        }
        if (entities.sessions.length) {
          await forgeDB.sessions.bulkPut(entities.sessions);
          counts.sessions = entities.sessions.length;
        }
        if (entities.sessionSetLogs.length) {
          await forgeDB.sessionSetLogs.bulkPut(entities.sessionSetLogs);
          counts.sessionSetLogs = entities.sessionSetLogs.length;
        }
        if (entities.goals.length) {
          await forgeDB.goals.bulkPut(entities.goals);
          counts.goals = entities.goals.length;
        }
        if (entities.settings) {
          await forgeDB.settings.put(entities.settings);
          counts.settings = 1;
        }
      },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed" };
  }

  return { ok: true, counts };
}
