import { type Table } from "dexie";
import { forgeDB } from "./forge-db";
import type { Exercise, Equipment, PendingWrite, Routine, Session, SessionSetLog, Program, ProgramRun, Goal, Settings, ProgramRunDayStatus } from "../../shared";
import { SETTINGS_ID } from "../../shared/settings";

import { uuidv4 as uuid } from "../lib/uuid";

export class SessionFinishedError extends Error {
  constructor() {
    super("Session is finished and cannot be mutated");
    this.name = "SessionFinishedError";
  }
}

async function guardNotFinished(sessionId: string): Promise<void> {
  const session = await forgeDB.sessions.get(sessionId);
  if (session?.status === "finished") throw new SessionFinishedError();
}

// Single sanctioned construction point for the outbox union. Callers pass a
// payload already validated by their typed mutation; the cast is contained here.
const enqueue = (
  entity: PendingWrite["entity"],
  op: PendingWrite["op"],
  payload: unknown,
): PendingWrite => ({
  id: uuid(),
  entity,
  op,
  payload,
  createdAt: Date.now(),
  retries: 0,
  lastError: null,
  status: "pending",
} as PendingWrite);

/**
 * Factory for the standard offline-outbox CRUD triple: write the record to its
 * Dexie table and enqueue a matching pendingWrite, in one transaction. Entities
 * with extra guards or non-`{ id }` delete payloads (sessions, session logs,
 * settings, profiles, weight logs) are written by hand below.
 */
function crudMutations<T extends { id: string }>(
  table: Table<T, string>,
  entity: PendingWrite["entity"],
) {
  return {
    create: async (record: T): Promise<T> => {
      await forgeDB.transaction("rw", table, forgeDB.pendingWrites, async () => {
        await table.add(record);
        await forgeDB.pendingWrites.add(enqueue(entity, "create", record));
      });
      return record;
    },
    update: async (record: T): Promise<T> => {
      await forgeDB.transaction("rw", table, forgeDB.pendingWrites, async () => {
        await table.put(record);
        await forgeDB.pendingWrites.add(enqueue(entity, "update", record));
      });
      return record;
    },
    remove: async (id: string): Promise<void> => {
      await forgeDB.transaction("rw", table, forgeDB.pendingWrites, async () => {
        await table.delete(id);
        await forgeDB.pendingWrites.add(enqueue(entity, "delete", { id }));
      });
    },
  };
}

const exerciseMutations = crudMutations(forgeDB.exercises, "exercise");
export const createExercise = exerciseMutations.create;
export const updateExercise = exerciseMutations.update;
export const deleteExercise = exerciseMutations.remove;

const equipmentMutations = crudMutations(forgeDB.equipment, "equipment");
export const createEquipment = equipmentMutations.create;
export const updateEquipment = equipmentMutations.update;
export const deleteEquipment = equipmentMutations.remove;

const routineMutations = crudMutations(forgeDB.routines, "routine");
export const createRoutine = routineMutations.create;
export const updateRoutine = routineMutations.update;
export const deleteRoutine = routineMutations.remove;

const sessionMutations = crudMutations(forgeDB.sessions, "session");
export const createSession = sessionMutations.create;

export async function updateSession(record: Session): Promise<Session> {
  await guardNotFinished(record.id);
  await forgeDB.transaction("rw", forgeDB.sessions, forgeDB.pendingWrites, async () => {
    await forgeDB.sessions.put(record);
    await forgeDB.pendingWrites.add(enqueue("session", "update", record));
  });
  return record;
}

export async function deleteSession(id: string): Promise<void> {
  await forgeDB.transaction("rw", forgeDB.sessions, forgeDB.sessionSetLogs, forgeDB.pendingWrites, async () => {
    await forgeDB.sessionSetLogs.where("sessionId").equals(id).delete();
    await forgeDB.sessions.delete(id);
    await forgeDB.pendingWrites.add(enqueue("session", "delete", { id }));
  });
}

