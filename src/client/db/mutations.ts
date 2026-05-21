import { forgeDB } from "./forge-db";
import type { Exercise, Equipment, PendingWrite, Routine, Session, SessionSetLog } from "../../shared";

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
});

export async function createExercise(record: Exercise): Promise<Exercise> {
  await forgeDB.transaction("rw", forgeDB.exercises, forgeDB.pendingWrites, async () => {
    await forgeDB.exercises.add(record);
    await forgeDB.pendingWrites.add(enqueue("exercise", "create", record));
  });
  return record;
}

export async function updateExercise(record: Exercise): Promise<Exercise> {
  await forgeDB.transaction("rw", forgeDB.exercises, forgeDB.pendingWrites, async () => {
    await forgeDB.exercises.put(record);
    await forgeDB.pendingWrites.add(enqueue("exercise", "update", record));
  });
  return record;
}

export async function deleteExercise(id: string): Promise<void> {
  await forgeDB.transaction("rw", forgeDB.exercises, forgeDB.pendingWrites, async () => {
    await forgeDB.exercises.delete(id);
    await forgeDB.pendingWrites.add(enqueue("exercise", "delete", { id }));
  });
}

export async function createEquipment(record: Equipment): Promise<Equipment> {
  await forgeDB.transaction("rw", forgeDB.equipment, forgeDB.pendingWrites, async () => {
    await forgeDB.equipment.add(record);
    await forgeDB.pendingWrites.add(enqueue("equipment", "create", record));
  });
  return record;
}

export async function updateEquipment(record: Equipment): Promise<Equipment> {
  await forgeDB.transaction("rw", forgeDB.equipment, forgeDB.pendingWrites, async () => {
    await forgeDB.equipment.put(record);
    await forgeDB.pendingWrites.add(enqueue("equipment", "update", record));
  });
  return record;
}

export async function deleteEquipment(id: string): Promise<void> {
  await forgeDB.transaction("rw", forgeDB.equipment, forgeDB.pendingWrites, async () => {
    await forgeDB.equipment.delete(id);
    await forgeDB.pendingWrites.add(enqueue("equipment", "delete", { id }));
  });
}

export async function createRoutine(record: Routine): Promise<Routine> {
  await forgeDB.transaction("rw", forgeDB.routines, forgeDB.pendingWrites, async () => {
    await forgeDB.routines.add(record);
    await forgeDB.pendingWrites.add(enqueue("routine", "create", record));
  });
  return record;
}

export async function updateRoutine(record: Routine): Promise<Routine> {
  await forgeDB.transaction("rw", forgeDB.routines, forgeDB.pendingWrites, async () => {
    await forgeDB.routines.put(record);
    await forgeDB.pendingWrites.add(enqueue("routine", "update", record));
  });
  return record;
}

export async function deleteRoutine(id: string): Promise<void> {
  await forgeDB.transaction("rw", forgeDB.routines, forgeDB.pendingWrites, async () => {
    await forgeDB.routines.delete(id);
    await forgeDB.pendingWrites.add(enqueue("routine", "delete", { id }));
  });
}

export async function createSession(record: Session): Promise<Session> {
  await forgeDB.transaction("rw", forgeDB.sessions, forgeDB.pendingWrites, async () => {
    await forgeDB.sessions.add(record);
    await forgeDB.pendingWrites.add(enqueue("session", "create", record));
  });
  return record;
}

export async function updateSession(record: Session): Promise<Session> {
  await guardNotFinished(record.id);
  await forgeDB.transaction("rw", forgeDB.sessions, forgeDB.pendingWrites, async () => {
    await forgeDB.sessions.put(record);
    await forgeDB.pendingWrites.add(enqueue("session", "update", record));
  });
  return record;
}

export async function deleteSession(id: string): Promise<void> {
  await forgeDB.transaction("rw", forgeDB.sessions, forgeDB.pendingWrites, async () => {
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

export async function createSessionLog(record: SessionSetLog): Promise<SessionSetLog> {
  await guardNotFinished(record.sessionId);
  await forgeDB.transaction("rw", forgeDB.sessionSetLogs, forgeDB.pendingWrites, async () => {
    await forgeDB.sessionSetLogs.add(record);
    await forgeDB.pendingWrites.add(enqueue("session_log", "create", record));
  });
  return record;
}

export async function updateSessionLog(record: SessionSetLog): Promise<SessionSetLog> {
  await guardNotFinished(record.sessionId);
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
