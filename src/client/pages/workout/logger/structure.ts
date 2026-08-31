import type { SessionSetLog } from "../../../../shared";
import type { CursorPos, LiveBlock, LiveStructure, RestTimerData } from "./types";

const IDLE_TIMER: RestTimerData = {
  status: "idle",
  startedAt: null,
  durationSec: 90,
  pausedAt: null,
  remainingSec: null,
};

export function parseLiveStructure(json: string): LiveStructure {
  try {
    return JSON.parse(json) as LiveStructure;
  } catch {
    return { blocks: [] };
  }
}

export function parseRestTimer(json: string | null | undefined): RestTimerData {
  if (!json) return { ...IDLE_TIMER };
  try {
    return JSON.parse(json) as RestTimerData;
  } catch {
    return { ...IDLE_TIMER };
  }
}

/** `performedExerciseId:plannedSetId` for every slot already logged or skipped. */
export function doneSlotKeys(logs: SessionSetLog[]): Set<string> {
  const doneIds = new Set<string>();
  for (const log of logs) {
    if ((log.status === "logged" || log.status === "skipped") && log.plannedSetId) {
      doneIds.add(`${log.performedExerciseId}:${log.plannedSetId}`);
    }
  }
  return doneIds;
}

/**
 * First unresolved planned slot, or null when every slot is logged or skipped.
 *
 * Single blocks walk slot by slot; supersets walk round-major (A1@r1, A2@r1,
 * A1@r2, …) so the user alternates exercises the way the block intends.
 */
export function deriveCursor(
  liveStructure: LiveStructure,
  logs: SessionSetLog[],
): CursorPos | null {
  const doneIds = doneSlotKeys(logs);

  for (let blockIdx = 0; blockIdx < liveStructure.blocks.length; blockIdx++) {
    const block = liveStructure.blocks[blockIdx]!;

    if (block.type === "single") {
      const item = block.items[0];
      if (!item) continue;
      for (let slotIdx = 0; slotIdx < item.setTargets.length; slotIdx++) {
        const slot = item.setTargets[slotIdx]!;
        if (!doneIds.has(`${item.performedExerciseId}:${slot.id}`)) {
          return { blockIdx, itemIdx: 0, slotIdx };
        }
      }
    } else {
      // superset: walk by round
      const roundCount = supersetRoundCount(block);
      for (let round = 0; round < roundCount; round++) {
        for (let itemIdx = 0; itemIdx < block.items.length; itemIdx++) {
          const item = block.items[itemIdx];
          if (!item) continue;
          const slot = item.setTargets[round];
          if (!slot) continue;
          if (!doneIds.has(`${item.performedExerciseId}:${slot.id}`)) {
            return { blockIdx, itemIdx, slotIdx: round };
          }
        }
      }
    }
  }

  return null;
}

export function supersetRoundCount(block: LiveBlock): number {
  return Math.max(0, ...block.items.map((item) => item.setTargets.length));
}

export function totalSlotCount(liveStructure: LiveStructure): number {
  let total = 0;
  for (const block of liveStructure.blocks) {
    for (const item of block.items) {
      total += item.setTargets.length;
    }
  }
  return total;
}

export function countDoneSlots(
  liveStructure: LiveStructure,
  logs: SessionSetLog[],
): number {
  const doneIds = doneSlotKeys(logs);
  let count = 0;
  for (const block of liveStructure.blocks) {
    for (const item of block.items) {
      for (const slot of item.setTargets) {
        if (doneIds.has(`${item.performedExerciseId}:${slot.id}`)) count++;
      }
    }
  }
  return count;
}
