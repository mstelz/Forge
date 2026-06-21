import { useState } from "react";
import type { BuilderAction } from "./state";

// Duplicate-week and repeat-pattern modals for the program builder, extracted from
// index.tsx (issue 09). Self-contained; both dispatch to the builder reducer.

type DuplicateWeekModalProps = {
  open: boolean;
  onClose: () => void;
  durationWeeks: number;
  dispatch: React.Dispatch<BuilderAction>;
  hasDaysInRange: (destStart: number, destEnd: number) => boolean;
};

export function DuplicateWeekModal({
  open,
  onClose,
  durationWeeks,
  dispatch,
  hasDaysInRange,
}: DuplicateWeekModalProps) {
  const [sourceWeek, setSourceWeek] = useState(0);
  const [destStart, setDestStart] = useState(1);
  const [destEnd, setDestEnd] = useState(1);

  if (!open) return null;

  const handleApply = () => {
    const hasExisting = hasDaysInRange(destStart, destEnd);
    if (
      hasExisting &&
      !confirm(
        `Weeks ${destStart + 1}–${destEnd + 1} have existing assignments. Overwrite?`,
      )
    ) {
      return;
    }
    dispatch({ type: "DUPLICATE_WEEK", sourceWeek, destStart, destEnd });
    onClose();
  };

  const weekOptions = Array.from({ length: durationWeeks }, (_, i) => i);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dup-week-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--surface-elevated)] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dup-week-title" className="text-base font-semibold text-[var(--text)]">
          Duplicate week
        </h2>

        <div className="space-y-3">
          <label className="block text-sm text-[var(--text-muted)]">
            Source week
            <select
              value={sourceWeek}
              onChange={(e) => setSourceWeek(Number(e.target.value))}
              className="mt-1 w-full rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  Week {w + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-[var(--text-muted)]">
            Destination start
            <select
              value={destStart}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDestStart(v);
                if (destEnd < v) setDestEnd(v);
              }}
              className="mt-1 w-full rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  Week {w + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-[var(--text-muted)]">
            Destination end
            <select
              value={destEnd}
              onChange={(e) => setDestEnd(Number(e.target.value))}
              className="mt-1 w-full rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {weekOptions
                .filter((w) => w >= destStart)
                .map((w) => (
                  <option key={w} value={w}>
                    Week {w + 1}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

type RepeatPatternModalProps = {
  open: boolean;
  onClose: () => void;
  durationWeeks: number;
  dispatch: React.Dispatch<BuilderAction>;
  hasDaysAfter: (sourceEnd: number) => boolean;
};

export function RepeatPatternModal({
  open,
  onClose,
  durationWeeks,
  dispatch,
  hasDaysAfter,
}: RepeatPatternModalProps) {
  const [sourceStart, setSourceStart] = useState(0);
  const [sourceEnd, setSourceEnd] = useState(Math.min(1, durationWeeks - 1));

  if (!open) return null;

  const handleApply = () => {
    if (sourceEnd >= durationWeeks - 1) {
      alert("No weeks remain after the pattern end to repeat into.");
      return;
    }
    const hasExisting = hasDaysAfter(sourceEnd);
    if (
      hasExisting &&
      !confirm(
        `Weeks ${sourceEnd + 2}–${durationWeeks} have existing assignments. Overwrite?`,
      )
    ) {
      return;
    }
    dispatch({ type: "REPEAT_PATTERN", sourceStart, sourceEnd });
    onClose();
  };

  const weekOptions = Array.from({ length: durationWeeks }, (_, i) => i);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="repeat-pattern-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--surface-elevated)] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="repeat-pattern-title" className="text-base font-semibold text-[var(--text)]">
          Repeat pattern
        </h2>
        <p className="text-xs text-[var(--text-muted)]">
          Select the source weeks to use as the pattern, then it will be tiled across all remaining weeks.
        </p>

        <div className="space-y-3">
          <label className="block text-sm text-[var(--text-muted)]">
            Pattern start
            <select
              value={sourceStart}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSourceStart(v);
                if (sourceEnd < v) setSourceEnd(v);
              }}
              className="mt-1 w-full rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  Week {w + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-[var(--text-muted)]">
            Pattern end
            <select
              value={sourceEnd}
              onChange={(e) => setSourceEnd(Number(e.target.value))}
              className="mt-1 w-full rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {weekOptions
                .filter((w) => w >= sourceStart)
                .map((w) => (
                  <option key={w} value={w}>
                    Week {w + 1}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
