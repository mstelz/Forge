import type { Dispatch } from "react";
import type { BuilderAction, DraftItem } from "./state";
import { SetCountStepper } from "./fields/set-count";
import { ModeToggles } from "./fields/mode-toggles";
import { UniformRepsInput } from "./fields/uniform-reps";
import { UniformSetTypeSelector } from "./fields/uniform-set-type";
import { DurationInputs } from "./fields/duration";
import { PerSetTable } from "./fields/per-set-table";
import type { Exercise } from "../../../../shared";

type Props = {
  blockId: string;
  item: DraftItem;
  exerciseType?: Exercise["type"];
  dispatch: Dispatch<BuilderAction>;
};

export function PrescriptionEditor({ blockId, item, exerciseType, dispatch }: Props) {
  const showDuration = exerciseType === "cardio" || exerciseType === "mixed";
  const showReps = exerciseType !== "cardio";

  const d = (a: BuilderAction) => dispatch(a);

  return (
    <div className="space-y-3 px-4 py-3 bg-[var(--surface-elevated)] rounded-b-[var(--radius-card)] border-t border-[var(--border)]">
      <SetCountStepper
        value={item.setCount}
        onChange={(n) => d({ type: "SET_ITEM_SET_COUNT", blockId, itemId: item.id, setCount: n })}
      />

      <ModeToggles
        repMode={item.repMode}
        setTypeMode={item.setTypeMode}
        onRepModeChange={(m) => d({ type: "SET_ITEM_REP_MODE", blockId, itemId: item.id, mode: m })}
        onSetTypeModeChange={(m) => d({ type: "SET_ITEM_SET_TYPE_MODE", blockId, itemId: item.id, mode: m })}
      />

      {item.repMode === "uniform" && showReps && (
        <UniformRepsInput
          uniformReps={item.uniformReps}
          uniformRepsMin={item.uniformRepsMin}
          uniformRepsMax={item.uniformRepsMax}
          uniformSetType={item.uniformSetType}
          onReps={(r) => d({ type: "SET_UNIFORM_REPS", blockId, itemId: item.id, reps: r })}
          onRange={(min, max) => d({ type: "SET_UNIFORM_REPS_RANGE", blockId, itemId: item.id, min, max })}
        />
      )}

      {item.setTypeMode === "uniform" && (
        <UniformSetTypeSelector
          value={item.uniformSetType}
          onChange={(t) => d({ type: "SET_UNIFORM_SET_TYPE", blockId, itemId: item.id, setType: t })}
        />
      )}

      {showDuration && (
        <DurationInputs
          durationSec={item.durationSec}
          durationMinSec={item.durationMinSec}
          durationMaxSec={item.durationMaxSec}
          onSec={(sec) => d({ type: "SET_DURATION_SEC", blockId, itemId: item.id, sec })}
          onRange={(min, max) => d({ type: "SET_DURATION_RANGE", blockId, itemId: item.id, min, max })}
        />
      )}

      <PerSetTable
        item={item}
        callbacks={{
          onReps: (si, reps) => d({ type: "SET_SET_TARGET_REPS", blockId, itemId: item.id, setIndex: si, reps }),
          onRange: (si, min, max) => d({ type: "SET_SET_TARGET_REPS_RANGE", blockId, itemId: item.id, setIndex: si, min, max }),
          onSetType: (si, t) => d({ type: "SET_SET_TARGET_SET_TYPE", blockId, itemId: item.id, setIndex: si, setType: t }),
          onNotes: (si, notes) => d({ type: "SET_SET_TARGET_NOTES", blockId, itemId: item.id, setIndex: si, notes }),
        }}
      />

      <div>
        <textarea
          value={item.notes ?? ""}
          onChange={(e) => d({ type: "SET_ITEM_NOTES", blockId, itemId: item.id, notes: e.target.value })}
          placeholder="Item notes…"
          maxLength={1000}
          rows={2}
          aria-label="Exercise notes"
          className="w-full rounded-md bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
      </div>
    </div>
  );
}
