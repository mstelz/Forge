import { useState } from "react";
import type { SetType } from "../../../../../shared";

const REP_OPTIONAL_TYPES = new Set<SetType>(["amrap", "to_failure"]);

type Props = {
  uniformReps: number | undefined;
  uniformRepsMin: number | undefined;
  uniformRepsMax: number | undefined;
  uniformSetType: SetType | undefined;
  onReps: (n: number | undefined) => void;
  onRange: (min: number | undefined, max: number | undefined) => void;
};

export function UniformRepsInput({
  uniformReps,
  uniformRepsMin,
  uniformRepsMax,
  uniformSetType,
  onReps,
  onRange,
}: Props) {
  const isRange = uniformRepsMin != null || uniformRepsMax != null;
  const [rangeMode, setRangeMode] = useState(isRange);

  const hidden = uniformSetType != null && REP_OPTIONAL_TYPES.has(uniformSetType);
  if (hidden) return null;

  const toggleRange = () => {
    if (!rangeMode) {
      onRange(uniformReps, uniformReps);
      onReps(undefined);
    } else {
      onReps(uniformRepsMin ?? uniformRepsMax ?? 10);
      onRange(undefined, undefined);
    }
    setRangeMode(!rangeMode);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)] w-10 shrink-0">Reps</span>
      {rangeMode ? (
        <>
          <input
            type="number"
            min={1}
            max={999}
            value={uniformRepsMin ?? ""}
            onChange={(e) => onRange(e.target.value ? parseInt(e.target.value) : undefined, uniformRepsMax)}
            aria-label="Min reps"
            className="h-8 w-16 rounded-md bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)] text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
          <span className="text-[var(--text-muted)] text-xs">–</span>
          <input
            type="number"
            min={1}
            max={999}
            value={uniformRepsMax ?? ""}
            onChange={(e) => onRange(uniformRepsMin, e.target.value ? parseInt(e.target.value) : undefined)}
            aria-label="Max reps"
            className="h-8 w-16 rounded-md bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)] text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </>
      ) : (
        <input
          type="number"
          min={1}
          max={999}
          value={uniformReps ?? ""}
          onChange={(e) => onReps(e.target.value ? parseInt(e.target.value) : undefined)}
          aria-label="Reps"
          className="h-8 w-16 rounded-md bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)] text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
      )}
      <button
        type="button"
        onClick={toggleRange}
        className="text-[10px] uppercase tracking-wide text-[var(--accent)] hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {rangeMode ? "Fixed" : "Range"}
      </button>
    </div>
  );
}
