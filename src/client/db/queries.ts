import Dexie from "dexie";
import { forgeDB } from "./forge-db";
import type { Exercise, Equipment, Routine, Session, SessionSetLog } from "../../shared";

export const listExercises = (): Promise<Exercise[]> =>
  forgeDB.exercises.orderBy("name").toArray();

export const getExerciseById = (id: string): Promise<Exercise | undefined> =>
  forgeDB.exercises.get(id);

export const listEquipment = (): Promise<Equipment[]> =>
  forgeDB.equipment.orderBy("name").toArray();

export const getEquipmentById = (id: string): Promise<Equipment | undefined> =>
  forgeDB.equipment.get(id);

export const listRoutines = (): Promise<Routine[]> =>
  forgeDB.routines.orderBy("name").toArray();

export const getRoutineById = (id: string): Promise<Routine | undefined> =>
  forgeDB.routines.get(id);

export const listSessions = (): Promise<Session[]> =>
  forgeDB.sessions.orderBy("startedAt").reverse().toArray();

export const getSessionById = (id: string): Promise<Session | undefined> =>
  forgeDB.sessions.get(id);

export const getActiveSession = async (): Promise<Session | null> =>
  (await forgeDB.sessions.where("status").equals("in_progress").first()) ?? null;

export const listSessionLogs = (sessionId: string): Promise<SessionSetLog[]> =>
  forgeDB.sessionSetLogs.where("sessionId").equals(sessionId).sortBy("loggedAt");

export const listLogsForExercise = (exerciseId: string): Promise<SessionSetLog[]> =>
  forgeDB.sessionSetLogs
    .where("[exerciseId+loggedAt]")
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .toArray();

export const getLastLogForExercise = async (exerciseId: string): Promise<SessionSetLog | undefined> => {
  const rows = await forgeDB.sessionSetLogs
    .where("[exerciseId+loggedAt]")
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .toArray();
  const logged = rows.filter((r) => r.status === "logged");
  if (logged.length === 0) return undefined;
  logged.sort((a, b) => b.loggedAt - a.loggedAt);
  return logged[0];
};

export const listAllSessionLogs = (): Promise<SessionSetLog[]> =>
  forgeDB.sessionSetLogs.toArray();

export const countExercisesReferencingEquipment = async (
  equipmentId: string,
): Promise<number> => {
  let n = 0;
  await forgeDB.exercises.each((e) => {
    if (e.equipmentIds.includes(equipmentId)) n++;
  });
  return n;
};
