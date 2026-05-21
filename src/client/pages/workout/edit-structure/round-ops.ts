import type { LiveStructure, LiveSetTarget } from "../../../../shared";
import { uuidv4 as uuid } from "../../../lib/uuid";

/**
 * Adds one round to a superset block: every member item appends a planned slot.
 * roundCount increments. Fresh plannedSetId per member.
 */
export function addRoundToSuperset(structure: LiveStructure, blockIndex: number): LiveStructure {
  const block = structure.blocks[blockIndex];
  if (!block || block.type !== "superset") return structure;

  const currentRoundCount = block.roundCount ?? (block.items[0]?.setTargets.length ?? 0);
  const newRoundIndex = currentRoundCount;

  const blocks = structure.blocks.map((b, bIdx) => {
    if (bIdx !== blockIndex) return b;

    const items = b.items.map((item) => {
      const lastSlot = item.setTargets[item.setTargets.length - 1];
      const newSlot: LiveSetTarget = {
        id: uuid(),
        order: newRoundIndex,
        setType: lastSlot?.setType ?? "normal",
        reps: lastSlot?.reps,
        repsMin: lastSlot?.repsMin,
        repsMax: lastSlot?.repsMax,
        rpe: lastSlot?.rpe,
        restSec: lastSlot?.restSec,
      };

      return {
        ...item,
        setCount: item.setCount + 1,
        setTargets: [...item.setTargets, newSlot],
      };
    });

    return {
      ...b,
      roundCount: currentRoundCount + 1,
      items,
    };
  });

  return { ...structure, blocks };
}

/**
 * Removes the last round from a superset block: every member item's last slot is removed.
 * Returns { newStructure, orphanedPlannedSetIds[] }.
 */
export function removeRoundFromSuperset(
  structure: LiveStructure,
  blockIndex: number,
): { newStructure: LiveStructure; orphanedPlannedSetIds: string[] } {
  const block = structure.blocks[blockIndex];
  if (!block || block.type !== "superset") {
    return { newStructure: structure, orphanedPlannedSetIds: [] };
  }

  const currentRoundCount = block.roundCount ?? (block.items[0]?.setTargets.length ?? 0);
  if (currentRoundCount <= 1) {
    // Cannot remove the only round
    return { newStructure: structure, orphanedPlannedSetIds: [] };
  }

  const orphanedPlannedSetIds: string[] = [];

  const blocks = structure.blocks.map((b, bIdx) => {
    if (bIdx !== blockIndex) return b;

    const items = b.items.map((item) => {
      const lastSlot = item.setTargets[item.setTargets.length - 1];
      if (lastSlot) {
        orphanedPlannedSetIds.push(lastSlot.id);
      }
      const newSetTargets = item.setTargets.slice(0, -1);
      return {
        ...item,
        setCount: newSetTargets.length,
        setTargets: newSetTargets,
      };
    });

    return {
      ...b,
      roundCount: currentRoundCount - 1,
      items,
    };
  });

  return {
    newStructure: { ...structure, blocks },
    orphanedPlannedSetIds,
  };
}
