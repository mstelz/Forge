import { forgeDB } from "./forge-db";
import type { Exercise, Equipment, Routine } from "../../shared";

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

export const countExercisesReferencingEquipment = async (
  equipmentId: string,
): Promise<number> => {
  let n = 0;
  await forgeDB.exercises.each((e) => {
    if (e.equipmentIds.includes(equipmentId)) n++;
  });
  return n;
};
