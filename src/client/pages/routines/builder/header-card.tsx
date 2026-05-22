import { useState, type Dispatch } from "react";
import type { BuilderAction, DraftRoutine } from "./state";

type Props = {
  draft: DraftRoutine;
  dispatch: Dispatch<BuilderAction>;
  nameError?: string;
};

export function HeaderCard({ draft, dispatch, nameError }: Props) {
  const [durationEditing, setDurationEditing] = useState(false);
  const [durationRaw, setDurationRaw] = useState("");

  const commitDuration = () => {
    setDurationEditing(false);
    const n = parseInt(durationRaw.trim(), 10);
    if (!isNaN(n) && n >= 1 && n <= 600) {
      dispatch({ type: "SET_DURATION", minutes: n });
    } else if (!durationRaw.trim()) {
      dispatch({ type: "SET_DURATION", minutes: null });
    }
    setDurationRaw("");
  };

  return (
    <div className="mx-4 mb-4 rounded-[var(--radius-card)] bg-[var(--surface)] p-4 space-y-2">
      {/* Name */}
      <div>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => dispatch({ type: "SET_NAME", name: e.target.value })}
          placeholder="Routine name"
          maxLength={100}
          aria-label="Routine name"
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "name-error" : undefined}
          className="w-full bg-transparent text-xl font-bold text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-sm"
        />
        {nameError && (
          <p id="name-error" className="mt-1 text-xs text-red-400">{nameError}</p>
        )}
      </div>

      {/* Duration chip */}
      <div className="flex items-center gap-2 flex-wrap">
        {durationEditing ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">~</span>
            <input
              type="number"
              min={1}
              max={600}
              value={durationRaw}
              onChange={(e) => setDurationRaw(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDurationEditing(false); setDurationRaw(""); } }}
              autoFocus
              aria-label="Estimated duration in minutes"
              className="h-7 w-16 rounded-md bg-[var(--surface-elevated)] px-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text-muted)]">min</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setDurationEditing(true); setDurationRaw(draft.estimatedDurationMin != null ? String(draft.estimatedDurationMin) : ""); }}
            className="flex items-center gap-1 rounded-full bg-[var(--surface-elevated)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span aria-hidden="true">⊙</span>
            {draft.estimatedDurationMin != null ? `~${draft.estimatedDurationMin} min` : "Set duration"}
          </button>
        )}
      </div>

      {/* Notes */}
      <textarea
        value={draft.notes ?? ""}
        onChange={(e) => dispatch({ type: "SET_NOTES", notes: e.target.value })}
        placeholder="Add notes about this session…"
        maxLength={2000}
        rows={2}
        aria-label="Routine notes"
        className="w-full resize-none bg-transparent text-sm text-[var(--text-muted)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-sm"
      />
    </div>
  );
}
