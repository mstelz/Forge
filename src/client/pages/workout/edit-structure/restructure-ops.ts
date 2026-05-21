import type { LiveStructure, LiveStructureBlock } from "../../../../shared";
import { uuidv4 as uuid } from "../../../lib/uuid";

/**
 * Splits a superset into two consecutive single blocks at splitAfterItemIndex.
 * Items [0..splitAfterItemIndex] go into the first block,
 * items [splitAfterItemIndex+1..end] go into the second block.
 */
export function splitSuperset(
  structure: LiveStructure,
  blockIndex: number,
  splitAfterItemIndex: number,
): LiveStructure {
  const block = structure.blocks[blockIndex];
  if (!block || block.type !== "superset") return structure;

  const firstItems = block.items.slice(0, splitAfterItemIndex + 1);
  const secondItems = block.items.slice(splitAfterItemIndex + 1);

  if (firstItems.length === 0 || secondItems.length === 0) return structure;

  const firstBlock: LiveStructureBlock = {
    id: uuid(),
    type: "single",
    order: blockIndex,
    roundCount: null,
    restSec: block.restSec,
    tempo: block.tempo,
    notes: block.notes,
    items: firstItems.map((item, idx) => ({ ...item, order: idx })),
  };

  const secondBlock: LiveStructureBlock = {
    id: uuid(),
    type: "single",
    order: blockIndex + 1,
    roundCount: null,
    restSec: block.restSec,
    tempo: block.tempo,
    notes: block.notes,
    items: secondItems.map((item, idx) => ({ ...item, order: idx })),
  };

  const newBlocks: LiveStructureBlock[] = [];
  for (let i = 0; i < structure.blocks.length; i++) {
    if (i === blockIndex) {
      newBlocks.push(firstBlock);
      newBlocks.push(secondBlock);
    } else {
      newBlocks.push({ ...structure.blocks[i]!, order: newBlocks.length });
    }
  }

  // Re-assign orders
  return {
    ...structure,
    blocks: newBlocks.map((b, idx) => ({ ...b, order: idx })),
  };
}

/**
 * Wraps a single block into a superset.
 * roundCount = current setCount of the first (only) item.
 */
export function convertToSuperset(structure: LiveStructure, blockIndex: number): LiveStructure {
  const block = structure.blocks[blockIndex];
  if (!block || block.type !== "single") return structure;

  const item = block.items[0];
  if (!item) return structure;

  const blocks = structure.blocks.map((b, bIdx) => {
    if (bIdx !== blockIndex) return b;
    return {
      ...b,
      type: "superset" as const,
      roundCount: item.setCount,
    };
  });

  return { ...structure, blocks };
}

/**
 * Unwraps a one-item superset back into a single block.
 * Only available when the group already has exactly 1 member.
 */
export function convertToSingle(structure: LiveStructure, blockIndex: number): LiveStructure {
  const block = structure.blocks[blockIndex];
  if (!block || block.type !== "superset") return structure;
  if (block.items.length !== 1) return structure;

  const blocks = structure.blocks.map((b, bIdx) => {
    if (bIdx !== blockIndex) return b;
    return {
      ...b,
      type: "single" as const,
      roundCount: null,
    };
  });

  return { ...structure, blocks };
}
