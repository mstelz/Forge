import { forgeDB } from "./forge-db";
import type { Exercise, Equipment, PendingWrite, Routine } from "../../shared";

const uuid = () => crypto.randomUUID();

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
