import type { Dispatch } from "react";
import { ExercisePicker } from "../../../components/exercise-picker";
import type { BuilderAction, BuilderState } from "./state";

type Props = {
  state: BuilderState;
  dispatch: Dispatch<BuilderAction>;
  pickerOpen: "single" | "superset-first" | "superset-second" | null;
  setPickerOpen: (v: "single" | "superset-first" | "superset-second" | null) => void;
};

export function AddBar({ state, dispatch, pickerOpen, setPickerOpen }: Props) {
  const handleAddSingle = (exerciseId: string) => {
    dispatch({ type: "ADD_SINGLE_BLOCK", exerciseId });
    setPickerOpen(null);
  };

  const handleSupersetFirst = (exerciseId: string) => {
    dispatch({ type: "BEGIN_SUPERSET", firstExerciseId: exerciseId });
    setPickerOpen("superset-second");
  };

  const handleSupersetSecond = (exerciseId: string) => {
    dispatch({ type: "COMPLETE_SUPERSET", secondExerciseId: exerciseId });
    setPickerOpen(null);
  };

  return (
    <>
      <div className="sticky bottom-0 z-10 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3 flex gap-3">
        <button
          type="button"
          onClick={() => setPickerOpen("single")}
          className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-[var(--surface)] py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
        >
          <PlusIcon />
          Add exercise
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen("superset-first")}
          className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-[var(--surface)] py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
        >
          <ChainIcon />
          Add superset
        </button>
      </div>

      <ExercisePicker
        open={pickerOpen === "single"}
        onClose={() => setPickerOpen(null)}
        onSelect={handleAddSingle}
        title="Add exercise"
      />
      <ExercisePicker
        open={pickerOpen === "superset-first"}
        onClose={() => setPickerOpen(null)}
        onSelect={handleSupersetFirst}
        title="First exercise"
      />
      <ExercisePicker
        open={pickerOpen === "superset-second"}
        onClose={() => { dispatch({ type: "REMOVE_BLOCK", blockId: state.pendingSuperset?.pendingBlockId ?? "" }); setPickerOpen(null); }}
        onSelect={handleSupersetSecond}
        title="Second exercise"
      />
    </>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
