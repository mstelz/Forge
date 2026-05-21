import type { LiveStructure, LiveStructureBlock, LiveStructureItem, LiveSetTarget } from "../../../../shared";
import { uuidv4 as uuid } from "../../../lib/uuid";

// ─── Add a new single-block exercise at the end of liveStructure ──────────────

/**
 * Adds a new single-block exercise at the end of liveStructure.blocks.
 * Mints fresh performedExerciseId, sessionItemId, one plannedSetId UUID.
 * Default: setCount=1, setTargets=[{ id: uuid(), order: 0, setType: 'normal' }]
 */
export function addExerciseBlock(structure: LiveStructure, exerciseId: string): LiveStructure {
  const performedExerciseId = uuid();
  const sessionItemId = uuid();
  const plannedSetId = uuid();

  const newItem: LiveStructureItem = {
    id: sessionItemId,
    performedExerciseId,
    sessionItemId,
    exerciseId,
    order: 0,
    setCount: 1,
    setTargets: [
      {
        id: plannedSetId,
        order: 0,
        setType: "normal",
      } satisfies LiveSetTarget,
    ],
  };

  const newBlock: LiveStructureBlock = {
    id: uuid(),
    type: "single",
    order: structure.blocks.length,
    roundCount: null,
    items: [newItem],
  };

  return {
    ...structure,
    blocks: [...structure.blocks, newBlock],
  };
}

// ─── Remove a block ───────────────────────────────────────────────────────────

/**
 * Removes the block at blockIndex.
 * Returns { newStructure, orphanedPerformedExerciseIds[] }.
 * Caller must reclassify logs for each orphanedPerformedExerciseId.
 */
export function removeBlock(
  structure: LiveStructure,
  blockIndex: number,
): { newStructure: LiveStructure; orphanedPerformedExerciseIds: string[] } {
  const block = structure.blocks[blockIndex];
  if (!block) {
    return { newStructure: structure, orphanedPerformedExerciseIds: [] };
  }

  const orphanedPerformedExerciseIds = block.items.map((item) => item.performedExerciseId);

  const newBlocks = structure.blocks
    .filter((_, idx) => idx !== blockIndex)
    .map((b, idx) => ({ ...b, order: idx }));

  return {
    newStructure: { ...structure, blocks: newBlocks },
    orphanedPerformedExerciseIds,
  };
}

// ─── Reorder blocks ───────────────────────────────────────────────────────────

/**
 * Reorders blocks: moves block from fromIndex to toIndex.
 */
export function reorderBlocks(
  structure: LiveStructure,
  fromIndex: number,
  toIndex: number,
): LiveStructure {
  if (fromIndex === toIndex) return structure;

  const blocks = [...structure.blocks];
  const [moved] = blocks.splice(fromIndex, 1);
  if (!moved) return structure;
  blocks.splice(toIndex, 0, moved);

  return {
    ...structure,
    blocks: blocks.map((b, idx) => ({ ...b, order: idx })),
  };
}

// ─── Swap exercise ────────────────────────────────────────────────────────────

/**
 * Swaps the exerciseId on a specific item.
 * Keeps performedExerciseId/sessionItemId/setTargets unchanged.
 */
export function swapExercise(
  structure: LiveStructure,
  blockIndex: number,
  itemIndex: number,
  newExerciseId: string,
): LiveStructure {
  const blocks = structure.blocks.map((block, bIdx) => {
    if (bIdx !== blockIndex) return block;
    const items = block.items.map((item, iIdx) => {
      if (iIdx !== itemIndex) return item;
      return { ...item, exerciseId: newExerciseId };
    });
    return { ...block, items };
  });

  return { ...structure, blocks };
}

// ─── Add exercise to an existing superset ────────────────────────────────────

/**
 * Adds a new item to an existing superset block.
 * New item gets slots for each existing round (copies neighbor's setType, default blank values).
 */
export function addExerciseToSuperset(
  structure: LiveStructure,
  blockIndex: number,
  exerciseId: string,
): LiveStructure {
  const block = structure.blocks[blockIndex];
  if (!block) return structure;

  const performedExerciseId = uuid();
  const sessionItemId = uuid();

  // Determine round count from existing members
  const roundCount = block.roundCount ?? (block.items[0]?.setTargets.length ?? 1);

  // Clone neighbor's setType for each round
  const neighbor = block.items[0];
  const setTargets: LiveSetTarget[] = Array.from({ length: roundCount }, (_, roundIdx) => ({
    id: uuid(),
    order: roundIdx,
    setType: neighbor?.setTargets[roundIdx]?.setType ?? "normal",
  }));

  const newItem: LiveStructureItem = {
    id: sessionItemId,
    performedExerciseId,
    sessionItemId,
    exerciseId,
    order: block.items.length,
    setCount: roundCount,
    setTargets,
  };

  const blocks = structure.blocks.map((b, bIdx) => {
    if (bIdx !== blockIndex) return b;
    return {
      ...b,
      items: [...b.items, newItem],
    };
  });

  return { ...structure, blocks };
}

// ─── Remove exercise from a superset ─────────────────────────────────────────

/**
 * Removes item at itemIndex from a superset.
 * Returns { newStructure, orphanedPerformedExerciseIds }.
 * If members.length after removal === 1, auto-collapses to a single block
 * (type='single', roundCount=null).
 */
export function removeExerciseFromSuperset(
  structure: LiveStructure,
  blockIndex: number,
  itemIndex: number,
): { newStructure: LiveStructure; orphanedPerformedExerciseIds: string[] } {
  const block = structure.blocks[blockIndex];
  if (!block) {
    return { newStructure: structure, orphanedPerformedExerciseIds: [] };
  }

  const removedItem = block.items[itemIndex];
  if (!removedItem) {
    return { newStructure: structure, orphanedPerformedExerciseIds: [] };
  }

  const orphanedPerformedExerciseIds = [removedItem.performedExerciseId];
  const remainingItems = block.items
    .filter((_, idx) => idx !== itemIndex)
    .map((item, idx) => ({ ...item, order: idx }));

  let updatedBlock: LiveStructureBlock;

  if (remainingItems.length === 1) {
    // Auto-collapse to single block
    const survivingItem = remainingItems[0]!;
    updatedBlock = {
      ...block,
      type: "single",
      roundCount: null,
      items: [survivingItem],
    };
  } else {
    updatedBlock = { ...block, items: remainingItems };
  }

  const blocks = structure.blocks.map((b, bIdx) =>
    bIdx === blockIndex ? updatedBlock : b,
  );

  return {
    newStructure: { ...structure, blocks },
    orphanedPerformedExerciseIds,
  };
}
