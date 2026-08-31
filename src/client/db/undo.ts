/**
 * Undo for deletion.
 *
 * Forge deletes are soft on the server (a `deletedAt` tombstone) but hard in
 * Dexie, so restoring means two things: putting the row back locally, and
 * making sure the outbox ends up telling the server the truth.
 *
 * The subtle half is the outbox. A delete sitting in the queue has not reached
 * the server yet, so the honest undo is to *cancel* it — nothing was said, so
 * nothing needs unsaying. Leaving the delete queued and appending a resurrect
 * update behind it would be wrong twice over: other devices would see a
 * needless delete-then-undelete flicker, and the flusher's per-group drain
 * skips a write that is in backoff without blocking the ones behind it, so the
 * resurrect could overtake the delete and lose the race outright.
 *
 * Cancelling is only unsafe in one window: the flusher may have already put the
 * DELETE on the wire without having removed its outbox row yet. When a flush is
 * in progress we therefore cancel *and* enqueue the resurrect, which is correct
 * either way — if the delete was sent, the update revives the row; if it was
 * not, the update is a harmless no-op write of unchanged data.
 *
 * The server side of the contract: an update lifts the tombstone. See the
 * `deletedAt: null` writes in the routes, and scripts/verify-undo-server.ts.
 */
import { type Table } from "dexie";
import { forgeDB } from "./forge-db";
import { enqueue } from "./mutations";
import { isFlushing } from "../sync/flusher";
import type {
  Equipment,
  Exercise,
  PendingWrite,
  Program,
  Routine,
} from "../../shared";
import type { Goal } from "../../shared/goals";

type RestoreOutcome = "restored" | "already-present";

async function findPendingDelete(
  entity: PendingWrite["entity"],
  id: string,
): Promise<PendingWrite | undefined> {
  const forEntity = await forgeDB.pendingWrites
    .where("entity")
    .equals(entity)
    .toArray();
  return forEntity.find((w) => w.op === "delete" && w.payload?.id === id);
}

/**
 * Put `record` back and reconcile the outbox. Returns "already-present" without
 * touching anything if the row is already there, which is what makes a double
 * tap on Undo — or an Undo tapped after a reconcile already restored the row —
 * inert rather than a second write.
 */
async function restoreDeleted<T extends { id: string; updatedAt: number }>(
  table: Table<T, string>,
  entity: PendingWrite["entity"],
  record: T,
  alsoWrite: () => Promise<void> = async () => {},
): Promise<RestoreOutcome> {
  const flushInProgress = isFlushing();
  let outcome: RestoreOutcome = "restored";

  // The server stamps updatedAt when it tombstones a row, so re-sending the
  // snapshot's original timestamp reads as a stale write — the goals endpoint
  // answers 409 and the flusher poisons the entry. The restore is a new write;
  // date it as one.
  const restored: T = { ...record, updatedAt: Date.now() };

  // The exercises table is in scope for the equipment fanout restore; dedupe so
  // restoring an exercise does not declare the same table twice.
  const tables = [...new Set<Table<never, string>>([
    table as unknown as Table<never, string>,
    forgeDB.exercises as unknown as Table<never, string>,
    forgeDB.pendingWrites as unknown as Table<never, string>,
  ])];

  await forgeDB.transaction("rw", tables, async () => {
    if (await table.get(restored.id)) {
      outcome = "already-present";
      return;
    }
    await table.put(restored);
    await alsoWrite();

    const queuedDelete = await findPendingDelete(entity, restored.id);
    if (queuedDelete) await forgeDB.pendingWrites.delete(queuedDelete.id);
    if (!queuedDelete || flushInProgress) {
      await forgeDB.pendingWrites.add(enqueue(entity, "update", restored));
    }
  });

  return outcome;
}

export const restoreExercise = (record: Exercise) =>
  restoreDeleted(forgeDB.exercises, "exercise", record);

export const restoreRoutine = (record: Routine) =>
  restoreDeleted(forgeDB.routines, "routine", record);

export const restoreProgram = (record: Program) =>
  restoreDeleted(forgeDB.programs, "program", record);

export const restoreGoal = (record: Goal) =>
  restoreDeleted(forgeDB.goals, "goal", record);

/**
 * Restore equipment along with the exercise references the delete stripped.
 * `touchedExercises` comes back from `deleteEquipmentWithFanout` and holds the
 * exercises as they were before the strip.
 */
export const restoreEquipment = (
  record: Equipment,
  touchedExercises: Exercise[] = [],
) =>
  restoreDeleted(forgeDB.equipment, "equipment", record, async () => {
    for (const ex of touchedExercises) {
      const current = await forgeDB.exercises.get(ex.id);
      // The exercise may have been deleted or edited since; only put the
      // reference back, never the whole stale snapshot.
      if (!current) continue;
      if (current.equipmentIds.includes(record.id)) continue;
      const rejoined: Exercise = {
        ...current,
        equipmentIds: [...current.equipmentIds, record.id],
        updatedAt: Date.now(),
      };
      await forgeDB.exercises.put(rejoined);
      await forgeDB.pendingWrites.add(enqueue("exercise", "update", rejoined));
    }
  });
