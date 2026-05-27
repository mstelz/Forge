import { useReducer, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { useProgram } from "../../../hooks/use-programs";
import { useActiveRunForProgram } from "../../../hooks/use-program-runs";
import { useRoutines } from "../../../hooks/use-routines";
import { useExercises } from "../../../hooks/use-exercises";
import { createProgram, updateProgram } from "../../../db/mutations";
import { ProgramCreateInput, ProgramUpdateInput } from "../../../../shared";
import type { Program, Routine, RoutineItemOverride } from "../../../../shared";
import {
  builderReducer,
  emptyDraft,
  toDraft,
  normalizeDraft,
  type BuilderState,
  type BuilderAction,
} from "./state";
import { OverridesSheet } from "./overrides-sheet";
import { useDiscardGuard, DiscardDialog } from "../../routines/builder/discard-guard";

type Mode = "create" | "edit";

// ─── Day-of-week labels ───────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// dayIndex in spec: 0=Mon … 6=Sun (based on design showing Mon-Sun order)

// ─── Routine picker sheet ────────────────────────────────────────────────────

type DayPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  weekIndex: number;
  dayIndex: number;
  currentRoutineId: string | null;
  isRestDay: boolean;
  notes: string | null;
  routines: Routine[];
  dispatch: React.Dispatch<BuilderAction>;
  onSelectAndCustomize: (routineId: string) => void;
};

