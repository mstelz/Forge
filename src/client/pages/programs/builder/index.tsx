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
import { syncLog } from "../../../sync/sync-logger";
import { WeekGrid, type DayCellPickerTarget } from "./week-grid";
import { DayPickerSheet } from "./day-picker-sheet";
import { DuplicateWeekModal, RepeatPatternModal } from "./week-modals";
import { ChevronLeftIcon, ChevronDownIcon } from "./icons";

type Mode = "create" | "edit";

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
      syncLog({ level: "error", category: "app", message: "program-builder save failed", detail: String(err) });
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
        <div className="mx-4 mt-2 space-y-0">
          <WeekGrid
            state={state}
            routineMap={routineMap}
            onWorkoutTap={(target) => {
              if (target.routineId) {
                setOverridesTarget(target);
              } else {
                setPickerTarget(target);
              }
            }}
            onAddWorkout={(weekIndex, dayIndex) => {
              setPickerTarget({
                weekIndex,
                dayIndex,
                order: 0,
                routineId: null,
                isRestDay: false,
                notes: null,
                overrides: null,
                isAddingWorkout: true,
              });
            }}
            onRemoveWorkout={(weekIndex, dayIndex, order) => {
              dispatch({ type: "REMOVE_WORKOUT", weekIndex, dayIndex, order });
            }}
          />
        </div>
      </div>

      {/* Routine picker — for empty/rest days, adding a workout, or changing from OverridesSheet */}
      {pickerTarget ? (
        <DayPickerSheet
          open={true}
          onClose={() => setPickerTarget(null)}
          weekIndex={pickerTarget.weekIndex}
          dayIndex={pickerTarget.dayIndex}
          order={pickerTarget.order}
          currentRoutineId={pickerTarget.routineId}
          isRestDay={pickerTarget.isRestDay}
          notes={pickerTarget.notes}
          routines={routines}
          dispatch={dispatch}
          isAddingWorkout={pickerTarget.isAddingWorkout}
          onSelectAndCustomize={(routineId, order) => {
            const target = pickerTarget;
            setPickerTarget(null);
            setOverridesTarget({
              ...target,
              order,
              routineId,
              isRestDay: false,
              overrides: null,
              isAddingWorkout: false,
            });
          }}
        />
      ) : null}

      {/* Overrides editor — opens when tapping a workout chip */}
      {overridesTarget?.routineId ? (
        <OverridesSheet
          open={true}
          onClose={() => setOverridesTarget(null)}
          weekIndex={overridesTarget.weekIndex}
          dayIndex={overridesTarget.dayIndex}
          order={overridesTarget.order}
          routineId={overridesTarget.routineId}
          routineName={routineMap.get(overridesTarget.routineId)?.name ?? ""}
          existingOverrides={overridesTarget.overrides}
          existingNotes={overridesTarget.notes}
          exerciseMap={exerciseMap}
          dispatch={dispatch}
          onChangeRoutine={() => {
            setPickerTarget({ ...overridesTarget, isAddingWorkout: false });
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
