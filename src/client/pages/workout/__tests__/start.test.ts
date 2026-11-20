import { describe, expect, it } from "vitest";
import { readWorkoutGuidance, snapshotWorkoutTemplate } from "../../../lib/session/workout-guidance";
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

  it("applies the scheduled exercise cue and keeps other routine cues", () => {
    const routine = makeRoutine();
    routine.blocks[0]!.items[0]!.notes = "Base press cue";
    routine.blocks[0]!.items[1]!.notes = "Base row cue";

    const structure = buildLiveStructure(routine, [
      { routineItemId: ids.itemA, notes: "Pause on the chest today" },
    ]);

    expect(structure.blocks[0]!.items.map((item) => item.notes)).toEqual([
      "Pause on the chest today",
      "Base row cue",
    ]);
  });
});

describe("workout guidance snapshots", () => {
  it("captures the scheduled day, routine and program guidance", () => {
    const routine = { ...makeRoutine(), notes: "Start with pressing" };
    const snapshot = snapshotWorkoutTemplate(routine, {
      dayNotes: "  Leave two reps in reserve  ",
      programDescription: "Build pressing strength",
    });
    routine.notes = "Edited later";

    expect(readWorkoutGuidance(snapshot)).toEqual({
      dayNotes: "Leave two reps in reserve",
      routineNotes: "Start with pressing",
      programDescription: "Build pressing strength",
    });
  });

  it("reads older routine snapshots and tolerates a missing or invalid snapshot", () => {
    const routine = { ...makeRoutine(), notes: "Start with pressing" };
    expect(readWorkoutGuidance(JSON.stringify(routine))).toEqual({
      dayNotes: "",
      routineNotes: "Start with pressing",
      programDescription: "",
    });
    const empty = { dayNotes: "", routineNotes: "", programDescription: "" };
    expect(readWorkoutGuidance(null)).toEqual(empty);
    expect(readWorkoutGuidance("{")).toEqual(empty);
  });
});
