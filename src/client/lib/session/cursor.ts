import type { SessionSetLog } from "../../../shared";

export type LiveStructureSlot = { id: string; [key: string]: unknown };
export type LiveStructureItem = {
  performedExerciseId: string;
  sessionItemId: string;
  setTargets: LiveStructureSlot[];
  [key: string]: unknown;
};
export type LiveStructureBlock = {
  type: "single" | "superset";
  items: LiveStructureItem[];
  roundCount?: number | null;
  [key: string]: unknown;
};
export type LiveStructure = { blocks: LiveStructureBlock[] };

export type CursorPosition = {
  performedExerciseId: string;
  sessionItemId: string;
  plannedSetId: string;
  blockIndex: number;
  itemIndex: number;
  roundIndex: number;
  slotIndex: number;
};

export type Cursor = CursorPosition | { exhausted: true } | null;

/**
 * Returns null when liveStructure has no blocks/items.
 * Returns { exhausted: true } when all planned slots are resolved.
 *
 * Walk order:
 *  - single block: by slotIndex
 *  - superset block: round-major (A1@r1, A2@r1, …, A1@r2, …)
 *
 * Skip slots that already have a log with status 'logged' or 'skipped'
 * matching performedExerciseId + plannedSetId.
 *
 * Extras (plannedSetId=null) are excluded from total planned slot count.
 */
export function computeNextCursor(
  liveStructure: LiveStructure,
  logs: SessionSetLog[],
): Cursor {
  // Build a set of "done" keys: `${performedExerciseId}:${plannedSetId}`
  const doneKeys = new Set<string>();
  for (const log of logs) {
    if ((log.status === "logged" || log.status === "skipped") && log.plannedSetId) {
      doneKeys.add(`${log.performedExerciseId}:${log.plannedSetId}`);
    }
  }

  let hasAnySlot = false;

  for (let blockIndex = 0; blockIndex < liveStructure.blocks.length; blockIndex++) {
    const block = liveStructure.blocks[blockIndex]!;

    if (block.type === "single") {
      const item = block.items[0];
      if (!item) continue;
      for (let slotIndex = 0; slotIndex < item.setTargets.length; slotIndex++) {
        const slot = item.setTargets[slotIndex]!;
        hasAnySlot = true;
        const key = `${item.performedExerciseId}:${slot.id}`;
        if (!doneKeys.has(key)) {
          return {
            performedExerciseId: item.performedExerciseId,
            sessionItemId: item.sessionItemId,
            plannedSetId: slot.id,
            blockIndex,
            itemIndex: 0,
            roundIndex: slotIndex,
            slotIndex,
          };
        }
      }
    } else {
      // superset: round-major walk
      const roundCount = block.roundCount ?? (block.items[0]?.setTargets.length ?? 0);
      for (let round = 0; round < roundCount; round++) {
        for (let itemIndex = 0; itemIndex < block.items.length; itemIndex++) {
          const item = block.items[itemIndex];
          if (!item) continue;
          const slot = item.setTargets[round];
          if (!slot) continue;
          hasAnySlot = true;
          const key = `${item.performedExerciseId}:${slot.id}`;
          if (!doneKeys.has(key)) {
            return {
              performedExerciseId: item.performedExerciseId,
              sessionItemId: item.sessionItemId,
              plannedSetId: slot.id,
              blockIndex,
              itemIndex,
              roundIndex: round,
              slotIndex: round,
            };
          }
        }
      }
    }
  }

  if (!hasAnySlot) return null;
  return { exhausted: true };
}

/**
 * Count total planned slots across all blocks (extras with plannedSetId=null excluded).
 * This is simply the sum of setTargets.length across all items.
 */
export function countPlannedSlots(liveStructure: LiveStructure): number {
  let total = 0;
  for (const block of liveStructure.blocks) {
    for (const item of block.items) {
      total += item.setTargets.length;
    }
  }
  return total;
}