export async function finishSession(record: Session): Promise<Session> {
  await guardNotFinished(record.id);
  await forgeDB.transaction("rw", forgeDB.sessions, forgeDB.pendingWrites, async () => {
    await forgeDB.sessions.put(record);
    await forgeDB.pendingWrites.add(enqueue("session", "update", record));
  });
  return record;
}

/** Update startedAt/endedAt on any session (works on finished sessions too). */
export async function updateSessionTimes(
  id: string,
  startedAt: number,
  endedAt: number | null,
): Promise<Session> {
  const session = await forgeDB.sessions.get(id);
  if (!session) throw new Error("Session not found");
  const updated: Session = { ...session, startedAt, endedAt, updatedAt: Date.now() };
  await forgeDB.transaction("rw", forgeDB.sessions, forgeDB.pendingWrites, async () => {
    await forgeDB.sessions.put(updated);
    await forgeDB.pendingWrites.add(enqueue("session_times", "update", { id, startedAt, endedAt }));
  });
  return updated;
}

/** Reopen a finished session for editing (bypasses guardNotFinished). */
export async function reopenSession(id: string): Promise<Session> {
  const session = await forgeDB.sessions.get(id);
  if (!session) throw new Error("Session not found");
  const reopened: Session = { ...session, status: "in_progress", endedAt: null, updatedAt: Date.now() };
  await forgeDB.transaction("rw", forgeDB.sessions, forgeDB.pendingWrites, async () => {
    await forgeDB.sessions.put(reopened);
    await forgeDB.pendingWrites.add(enqueue("session", "update", reopened));
  });
  return reopened;
}

export async function createSessionLog(record: SessionSetLog): Promise<SessionSetLog> {
  await guardNotFinished(record.sessionId);
  await forgeDB.transaction("rw", forgeDB.sessionSetLogs, forgeDB.pendingWrites, async () => {
    await forgeDB.sessionSetLogs.add(record);
    await forgeDB.pendingWrites.add(enqueue("session_log", "create", record));
  });
  return record;
}

/**
 * Log a new set, optionally back-fill restAfterSec on the previous log, and
 * update the session (e.g. rest timer) — all in a single IndexedDB transaction
 * with one guard read. Replaces 3 sequential awaits in the hot path.
 */
export async function logSetBatch(
  newLog: SessionSetLog,
  updatedSession: Session,
  prevLogUpdate: SessionSetLog | null,
): Promise<void> {
  const session = await forgeDB.sessions.get(newLog.sessionId);
  if (session?.status === "finished") throw new SessionFinishedError();
  await forgeDB.transaction(
    "rw",
    forgeDB.sessions,
    forgeDB.sessionSetLogs,
    forgeDB.pendingWrites,
    async () => {
      if (prevLogUpdate) {
        await forgeDB.sessionSetLogs.put(prevLogUpdate);
        await forgeDB.pendingWrites.add(enqueue("session_log", "update", prevLogUpdate));
      }
      await forgeDB.sessionSetLogs.add(newLog);
      await forgeDB.pendingWrites.add(enqueue("session_log", "create", newLog));
      await forgeDB.sessions.put(updatedSession);
      await forgeDB.pendingWrites.add(enqueue("session", "update", updatedSession));
    },
  );
}

export async function updateSessionLog(record: SessionSetLog): Promise<SessionSetLog> {
  await guardNotFinished(record.sessionId);
  await forgeDB.transaction("rw", forgeDB.sessionSetLogs, forgeDB.pendingWrites, async () => {
    await forgeDB.sessionSetLogs.put(record);
    await forgeDB.pendingWrites.add(enqueue("session_log", "update", record));
  });
  return record;
}

