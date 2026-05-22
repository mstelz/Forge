import { useReducer, useState, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { useRoutine } from "../../../hooks/use-routines";
import { useExercises } from "../../../hooks/use-exercises";
import { createRoutine, updateRoutine } from "../../../db/mutations";
import { RoutineCreateInput, RoutineUpdateInput } from "../../../../shared";
import type { Exercise, Routine, RoutineBlock, RoutineItem } from "../../../../shared";
import { builderReducer, normalizeDraft, type BuilderState, type DraftRoutine } from "./state";
import { HeaderCard } from "./header-card";
import { BlockList } from "./block-list";
import { AddBar } from "./add-bar";
import { useDiscardGuard, DiscardDialog } from "./discard-guard";

import { uuidv4 } from "../../../lib/uuid";

type Mode = "create" | "edit";

function toDraft(r: Routine): DraftRoutine {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? null,
    estimatedDurationMin: r.estimatedDurationMin ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    blocks: r.blocks.map((b: RoutineBlock) => ({
      id: b.id,
      type: b.type,
      roundCount: b.roundCount,
      restSec: b.restSec,
      tempo: b.tempo,
      notes: b.notes,
      items: b.items.map((it: RoutineItem) => ({
        id: it.id,
        exerciseId: it.exerciseId,
        setCount: it.setCount,
        repMode: it.repMode,
        rpeMode: it.rpeMode,
        setTypeMode: it.setTypeMode,
        uniformReps: it.uniformReps,
        uniformRepsMin: it.uniformRepsMin,
        uniformRepsMax: it.uniformRepsMax,
        uniformRpe: it.uniformRpe,
        uniformSetType: it.uniformSetType,
        setTargets: it.setTargets,
        durationSec: it.durationSec,
        durationMinSec: it.durationMinSec,
        durationMaxSec: it.durationMaxSec,
        notes: it.notes,
      })),
    })),
  };
}

function emptyDraft(): DraftRoutine {
  return {
    id: uuidv4(),
    name: "",
    notes: null,
    estimatedDurationMin: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    blocks: [],
  };
}

function initState(existing: Routine | undefined): BuilderState {
  return {
    draft: existing ? toDraft(existing) : emptyDraft(),
    pendingSuperset: null,
    isDirty: false,
  };
}

// Key-based remount: pass key={routineId ?? "new"} to force re-init when route changes.
export function RoutineBuilderPage({ mode }: { mode: Mode }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: existingRoutine, isLoading } = useRoutine(mode === "edit" ? id : undefined);
  const { data: exercises } = useExercises();

  const exerciseMap = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const ex of exercises ?? []) m.set(ex.id, ex);
    return m;
  }, [exercises]);

  if (mode === "edit" && isLoading) {
    return <BuilderSkeleton />;
  }

  if (mode === "edit" && !isLoading && !existingRoutine) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-[var(--text-muted)]">Routine not found.</p>
        <button type="button" onClick={() => navigate("/routines")} className="text-sm text-[var(--accent)] underline">
          Back to routines
        </button>
      </div>
    );
  }

  return (
    <BuilderInner
      key={id ?? "new"}
      mode={mode}
      existing={existingRoutine}
      exerciseMap={exerciseMap}
      navigate={navigate}
    />
  );
}

type InnerProps = {
  mode: Mode;
  existing: Routine | undefined;
  exerciseMap: Map<string, Exercise>;
  navigate: ReturnType<typeof useNavigate>;
};

function BuilderInner({ mode, existing, exerciseMap, navigate }: InnerProps) {
  const [state, dispatch] = useReducer(builderReducer, undefined, () => initState(existing));
  const [pickerOpen, setPickerOpen] = useState<"single" | "superset-first" | "superset-second" | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);

  const blocker = useDiscardGuard({ isDirty: state.isDirty && !savedRef.current });

  const handleSave = async () => {
    const normalized = normalizeDraft(state.draft);
    const schema = mode === "create" ? RoutineCreateInput : RoutineUpdateInput;
    const result = schema.safeParse(normalized);

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!errors[key]) errors[key] = issue.message;
      }
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});
    setSaving(true);
    savedRef.current = true;
    const now = Date.now();
    const record: Routine = {
      ...result.data,
      createdAt: result.data.createdAt ?? now,
      updatedAt: result.data.updatedAt ?? now,
    };
    try {
      if (mode === "create") {
        await createRoutine(record);
      } else {
        await updateRoutine(record);
      }
      navigate("/routines");
    } catch (err) {
      console.error("[builder] save failed", err);
      savedRef.current = false;
      setSaving(false);
    }
  };

  const nameError = validationErrors["name"];

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
          {mode === "create" ? "New routine" : "Edit routine"}
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

      <div className="flex-1 overflow-y-auto">
        <div className="pt-4">
          <HeaderCard draft={state.draft} dispatch={dispatch} nameError={nameError} />
        </div>

        {state.draft.blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Add an exercise or a superset to get started
            </p>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <BlockList blocks={state.draft.blocks} exerciseMap={exerciseMap} dispatch={dispatch} />
          </div>
        )}
      </div>

      <AddBar state={state} dispatch={dispatch} pickerOpen={pickerOpen} setPickerOpen={setPickerOpen} />

      <DiscardDialog
        open={blocker.state === "blocked"}
        onKeep={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
      />
    </>
  );
}

function BuilderSkeleton() {
  return (
    <div className="animate-pulse px-4 pt-8 space-y-4">
      <div className="h-20 rounded-[var(--radius-card)] bg-[var(--surface)]" />
      <div className="h-16 rounded-[var(--radius-card)] bg-[var(--surface)]" />
      <div className="h-16 rounded-[var(--radius-card)] bg-[var(--surface)]" />
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