function DayPickerSheet({
  open,
  onClose,
  weekIndex,
  dayIndex,
  currentRoutineId,
  isRestDay,
  notes,
  routines,
  dispatch,
  onSelectAndCustomize,
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
    dispatch({
      type: "SET_DAY",
      weekIndex,
      dayIndex,
      routineId,
      isRestDay: false,
      notes: showNotes ? draftNotes || null : null,
    });
    setSearch("");
    onClose();
  };

  const handleSelectAndCustomize = (routineId: string) => {
    dispatch({
      type: "SET_DAY",
      weekIndex,
      dayIndex,
      routineId,
      isRestDay: false,
      notes: showNotes ? draftNotes || null : null,
    });
    setSearch("");
    onSelectAndCustomize(routineId);
  };

  const handleMarkRest = () => {
    dispatch({
      type: "SET_DAY",
      weekIndex,
      dayIndex,
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

      {/* Quick actions */}
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

// ─── Duplicate-week modal ────────────────────────────────────────────────────

type DuplicateWeekModalProps = {
  open: boolean;
  onClose: () => void;
  durationWeeks: number;
  dispatch: React.Dispatch<BuilderAction>;
  hasDaysInRange: (destStart: number, destEnd: number) => boolean;
};

function DuplicateWeekModal({
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

// ─── Repeat-pattern modal ────────────────────────────────────────────────────

type RepeatPatternModalProps = {
  open: boolean;
  onClose: () => void;
  durationWeeks: number;
  dispatch: React.Dispatch<BuilderAction>;
  hasDaysAfter: (sourceEnd: number) => boolean;
};

function RepeatPatternModal({
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

// ─── Week grid ───────────────────────────────────────────────────────────────

type DayCellPickerTarget = {
  weekIndex: number;
  dayIndex: number;
  routineId: string | null;
  isRestDay: boolean;
  notes: string | null;
  overrides: RoutineItemOverride[] | null;
};

type WeekGridProps = {
  state: BuilderState;
  routineMap: Map<string, Routine>;
  onCellTap: (target: DayCellPickerTarget) => void;
};

function WeekGrid({ state, routineMap, onCellTap }: WeekGridProps) {
  const { durationWeeks, days } = state.draft;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] border-collapse" role="grid" aria-label="Program schedule grid">
        <thead>
          <tr>
            <th className="w-14 pb-1" />
            {DAY_LABELS.map((d) => (
              <th
                key={d}
                className="pb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: durationWeeks }, (_, wi) => {
            return (
              <tr key={wi}>
                <td className="pr-2 text-right">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">
                    W{wi + 1}
                  </span>
                </td>
                {Array.from({ length: 7 }, (_, di) => {
                  const day = days.find(
                    (d) => d.weekIndex === wi && d.dayIndex === di,
                  );
                  const routine = day?.routineId
                    ? routineMap.get(day.routineId)
                    : null;

                  const hasOverrides = !!(day?.overrides?.length);

                  return (
                    <td key={di} className="p-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          onCellTap({
                            weekIndex: wi,
                            dayIndex: di,
                            routineId: day?.routineId ?? null,
                            isRestDay: day?.isRestDay ?? false,
                            notes: day?.notes ?? null,
                            overrides: day?.overrides ?? null,
                          })
                        }
                        aria-label={`Week ${wi + 1} ${DAY_LABELS[di]}: ${
                          day?.isRestDay
                            ? "rest day"
                            : routine
                              ? routine.name
                              : "empty"
                        }${hasOverrides ? " (overridden)" : ""}`}
                        className="relative flex h-10 w-full items-center justify-center rounded-[6px] border border-[var(--border)] text-center transition-colors hover:border-[var(--accent)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                        style={{
                          background: day?.isRestDay
                            ? "var(--surface)"
                            : day?.routineId
                              ? "var(--surface)"
                              : "transparent",
                        }}
                      >
                        {day?.isRestDay ? (
                          <span className="text-[9px] font-bold uppercase text-[var(--text-subtle)]">
                            Rest
                          </span>
                        ) : routine ? (
                          <span className="truncate px-0.5 text-[9px] font-semibold text-[var(--accent)]">
                            {routine.name
                              .split(" ")
                              .map((w) => w[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 3)}
                          </span>
                        ) : (
                          <span className="text-[var(--text-subtle)] opacity-60">
                            <PlusSmallIcon />
                          </span>
                        )}
                        {hasOverrides ? (
                          <span
                            aria-hidden="true"
                            className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                          />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Builder inner ───────────────────────────────────────────────────────────

type BuilderInnerProps = {
  mode: Mode;
  existing: Program | undefined;
  routines: Routine[];
  navigate: ReturnType<typeof useNavigate>;
  hasActiveRun: boolean;
};

function BuilderInner({ mode, existing, routines, navigate, hasActiveRun }: BuilderInnerProps) {
  const [state, dispatch] = useReducer(
    builderReducer,
    undefined,
    (): BuilderState => ({
      draft: existing ? toDraft(existing) : emptyDraft(),
      isDirty: false,
    }),
  );

  const { data: exercises } = useExercises();
  const exerciseMap = new Map(
    (exercises ?? []).map((e) => [e.id, e]),
  );

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);
  const [pickerTarget, setPickerTarget] = useState<DayCellPickerTarget | null>(null);
  const [overridesTarget, setOverridesTarget] = useState<DayCellPickerTarget | null>(null);
  const [dupWeekOpen, setDupWeekOpen] = useState(false);
  const [repeatPatternOpen, setRepeatPatternOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const blocker = useDiscardGuard({ isDirty: state.isDirty && !savedRef.current });

  const routineMap = new Map<string, Routine>(routines.map((r) => [r.id, r]));

  const hasDaysInRange = (destStart: number, destEnd: number) =>
    state.draft.days.some(
      (d) => d.weekIndex >= destStart && d.weekIndex <= destEnd,
    );

  const hasDaysAfter = (sourceEnd: number) =>
    state.draft.days.some((d) => d.weekIndex > sourceEnd);

  const handleSave = async () => {
    const normalized = normalizeDraft(state.draft);
    const schema = mode === "create" ? ProgramCreateInput : ProgramUpdateInput;
    const result = schema.safeParse(normalized);

    if (!result.success) {
      const errors = result.error.issues.map((i) => i.message);
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setSaving(true);
    savedRef.current = true;

    const now = Date.now();
    const record: Program = {
      ...result.data,
      createdAt: result.data.createdAt ?? now,
      updatedAt: result.data.updatedAt ?? now,
    };

    try {
      if (mode === "create") {
        await createProgram(record);
      } else {
        await updateProgram(record);
      }
      navigate("/programs");
    } catch (err) {
      console.error("[program-builder] save failed", err);
      savedRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
          {mode === "create" ? "New program" : "Edit program"}
        </h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pb-8">
        {/* Active-run banner */}
        {hasActiveRun && mode === "edit" ? (
          <div className="mx-4 mt-4 rounded-[var(--radius-card)] border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs text-amber-300">
              An active run is in progress — only not-started days will reflect changes.
            </p>
          </div>
        ) : null}

        {/* Validation errors */}
        {validationErrors.length > 0 ? (
          <div className="mx-4 mt-4 rounded-[var(--radius-card)] border border-red-500/40 bg-red-500/10 px-4 py-3 space-y-1">
            {validationErrors.map((msg, i) => (
              <p key={i} className="text-xs text-red-400">
                {msg}
              </p>
            ))}
          </div>
        ) : null}

        {/* Header fields */}
        <div className="mx-4 mt-4 rounded-[var(--radius-card)] bg-[var(--surface)] p-4 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1">
              Program name *
            </label>
            <input
              type="text"
              value={state.draft.name}
              onChange={(e) =>
                dispatch({ type: "SET_NAME", name: e.target.value })
              }
              maxLength={100}
              placeholder="e.g. Hypertrophy 12"
              className="w-full rounded-[var(--radius-card)] bg-[var(--bg)] px-3 py-2 text-base font-bold text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1">
              Description
            </label>
            <textarea
              value={state.draft.description ?? ""}
              onChange={(e) =>
                dispatch({ type: "SET_DESCRIPTION", description: e.target.value })
              }
              maxLength={2000}
              placeholder="Describe this program…"
              rows={2}
              className="w-full rounded-[var(--radius-card)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] resize-none"
            />
          </div>

          {/* Duration weeks stepper */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1">
              Duration (weeks)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "SET_DURATION_WEEKS",
                    weeks: state.draft.durationWeeks - 1,
                  })
                }
                disabled={state.draft.durationWeeks <= 1}
                aria-label="Decrease weeks"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                –
              </button>
              <span className="min-w-[2ch] text-center text-lg font-bold tabular-nums text-[var(--text)]">
                {state.draft.durationWeeks}
              </span>
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "SET_DURATION_WEEKS",
                    weeks: state.draft.durationWeeks + 1,
                  })
                }
                disabled={state.draft.durationWeeks >= 52}
                aria-label="Increase weeks"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Grid actions bar */}
        <div className="mx-4 mt-4 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Schedule
          </p>
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Actions <ChevronDownIcon />
            </button>
            {actionsOpen ? (
              <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setDupWeekOpen(true);
                    setActionsOpen(false);
                  }}
                  className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  Duplicate week
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRepeatPatternOpen(true);
                    setActionsOpen(false);
                  }}
                  className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  Repeat pattern
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Week grid */}
        <div className="mx-4 mt-2 rounded-[var(--radius-card)] bg-[var(--surface)] p-3">
          <WeekGrid
            state={state}
            routineMap={routineMap}
            onCellTap={(target) => {
              if (target.routineId) {
                setOverridesTarget(target);
              } else {
                setPickerTarget(target);
              }
            }}
          />
        </div>
      </div>

      {/* Routine picker — only for empty/rest days, or when changing routine from OverridesSheet */}
      {pickerTarget ? (
        <DayPickerSheet
          open={true}
          onClose={() => setPickerTarget(null)}
          weekIndex={pickerTarget.weekIndex}
          dayIndex={pickerTarget.dayIndex}
          currentRoutineId={pickerTarget.routineId}
          isRestDay={pickerTarget.isRestDay}
          notes={pickerTarget.notes}
          routines={routines}
          dispatch={dispatch}
          onSelectAndCustomize={(routineId) => {
            const target = pickerTarget;
            setPickerTarget(null);
            setOverridesTarget({
              ...target,
              routineId,
              isRestDay: false,
              overrides: null,
            });
          }}
        />
      ) : null}

      {/* Overrides editor — opens directly when tapping an assigned day */}
      {overridesTarget?.routineId ? (
        <OverridesSheet
          open={true}
          onClose={() => setOverridesTarget(null)}
          weekIndex={overridesTarget.weekIndex}
          dayIndex={overridesTarget.dayIndex}
          routineId={overridesTarget.routineId}
          routineName={routineMap.get(overridesTarget.routineId)?.name ?? ""}
          existingOverrides={overridesTarget.overrides}
          existingNotes={overridesTarget.notes}
          exerciseMap={exerciseMap}
          dispatch={dispatch}
          onChangeRoutine={() => {
            setPickerTarget(overridesTarget);
            setOverridesTarget(null);
          }}
        />
      ) : null}

      {/* Duplicate-week modal */}
      <DuplicateWeekModal
        open={dupWeekOpen}
        onClose={() => setDupWeekOpen(false)}
        durationWeeks={state.draft.durationWeeks}
        dispatch={dispatch}
        hasDaysInRange={hasDaysInRange}
      />

      {/* Repeat-pattern modal */}
      <RepeatPatternModal
        open={repeatPatternOpen}
        onClose={() => setRepeatPatternOpen(false)}
        durationWeeks={state.draft.durationWeeks}
        dispatch={dispatch}
        hasDaysAfter={hasDaysAfter}
      />

      {/* Discard guard */}
      <DiscardDialog
        open={blocker.state === "blocked"}
        onKeep={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
      />
    </>
  );
}

// ─── Page shell ─────────────────────────────────────────────────────────────

export function ProgramBuilderPage({ mode }: { mode: Mode }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: existingProgram, isLoading } = useProgram(
    mode === "edit" ? id : undefined,
  );
  const { data: activeRun } = useActiveRunForProgram(
    mode === "edit" ? id : undefined,
  );
  const { data: routines } = useRoutines();

  if (mode === "edit" && isLoading) {
    return (
      <div className="animate-pulse px-4 pt-8 space-y-4">
        <div className="h-20 rounded-[var(--radius-card)] bg-[var(--surface)]" />
        <div className="h-16 rounded-[var(--radius-card)] bg-[var(--surface)]" />
      </div>
    );
  }

  if (mode === "edit" && !isLoading && !existingProgram) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-[var(--text-muted)]">Program not found.</p>
        <button
          type="button"
          onClick={() => navigate("/programs")}
          className="text-sm text-[var(--accent)] underline"
        >
          Back to programs
        </button>
      </div>
    );
  }

  return (
    <BuilderInner
      key={id ?? "new"}
      mode={mode}
      existing={existingProgram}
      routines={routines ?? []}
      navigate={navigate}
      hasActiveRun={!!activeRun}
    />
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PlusSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}
