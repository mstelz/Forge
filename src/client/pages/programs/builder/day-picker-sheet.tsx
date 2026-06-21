import { useState } from "react";
import type { Routine } from "../../../../shared";
import type { BuilderAction } from "./state";
import { DAY_LABELS } from "./week-grid";
import { ChevronLeftIcon, SearchIcon, SlidersIcon } from "./icons";

// Routine picker / day-config sheet for the program builder, extracted from index.tsx
// (issue 09). Prop-driven; all schedule mutations are dispatched to the builder reducer.

type DayPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  weekIndex: number;
  dayIndex: number;
  order: number;
  currentRoutineId: string | null;
  isRestDay: boolean;
  notes: string | null;
  routines: Routine[];
  dispatch: React.Dispatch<BuilderAction>;
  onSelectAndCustomize: (routineId: string, order: number) => void;
  /** When true, we're adding a second+ workout; dispatch ADD_WORKOUT instead of SET_DAY */
  isAddingWorkout?: boolean;
};

export function DayPickerSheet({
  open,
  onClose,
  weekIndex,
  dayIndex,
  order,
  currentRoutineId,
  isRestDay,
  notes,
  routines,
  dispatch,
  onSelectAndCustomize,
  isAddingWorkout = false,
}: DayPickerSheetProps) {
  const [search, setSearch] = useState("");
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [showNotes, setShowNotes] = useState(!!notes);

  const filtered = search.trim()
    ? routines.filter((r) =>
        r.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : routines;

  const handleSelectRoutine = (routineId: string) => {
    if (isAddingWorkout) {
      dispatch({ type: "ADD_WORKOUT", weekIndex, dayIndex, routineId });
    } else {
      dispatch({
        type: "SET_DAY",
        weekIndex,
        dayIndex,
        order,
        routineId,
        isRestDay: false,
        notes: showNotes ? draftNotes || null : null,
      });
    }
    setSearch("");
    onClose();
  };

  const handleSelectAndCustomize = (routineId: string) => {
    if (isAddingWorkout) {
      dispatch({ type: "ADD_WORKOUT", weekIndex, dayIndex, routineId });
      setSearch("");
      // For add mode, compute the next order (after add it'll be workouts.length)
      // We don't know it here precisely, so just close and let the user tap the chip
      onClose();
    } else {
      dispatch({
        type: "SET_DAY",
        weekIndex,
        dayIndex,
        order,
        routineId,
        isRestDay: false,
        notes: showNotes ? draftNotes || null : null,
      });
      setSearch("");
      onSelectAndCustomize(routineId, order);
    }
  };

  const handleMarkRest = () => {
    dispatch({
      type: "SET_DAY",
      weekIndex,
      dayIndex,
      order: 0,
      routineId: null,
      isRestDay: true,
      notes: showNotes ? draftNotes || null : null,
    });
    onClose();
  };

  const handleClear = () => {
    dispatch({ type: "CLEAR_DAY", weekIndex, dayIndex });
    onClose();
  };

  const handleSaveNotes = () => {
    dispatch({
      type: "SET_DAY",
      weekIndex,
      dayIndex,
      routineId: currentRoutineId,
      isRestDay,
      notes: draftNotes || null,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configure day"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]"
    >
      <header className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ChevronLeftIcon />
        </button>
        <h2 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
          Week {weekIndex + 1} · {DAY_LABELS[dayIndex]}
        </h2>
        <div className="w-9" />
      </header>

      {/* Quick actions — hidden in add-workout mode */}
      {!isAddingWorkout && (
        <div className="flex gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={handleMarkRest}
            className="flex-1 rounded-full border border-[var(--border)] py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Rest day
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex-1 rounded-full border border-[var(--border)] py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="flex-1 rounded-full border border-[var(--border)] py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Notes
          </button>
        </div>
      )}

      {/* Notes textarea */}
      {showNotes ? (
        <div className="px-4 pt-3">
          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            maxLength={1000}
            placeholder="Add notes for this day…"
            rows={3}
            className="w-full rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] resize-none"
          />
          <button
            type="button"
            onClick={handleSaveNotes}
            className="mt-2 w-full rounded-full bg-[var(--accent)] py-2 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Save notes
          </button>
        </div>
      ) : null}

      {/* Routine search */}
      <div className="px-4 pt-3">
        <label className="relative block">
          <span className="sr-only">Search routines</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search routines"
            placeholder="Search routines"
            autoFocus
            className="h-11 w-full rounded-[var(--radius-card)] bg-[var(--surface)] pl-10 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </label>
      </div>

      <ul className="flex-1 overflow-y-auto px-4 pt-3 pb-8 space-y-2">
        {filtered.length === 0 ? (
          <li className="py-12 text-center text-sm text-[var(--text-muted)]">
            No routines found
          </li>
        ) : (
          filtered.map((r) => (
            <li key={r.id}>
              <div className="flex items-center gap-1 rounded-[var(--radius-card)] bg-[var(--surface)] pr-1 transition-colors hover:bg-[var(--surface-elevated)]">
                <button
                  type="button"
                  onClick={() => handleSelectRoutine(r.id)}
                  className="flex flex-1 items-center gap-3 px-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-l-[var(--radius-card)]"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]"
                  >
                    {r.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">
                    {r.name}
                    {currentRoutineId === r.id ? (
                      <span className="ml-2 text-xs text-[var(--accent)]">✓</span>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAndCustomize(r.id)}
                  aria-label={`Add ${r.name} and customize`}
                  title="Add and customize"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-subtle)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <SlidersIcon />
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
