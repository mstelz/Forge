import type { LiveStructure, LiveSetTarget } from "../../../lib/session/cursor";
import { uuidv4 as uuid } from "../../../lib/uuid";

/**
 * Appends one planned slot cloning the last slot's targets.
 * New plannedSetId UUID.
 */
export function addSetToBlock(structure: LiveStructure, blockIndex: number): LiveStructure {
  const blocks = structure.blocks.map((block, bIdx) => {
    if (bIdx !== blockIndex) return block;
    if (block.type !== "single") return block;

    const item = block.items[0];
    if (!item) return block;

    const lastSlot = item.setTargets[item.setTargets.length - 1];
    const newSlot: LiveSetTarget = {
      id: uuid(),
      order: item.setTargets.length,
      setType: lastSlot?.setType ?? "normal",
      reps: lastSlot?.reps,
      repsMin: lastSlot?.repsMin,
      repsMax: lastSlot?.repsMax,
      rpe: lastSlot?.rpe,
      restSec: lastSlot?.restSec,
    };

    const updatedItem = {
      ...item,
      setCount: item.setCount + 1,
      setTargets: [...item.setTargets, newSlot],
    };

    return { ...block, items: [updatedItem] };
  });

  return { ...structure, blocks };
}

/**
 * Removes slot at slotIndex from a single block.
 * Returns { newStructure, orphanedPlannedSetIds[] }.
 * Caller must reclassify logs whose plannedSetId is in orphanedPlannedSetIds.
 */
export function removeSetFromBlock(
  structure: LiveStructure,
  blockIndex: number,
  slotIndex: number,
): { newStructure: LiveStructure; orphanedPlannedSetIds: string[] } {
  const block = structure.blocks[blockIndex];
  if (!block || block.type !== "single") {
    return { newStructure: structure, orphanedPlannedSetIds: [] };
  }

  const item = block.items[0];
  if (!item || item.setTargets.length <= 1) {
    // Cannot remove the last slot
    return { newStructure: structure, orphanedPlannedSetIds: [] };
  }

  const removedSlot = item.setTargets[slotIndex];
  if (!removedSlot) {
    return { newStructure: structure, orphanedPlannedSetIds: [] };
  }

  const orphanedPlannedSetIds = [removedSlot.id];

  const newSetTargets = item.setTargets
    .filter((_, idx) => idx !== slotIndex)
    .map((slot, idx) => ({ ...slot, order: idx }));

  const updatedItem = {
    ...item,
    setCount: newSetTargets.length,
    setTargets: newSetTargets,
  };

  const blocks = structure.blocks.map((b, bIdx) =>
    bIdx === blockIndex ? { ...b, items: [updatedItem] } : b,
  );

  return {
    newStructure: { ...structure, blocks },
    orphanedPlannedSetIds,
  };
}
