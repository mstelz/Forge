import { describe, it, expect } from "vitest";
import type { LiveStructure, LiveStructureBlock, LiveStructureItem, LiveSetTarget } from "../../../../../shared";
import { removeBlock, swapExercise, removeExerciseFromSuperset } from "../exercise-ops";
import { addRoundToSuperset } from "../round-ops";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSlot(id: string, order: number): LiveSetTarget {
  return { id, order, setType: "normal" };
}

function makeItem(
  performedExerciseId: string,
  exerciseId: string,
  opts: { order?: number; setTargets?: LiveSetTarget[] } = {},
): LiveStructureItem {
  const siId = `si-${performedExerciseId}`;
  const slots: LiveSetTarget[] = opts.setTargets ?? [makeSlot(`slot-${performedExerciseId}-0`, 0)];
  return {
    id: siId,
    performedExerciseId,
    sessionItemId: siId,
    exerciseId,
    order: opts.order ?? 0,
    setCount: slots.length,
    setTargets: slots,
  };
}

function makeSingleBlock(id: string, item: LiveStructureItem, order = 0): LiveStructureBlock {
  return {
    id,
    type: "single",
    order,
    roundCount: null,
    items: [item],
  };
}

function makeSupersetBlock(
  id: string,
  items: LiveStructureItem[],
  roundCount: number,
  order = 0,
): LiveStructureBlock {
  return {
    id,
    type: "superset",
    order,
    roundCount,
    items,
  };
}

// ─── Test 1: removeBlock reclassifies logs to extra ───────────────────────────

describe("removeBlock", () => {
  it("returns orphanedPerformedExerciseIds for the removed block's items", () => {
    const item = makeItem("pe-1", "ex-bench");
    const block = makeSingleBlock("block-1", item);
    const structure: LiveStructure = { blocks: [block] };

    const { newStructure, orphanedPerformedExerciseIds } = removeBlock(structure, 0);

    expect(orphanedPerformedExerciseIds).toEqual(["pe-1"]);
    expect(newStructure.blocks).toHaveLength(0);
  });
});

// ─── Test 2: addRoundToSuperset adds exactly one slot per member ──────────────

describe("addRoundToSuperset", () => {
  it("adds exactly one slot per member and increments roundCount", () => {
    const item1 = makeItem("pe-1", "ex-squat", {
      setTargets: [makeSlot("slot-1-0", 0)],
    });
    const item2 = makeItem("pe-2", "ex-lunge", {
      order: 1,
      setTargets: [makeSlot("slot-2-0", 0)],
    });
    const block = makeSupersetBlock("block-ss", [item1, item2], 1);
    const structure: LiveStructure = { blocks: [block] };

    const result = addRoundToSuperset(structure, 0);

    const resultBlock = result.blocks[0]!;
    expect(resultBlock.roundCount).toBe(2);

    const resultItem1 = resultBlock.items[0]!;
    const resultItem2 = resultBlock.items[1]!;

    expect(resultItem1.setTargets).toHaveLength(2);
    expect(resultItem2.setTargets).toHaveLength(2);

    // New slots should have distinct UUIDs from the original and from each other
    const allIds = [
      resultItem1.setTargets[0]!.id,
      resultItem1.setTargets[1]!.id,
      resultItem2.setTargets[0]!.id,
      resultItem2.setTargets[1]!.id,
    ];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(4);

    // Original slot IDs preserved
    expect(resultItem1.setTargets[0]!.id).toBe("slot-1-0");
    expect(resultItem2.setTargets[0]!.id).toBe("slot-2-0");
  });
});

// ─── Test 3: removeExerciseFromSuperset auto-collapses when 1 member remains ──

describe("removeExerciseFromSuperset", () => {
  it("auto-collapses to single block when only 1 member remains", () => {
    const item1 = makeItem("pe-1", "ex-squat", {
      setTargets: [makeSlot("slot-1-0", 0)],
    });
    const item2 = makeItem("pe-2", "ex-lunge", {
      order: 1,
      setTargets: [makeSlot("slot-2-0", 0)],
    });
    const block = makeSupersetBlock("block-ss", [item1, item2], 1);
    const structure: LiveStructure = { blocks: [block] };

    const { newStructure, orphanedPerformedExerciseIds } = removeExerciseFromSuperset(
      structure,
      0,
      1,
    );

    const resultBlock = newStructure.blocks[0]!;
    expect(resultBlock.type).toBe("single");
    expect(resultBlock.roundCount).toBeNull();
    expect(resultBlock.items).toHaveLength(1);
    expect(resultBlock.items[0]!.performedExerciseId).toBe("pe-1");
    expect(orphanedPerformedExerciseIds).toEqual(["pe-2"]);
  });
});

// ─── Test 4: swapExercise updates exerciseId but leaves performedExerciseId ───

describe("swapExercise", () => {
  it("updates exerciseId on the slot but leaves performedExerciseId intact", () => {
    const item = makeItem("pe-1", "ex-A");
    const block = makeSingleBlock("block-1", item);
    const structure: LiveStructure = { blocks: [block] };

    const result = swapExercise(structure, 0, 0, "ex-B");

    const resultItem = result.blocks[0]!.items[0]!;
    expect(resultItem.exerciseId).toBe("ex-B");
    expect(resultItem.performedExerciseId).toBe("pe-1");
    // setTargets unchanged
    expect(resultItem.setTargets).toHaveLength(1);
    expect(resultItem.setTargets[0]!.id).toBe(item.setTargets[0]!.id);
  });
});
