import { useState } from "react";
import type { SetType } from "../../../../../shared";
import type { DraftItem } from "../state";
import { cn } from "../../../../lib/cn";

const SET_TYPE_OPTIONS: { value: SetType; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "amrap", label: "AMRAP" },
  { value: "to_failure", label: "To failure" },
  { value: "drop_set", label: "Drop set" },
  { value: "rest_pause", label: "Rest-pause" },
];

const REP_OPTIONAL = new Set<SetType>(["amrap", "to_failure"]);

type RowCallbacks = {
  onReps: (setIndex: number, reps: number | undefined) => void;
  onRange: (setIndex: number, min: number | undefined, max: number | undefined) => void;
  onRpe: (setIndex: number, rpe: number | undefined) => void;
  onSetType: (setIndex: number, t: SetType) => void;
  onNotes: (setIndex: number, notes: string) => void;
};

type Props = {
  item: DraftItem;
  callbacks: RowCallbacks;
};

export function PerSetTable({ item, callbacks }: Props) {
  const targets = item.setTargets ?? [];
  const showReps = item.repMode === "per_set";
  const showRpe = item.rpeMode === "per_set";
  const showType = item.setTypeMode === "per_set";

  if (!showReps && !showRpe && !showType) return null;

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs text-[var(--text)]" aria-label="Per-set prescription">
        <thead>
          <tr className="text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)]">
            <th className="py-1 pr-2 text-left font-medium w-8">#</th>
            {showReps && <th className="py-1 px-1 text-left font-medium">Reps</th>}
            {showRpe && <th className="py-1 px-1 text-left font-medium">RPE</th>}
            {showType && <th className="py-1 px-1 text-left font-medium">Type</th>}
            <th className="py-1 pl-1 w-6" />
          </tr>
        </thead>
        <tbody>
          {targets.map((t, i) => (
            <PerSetRow
              key={t.id}
              index={i}
              target={t}
              showReps={showReps}
              showRpe={showRpe}
              showType={showType}
              callbacks={callbacks}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerSetRow({
  index,
  target,
  showReps,
  showRpe,
  showType,
  callbacks,
}: {
  index: number;
  target: NonNullable<DraftItem["setTargets"]>[number];
  showReps: boolean;
  showRpe: boolean;
  showType: boolean;
  callbacks: RowCallbacks;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRange = target.repsMin != null || target.repsMax != null;
  const [rangeMode, setRangeMode] = useState(isRange);
  const repsOptional = target.setType != null && REP_OPTIONAL.has(target.setType);

  return (
    <>
      <tr className="border-b border-[var(--border)]/40">
        <td className="py-1.5 pr-2 text-[var(--text-muted)] font-medium">{index + 1}</td>
        {showReps && (
          <td className="py-1.5 px-1">
            {repsOptional ? (
              <span className="text-[var(--text-muted)]">—</span>
            ) : rangeMode ? (
              <span className="flex items-center gap-1">
                <input
                  type="number" min={1} max={999}
                  value={target.repsMin ?? ""}
                  onChange={(e) => callbacks.onRange(index, e.target.value ? parseInt(e.target.value) : undefined, target.repsMax)}
                  aria-label={`Set ${index + 1} min reps`}
                  className="w-12 h-7 rounded bg-[var(--surface-elevated)] px-1 text-center focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                />
                <span className="text-[var(--text-subtle)]">–</span>
                <input
                  type="number" min={1} max={999}
                  value={target.repsMax ?? ""}
                  onChange={(e) => callbacks.onRange(index, target.repsMin, e.target.value ? parseInt(e.target.value) : undefined)}
                  aria-label={`Set ${index + 1} max reps`}
                  className="w-12 h-7 rounded bg-[var(--surface-elevated)] px-1 text-center focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                />
              </span>
            ) : (
              <input
                type="number" min={1} max={999}
                value={target.reps ?? ""}
                onChange={(e) => callbacks.onReps(index, e.target.value ? parseInt(e.target.value) : undefined)}
                aria-label={`Set ${index + 1} reps`}
                className="w-14 h-7 rounded bg-[var(--surface-elevated)] px-1 text-center focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              />
            )}
            {!repsOptional && (
              <button
                type="button"
                onClick={() => {
                  if (!rangeMode) {
                    callbacks.onRange(index, target.reps, target.reps);
                    callbacks.onReps(index, undefined);
                  } else {
                    callbacks.onReps(index, target.repsMin ?? target.repsMax ?? 10);
                    callbacks.onRange(index, undefined, undefined);
                  }
                  setRangeMode(!rangeMode);
                }}
                className="ml-1 text-[9px] uppercase tracking-wide text-[var(--accent)] focus:outline-none"
              >
                {rangeMode ? "±" : "~"}
              </button>
            )}
          </td>
        )}
        {showRpe && (
          <td className="py-1.5 px-1">
            <input
              type="number" min={1} max={10} step={0.5}
              value={target.rpe ?? ""}
              placeholder="—"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                callbacks.onRpe(index, isNaN(v) ? undefined : Math.round(v * 2) / 2);
              }}
              aria-label={`Set ${index + 1} RPE`}
              className="w-14 h-7 rounded bg-[var(--surface-elevated)] px-1 text-center focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            />
          </td>
        )}
        {showType && (
          <td className="py-1.5 px-1">
            <select
              value={target.setType ?? "normal"}
              onChange={(e) => callbacks.onSetType(index, e.target.value as SetType)}
              aria-label={`Set ${index + 1} type`}
              className="h-7 rounded bg-[var(--surface-elevated)] px-1 text-xs text-[var(--text)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            >
              {SET_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </td>
        )}
        <td className="py-1.5 pl-1">
          <button
            type="button"
            aria-label={expanded ? "Collapse technique notes" : "Expand technique notes"}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none",
              expanded && "text-[var(--accent)]",
            )}
          >
            <ChevronIcon expanded={expanded} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="pb-2 pt-1 px-1">
            <textarea
              value={target.techniqueNotes ?? ""}
              onChange={(e) => callbacks.onNotes(index, e.target.value)}
              placeholder="Technique notes…"
              maxLength={500}
              rows={2}
              aria-label={`Set ${index + 1} technique notes`}
              className="w-full rounded-md bg-[var(--surface-elevated)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round"
      style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