/** Update an existing log, optionally back-fill the prev log's rest, and update the session — single transaction. */
export async function updateSetBatch(
  updatedLog: SessionSetLog,
  updatedSession: Session,
  prevLogUpdate: SessionSetLog | null,
): Promise<void> {
  const session = await forgeDB.sessions.get(updatedLog.sessionId);
  if (session?.status === "finished") throw new SessionFinishedError();
  await forgeDB.transaction(
    "rw",
    forgeDB.sessions,
    forgeDB.sessionSetLogs,
    forgeDB.pendingWrites,
    async () => {
      await forgeDB.sessionSetLogs.put(updatedLog);
      await forgeDB.pendingWrites.add(enqueue("session_log", "update", updatedLog));
      if (prevLogUpdate) {
        await forgeDB.sessionSetLogs.put(prevLogUpdate);
        await forgeDB.pendingWrites.add(enqueue("session_log", "update", prevLogUpdate));
      }
      await forgeDB.sessions.put(updatedSession);
      await forgeDB.pendingWrites.add(enqueue("session", "update", updatedSession));
    },
  );
}

/** Update a session log without checking session status — for editing finished sessions. */
export async function updateSessionLogFinished(record: SessionSetLog): Promise<SessionSetLog> {
  await forgeDB.transaction("rw", forgeDB.sessionSetLogs, forgeDB.pendingWrites, async () => {
    await forgeDB.sessionSetLogs.put(record);
    await forgeDB.pendingWrites.add(enqueue("session_log", "update", record));
  });
  return record;
}

export async function deleteSessionLog(id: string, sessionId: string): Promise<void> {
  await guardNotFinished(sessionId);
  await forgeDB.transaction("rw", forgeDB.sessionSetLogs, forgeDB.pendingWrites, async () => {
    await forgeDB.sessionSetLogs.delete(id);
    await forgeDB.pendingWrites.add(enqueue("session_log", "delete", { id, sessionId }));
  });
}

export async function deleteEquipmentWithFanout(id: string): Promise<{ affected: number }> {
  let affected = 0;
  await forgeDB.transaction(
    "rw",
    forgeDB.equipment,
    forgeDB.exercises,
    forgeDB.pendingWrites,
    async () => {
      const all = await forgeDB.exercises.toArray();
      const now = Date.now();
      for (const ex of all) {
        if (!ex.equipmentIds.includes(id)) continue;
        const updated: Exercise = {
          ...ex,
          equipmentIds: ex.equipmentIds.filter((x) => x !== id),
          updatedAt: now,
        };
        await forgeDB.exercises.put(updated);
        await forgeDB.pendingWrites.add(enqueue("exercise", "update", updated));
        affected++;
      }
      await forgeDB.equipment.delete(id);
      await forgeDB.pendingWrites.add(enqueue("equipment", "delete", { id }));
    },
  );
  return { affected };
}

// ---------------------------------------------------------------------------
// Program mutations
// ---------------------------------------------------------------------------

export class ProgramRunClosedError extends Error {
  constructor() {
    super("Program run is closed (completed or abandoned) and cannot be mutated");
    this.name = "ProgramRunClosedError";
  }
}

async function guardRunOpen(runId: string): Promise<void> {
  const run = await forgeDB.programRuns.get(runId);
  if (run && (run.status === "completed" || run.status === "abandoned")) {
    throw new ProgramRunClosedError();
  }
}

const programMutations = crudMutations(forgeDB.programs, "program");
export const createProgram = programMutations.create;
export const updateProgram = programMutations.update;
export const deleteProgram = programMutations.remove;

// ---------------------------------------------------------------------------
// ProgramRun mutations
// ---------------------------------------------------------------------------

const programRunMutations = crudMutations(forgeDB.programRuns, "program_run");
export const createProgramRun = programRunMutations.create;
export const deleteProgramRun = programRunMutations.remove;

export async function updateProgramRun(record: ProgramRun): Promise<ProgramRun> {
  await guardRunOpen(record.id);
  await forgeDB.transaction("rw", forgeDB.programRuns, forgeDB.pendingWrites, async () => {
    await forgeDB.programRuns.put(record);
    await forgeDB.pendingWrites.add(enqueue("program_run", "update", record));
  });
  return record;
}

