import { describe, expect, it } from "vitest";
import { buildLiveStructure } from "../start";
import type { Routine } from "../../../../shared";
import type { RoutineItemOverride } from "../../../../shared/program";

const ids = {
  routine: "00000000-0000-0000-0000-000000000001",
  block: "00000000-0000-0000-0000-000000000002",
  itemA: "00000000-0000-0000-0000-000000000003",
  itemB: "00000000-0000-0000-0000-000000000004",
  exerciseA: "00000000-0000-0000-0000-000000000005",
  exerciseB: "00000000-0000-0000-0000-000000000006",
};

function makeRoutine(): Routine {
  return {
    id: ids.routine,
    name: "Upper",
    notes: null,
    estimatedDurationMin: null,
    blocks: [
      {
        id: ids.block,
        type: "superset",
        order: 0,
        roundCount: 3,
        restSec: null,
        tempo: null,
        notes: null,
        items: [
          {
            id: ids.itemA,
            exerciseId: ids.exerciseA,
            order: 0,
            setCount: 3,
            repMode: "uniform",
            setTypeMode: "uniform",
            uniformReps: 8,
            uniformSetType: "normal",
            notes: null,
          },
          {
            id: ids.itemB,
            exerciseId: ids.exerciseB,
            order: 1,
            setCount: 3,
            repMode: "uniform",
            setTypeMode: "uniform",
            uniformReps: 10,
            uniformSetType: "normal",
            notes: null,
          },
        ],
      },
    ],
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  };
}

describe("buildLiveStructure", () => {
  it("uses modified set counts as the effective superset round count", () => {
    const overrides: RoutineItemOverride[] = [
      { routineItemId: ids.itemA, setCount: 4 },
      { routineItemId: ids.itemB, setCount: 4 },
    ];

    const structure = buildLiveStructure(makeRoutine(), overrides);
    const block = structure.blocks[0]!;

    expect(block.type).toBe("superset");
    expect(block.roundCount).toBe(4);
    expect(block.items.map((item) => item.setTargets)).toHaveLength(2);
    expect(block.items.every((item) => item.setTargets.length === 4)).toBe(true);
  });
});
