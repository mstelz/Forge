import { useContext } from "react";
import { SettingsContext } from "../../../contexts/settings-context";
import { CheckIcon } from "../icons";
import { formatRepsTarget, formatRpeTarget, formatSetSummary } from "./format";
import type { SessionSetLog } from "../../../../shared";
import type { PlannedSlot } from "./types";

export type SetRowState = "logged" | "cursor" | "future" | "skipped";

export interface SetRowProps {
  setNumber: number;
  rowState: SetRowState;
  slot: PlannedSlot;
  log?: SessionSetLog;
  isCursor: boolean;
  onClick: () => void;
}

export function SetRow({ setNumber, rowState, slot, log, isCursor, onClick }: SetRowProps) {
  const { weightUnit, distanceUnit } = useContext(SettingsContext);
  const repsTarget = formatRepsTarget(slot);
  const rpeTarget = formatRpeTarget(slot);

  if (rowState === "logged" && log) {
    if (isCursor) {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-label={`Set ${setNumber} — editing`}
          className="flex w-full items-center gap-3 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/8 px-3 py-2.5 text-left"
        >
          <span className="w-5 text-xs font-bold text-[var(--accent)] tabular-nums">{setNumber}</span>
          <div className="flex flex-1 items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text)]">
              {formatSetSummary(log, weightUnit, distanceUnit)}
            </span>
          </div>
          <span className="text-xs text-[var(--accent)]">editing</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Set ${setNumber} — logged. Tap to edit.`}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-elevated)]"
      >
        <span className="w-5 text-xs text-[var(--text-subtle)] tabular-nums">{setNumber}</span>
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">
            {formatSetSummary(log, weightUnit, distanceUnit)}
          </span>
          {log.rpe != null && (
            <span className="rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
              RPE {log.rpe}
            </span>
          )}
        </div>
        <CheckIcon className="text-green-500" />
      </button>
    );
  }

  if (rowState === "skipped") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Set ${setNumber} — skipped. Tap to edit.`}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-elevated)]"
      >
        <span className="w-5 text-xs text-[var(--text-subtle)] tabular-nums">{setNumber}</span>
        <span className="text-sm text-[var(--text-subtle)]">— skipped</span>
      </button>
    );
  }

  if (isCursor) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Set ${setNumber} — active. Tap to log.`}
        className="flex w-full items-center gap-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2.5 text-left"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-[var(--accent-fg)]">
          {setNumber}
        </span>
        <div className="flex flex-1 items-center gap-2">
          {repsTarget && (
            <span className="text-sm font-semibold text-[var(--accent)]">{repsTarget}</span>
          )}
          {rpeTarget && (
            <span className="rounded bg-[var(--accent)]/20 px-1.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
              {rpeTarget}
            </span>
          )}
          {!repsTarget && !rpeTarget && (
            <span className="text-sm text-[var(--accent)]">—</span>
          )}
        </div>
        <span className="text-xs text-[var(--accent)]">Tap to edit</span>
      </button>
    );
  }

  // future placeholder
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Set ${setNumber} — upcoming`}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left"
    >
      <span className="w-5 text-xs text-[var(--text-subtle)] tabular-nums">{setNumber}</span>
      <div className="flex flex-1 items-center gap-2">
        {repsTarget ? (
          <span className="text-sm text-[var(--text-subtle)]">{repsTarget}</span>
        ) : (
          <span className="text-sm text-[var(--text-subtle)]">— —</span>
        )}
        {rpeTarget && (
          <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs text-[var(--text-subtle)]">
            {rpeTarget}
          </span>
        )}
      </div>
    </button>
  );
}