export async function endProgramRun(
  id: string,
  status: "completed" | "abandoned",
  endedAt: number,
): Promise<ProgramRun | null> {
  const run = await forgeDB.programRuns.get(id);
  if (!run) return null;
  const updated: ProgramRun = { ...run, status, endedAt, updatedAt: Date.now() };
  await forgeDB.transaction("rw", forgeDB.programRuns, forgeDB.pendingWrites, async () => {
    await forgeDB.programRuns.put(updated);
    await forgeDB.pendingWrites.add(enqueue("program_run", "update", updated));
  });
  return updated;
}

export async function setProgramRunDayState(
  runId: string,
  weekIndex: number,
  dayIndex: number,
  status: ProgramRunDayStatus,
  sessionId: string | null = null,
): Promise<ProgramRun | null> {
  await guardRunOpen(runId);
  const run = await forgeDB.programRuns.get(runId);
  if (!run) return null;
  const now = Date.now();
  const existing = run.dayStates.find(
    (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
  );
  const newDayStates = existing
    ? run.dayStates.map((s) =>
        s.weekIndex === weekIndex && s.dayIndex === dayIndex
          ? { ...s, status, sessionId: sessionId ?? s.sessionId, updatedAt: now }
          : s,
      )
    : [
        ...run.dayStates,
        { id: uuid(), weekIndex, dayIndex, status, sessionId, updatedAt: now },
      ];
  const updated: ProgramRun = { ...run, dayStates: newDayStates, updatedAt: now };
  await forgeDB.transaction("rw", forgeDB.programRuns, forgeDB.pendingWrites, async () => {
    await forgeDB.programRuns.put(updated);
    await forgeDB.pendingWrites.add(enqueue("program_run", "update", updated));
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Goal mutations
// ---------------------------------------------------------------------------

const goalMutations = crudMutations(forgeDB.goals, "goal");
export const createGoal = goalMutations.create;
export const updateGoal = goalMutations.update;
export const deleteGoal = goalMutations.remove;

// ---------------------------------------------------------------------------
// Settings mutations
// ---------------------------------------------------------------------------

export async function updateSettings(record: Settings): Promise<Settings> {
  await forgeDB.transaction("rw", forgeDB.settings, forgeDB.pendingWrites, async () => {
    await forgeDB.settings.put(record);
    await forgeDB.pendingWrites.add(enqueue("settings", "update", record));
  });
  return record;
}

// Re-export SETTINGS_ID for convenience
export { SETTINGS_ID };

// ---------------------------------------------------------------------------
// Profile mutations
// ---------------------------------------------------------------------------

import type { Profile, WeightLog } from "../../shared/profile";

export async function createProfile(record: Profile): Promise<Profile> {
  await forgeDB.transaction("rw", forgeDB.profiles, forgeDB.pendingWrites, async () => {
    await forgeDB.profiles.put(record);
    await forgeDB.pendingWrites.add(enqueue("profile", "create", record));
  });
  return record;
}

export async function updateProfile(record: Profile): Promise<Profile> {
  await forgeDB.transaction("rw", forgeDB.profiles, forgeDB.pendingWrites, async () => {
    await forgeDB.profiles.put(record);
    await forgeDB.pendingWrites.add(enqueue("profile", "update", record));
  });
  return record;
}

export async function addWeightLog(record: WeightLog): Promise<WeightLog> {
  await forgeDB.transaction("rw", forgeDB.weightLogs, forgeDB.pendingWrites, async () => {
    await forgeDB.weightLogs.put(record);
    await forgeDB.pendingWrites.add(enqueue("weight_log", "create", record));
  });
  return record;
}

export async function deleteWeightLog(id: string, profileId: string): Promise<void> {
  await forgeDB.transaction("rw", forgeDB.weightLogs, forgeDB.pendingWrites, async () => {
    await forgeDB.weightLogs.delete(id);
    await forgeDB.pendingWrites.add(enqueue("weight_log", "delete", { id, profileId }));
  });
}
