import { forgeDB } from "../db/forge-db";
import {
  EquipmentSchema,
  ExerciseSchema,
  type Equipment,
  type Exercise,
  type PendingWrite,
} from "../../shared";
import equipmentSeed from "./equipment.json";
import exerciseSeed from "./exercises.json";
import { reconcileNow } from "../sync/reconcile";

import { uuidv4 } from "../lib/uuid";

const META_KEY = "seedHydratedAt";

const parseSeed = <T>(raw: unknown[], schema: { parse: (v: unknown) => T }): T[] =>
  raw.map((r) => schema.parse(r));

const buildPending = (
  entity: PendingWrite["entity"],
  payloads: { id: string }[],
): PendingWrite[] => {
  const now = Date.now();
  return payloads.map((p, i) => ({
    id: uuidv4(),
    entity,
    op: "create",
    payload: p,
    createdAt: now + i,
    retries: 0,
    lastError: null,
  }));
};

export async function hydrateIfEmpty(): Promise<void> {
  const [equipmentCount, exerciseCount] = await Promise.all([
    forgeDB.equipment.count(),
    forgeDB.exercises.count(),
  ]);

  if (equipmentCount === 0) {
    const rows = parseSeed<Equipment>(equipmentSeed as unknown[], EquipmentSchema);
    await forgeDB.transaction("rw", forgeDB.equipment, forgeDB.pendingWrites, async () => {
      await forgeDB.equipment.bulkAdd(rows);
      await forgeDB.pendingWrites.bulkAdd(buildPending("equipment", rows));
    });
  }

  if (exerciseCount === 0) {
    const rows = parseSeed<Exercise>(exerciseSeed as unknown[], ExerciseSchema);
    await forgeDB.transaction("rw", forgeDB.exercises, forgeDB.pendingWrites, async () => {
      await forgeDB.exercises.bulkAdd(rows);
      await forgeDB.pendingWrites.bulkAdd(buildPending("exercise", rows));
    });
  }

  const existingMeta = await forgeDB.meta.get(META_KEY);
  if (!existingMeta) {
    const now = Date.now();
    await forgeDB.meta.put({ key: META_KEY, value: String(now), updatedAt: now });
  }

  if (typeof navigator === "undefined" || navigator.onLine) {
    void reconcileNow();
  }
}
