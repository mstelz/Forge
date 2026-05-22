import { useState, useCallback } from "react";
import type { Goal, GoalCategory, GoalDirection } from "../../../shared/goals";
import { GoalCreateSchema } from "../../../shared/goals";
import { cn } from "../../lib/cn";
import { useExercises } from "../../hooks/use-exercises";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalFormState = {
  category: GoalCategory;
  title: string;
  direction: GoalDirection;
  startValue: string;
  targetValue: string;
  unit: string;
  linkedExerciseId: string;
  linkedProgramRunId: string;
  deadline: string; // ISO date string "YYYY-MM-DD"
  notes: string;
};

type Props = {
  mode: "create" | "edit";
  initial: GoalFormState;
  baseRecord: Pick<Goal, "id" | "createdAt">;
  onSubmit: (record: Goal) => Promise<void>;
  onCancel: () => void;
};

// ─── Category field config ────────────────────────────────────────────────────

type CategoryConfig = {
  showStartTarget: boolean;
  showUnit: boolean;
  unitOptions: string[] | null; // null = free text
  showLinkedExercise: boolean;
  showLinkedProgram: boolean;
  showDirection: boolean;
  lockedDirection: GoalDirection | null;
  isTimeUnit?: boolean;
};

const CATEGORY_CONFIGS: Record<GoalCategory, CategoryConfig> = {
  strength: {
    showStartTarget: true,
    showUnit: true,
    unitOptions: ["lb", "kg"],
    showLinkedExercise: true,
    showLinkedProgram: false,
    showDirection: false,
    lockedDirection: "up",
  },
  cardio: {
    showStartTarget: true,
    showUnit: true,
    unitOptions: ["mm:ss", "km", "mi", "m"],
    showLinkedExercise: true,
    showLinkedProgram: false,
    showDirection: false,
    lockedDirection: "down",
  },
  weight: {
    showStartTarget: true,
    showUnit: true,
    unitOptions: ["lb", "kg"],
    showLinkedExercise: false,
    showLinkedProgram: false,
    showDirection: false,
    lockedDirection: "down",
  },
  measurement: {
    showStartTarget: true,
    showUnit: true,
    unitOptions: ["in", "cm"],
    showLinkedExercise: false,
    showLinkedProgram: false,
    showDirection: false,
    lockedDirection: "down",
  },
  program: {
    showStartTarget: false,
    showUnit: false,
    unitOptions: null,
    showLinkedExercise: false,
    showLinkedProgram: true,
    showDirection: false,
    lockedDirection: "up",
  },
  other: {
    showStartTarget: true,
    showUnit: true,
    unitOptions: null, // free text
    showLinkedExercise: false,
    showLinkedProgram: false,
    showDirection: true,
    lockedDirection: null,
  },
};

const CATEGORY_TABS: { value: GoalCategory; label: string; icon: string }[] = [
  { value: "strength", label: "Strength", icon: "🏋️" },
  { value: "cardio", label: "Cardio", icon: "🏃" },
  { value: "weight", label: "Weight", icon: "⚖️" },
  { value: "measurement", label: "Measure", icon: "📏" },
  { value: "program", label: "Program", icon: "📋" },
  { value: "other", label: "Other", icon: "•••" },
];

// ─── Default form state ───────────────────────────────────────────────────────

export const emptyGoalFormState = (): GoalFormState => ({
  category: "strength",
  title: "",
  direction: "up",
  startValue: "",
  targetValue: "",
  unit: "lb",
  linkedExerciseId: "",
  linkedProgramRunId: "",
  deadline: "",
  notes: "",
});

export const goalToFormState = (g: Goal): GoalFormState => ({
  category: g.category,
  title: g.title,
  direction: g.direction,
  startValue: g.startValue != null ? String(g.startValue) : "",
  targetValue: g.targetValue != null ? String(g.targetValue) : "",
  unit: g.unit ?? "lb",
  linkedExerciseId: g.linkedExerciseId ?? "",
  linkedProgramRunId: g.linkedProgramRunId ?? "",
  deadline: g.deadline ? new Date(g.deadline).toISOString().split("T")[0]! : "",
  notes: g.notes ?? "",
});

// ─── Form ─────────────────────────────────────────────────────────────────────

function FormCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] bg-[var(--surface)] border border-[var(--border)] px-4 py-4 space-y-4">
      {children}
    </div>
  );
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
      {children}
    </p>
  );
}

export function GoalForm({ mode, initial, baseRecord, onSubmit, onCancel }: Props) {
  const [state, setState] = useState<GoalFormState>(initial);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const { data: exercises } = useExercises();

  const update = useCallback(<K extends keyof GoalFormState>(key: K, value: GoalFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const switchCategory = (cat: GoalCategory) => {
    const config = CATEGORY_CONFIGS[cat];
    setState((prev) => ({
      ...prev,
      category: cat,
      direction: config.lockedDirection ?? "up",
      unit: config.unitOptions ? (config.unitOptions[0] ?? "") : prev.unit,
      // Reset category-specific fields
      linkedExerciseId: "",
      linkedProgramRunId: "",
      startValue: config.showStartTarget ? prev.startValue : "",
      targetValue: config.showStartTarget ? prev.targetValue : "",
    }));
    setIsDirty(true);
  };

  const config = CATEGORY_CONFIGS[state.category];

  const buildRecord = (): Goal | null => {
    const now = Date.now();
    const start = state.startValue.trim() ? parseFloat(state.startValue) : null;
    const target = state.targetValue.trim() ? parseFloat(state.targetValue) : null;
    const deadline = state.deadline ? new Date(state.deadline).getTime() + 86400000 - 1 : null; // end of day

    return {
      id: baseRecord.id,
      category: state.category,
      title: state.title.trim(),
      direction: config.lockedDirection ?? state.direction,
      startValue: start,
      targetValue: target,
      currentValue: null,
      unit: state.unit.trim() || null,
      linkedExerciseId: state.linkedExerciseId || null,
      linkedProgramRunId: state.linkedProgramRunId || null,
      deadline,
      notes: state.notes.trim() || null,
      status: "active",
      completedAt: null,
      createdAt: baseRecord.createdAt,
      updatedAt: now,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const record = buildRecord();
    if (!record) return;

    const parsed = GoalCreateSchema.safeParse(record);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setFormError(first ? `${first.path.join(".") || "form"}: ${first.message}` : "Invalid input");
      return;
    }

    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
      setPending(false);
    }
  };

  const handleCancel = () => {
    if (isDirty) {
      if (!confirm("Discard changes?")) return;
    }
    onCancel();
  };

  // Check if required fields for the category are filled
  const isValid = (() => {
    if (!state.title.trim()) return false;
    if (config.showLinkedExercise && !state.linkedExerciseId) return false;
    if (config.showLinkedProgram && !state.linkedProgramRunId) return false;
    if (config.showStartTarget) {
      if (!state.startValue.trim() || !state.targetValue.trim()) return false;
      if (isNaN(parseFloat(state.startValue)) || isNaN(parseFloat(state.targetValue))) return false;
    }
    if (config.showUnit && !config.unitOptions && !state.unit.trim()) return false;
    return true;
  })();

  const linkedExercises = exercises?.filter((ex) => {
    if (state.category === "strength") return ex.type === "strength";
    if (state.category === "cardio") return ex.type === "cardio" || ex.type === "mixed";
    return false;
  }) ?? [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* TYPE */}
      <FormCard>
        <FormLabel>Select goal type</FormLabel>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchCategory(tab.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-[10px] px-2 py-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                state.category === tab.value
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
              aria-pressed={state.category === tab.value}
            >
              <span className="text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </FormCard>

      {/* TITLE */}
      <FormCard>
        <FormLabel>Goal title</FormLabel>
        <input
          type="text"
          value={state.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Squat 315 lb"
          maxLength={120}
          required
          className="w-full rounded-[8px] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
        />
      </FormCard>

      {/* START / TARGET */}
      {config.showStartTarget ? (
        <FormCard>
          <FormLabel>Start / Target</FormLabel>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <p className="mb-1 text-[10px] text-[var(--text-muted)]">Start</p>
              {config.isTimeUnit || state.unit === "mm:ss" ? (
                <input
                  type="text"
                  value={state.startValue}
                  onChange={(e) => update("startValue", e.target.value)}
                  placeholder="00:00"
                  className="w-full rounded-[8px] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm font-mono text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                />
              ) : (
                <input
                  type="number"
                  value={state.startValue}
                  onChange={(e) => update("startValue", e.target.value)}
                  placeholder="0"
                  className="w-full rounded-[8px] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                />
              )}
            </div>
            <div className="flex-1">
              <p className="mb-1 text-[10px] text-[var(--accent)]">Target</p>
              {config.isTimeUnit || state.unit === "mm:ss" ? (
                <input
                  type="text"
                  value={state.targetValue}
                  onChange={(e) => update("targetValue", e.target.value)}
                  placeholder="00:00"
                  className="w-full rounded-[8px] bg-[var(--accent)]/20 px-3 py-2.5 text-sm font-mono font-semibold text-[var(--accent)] outline-none ring-1 ring-[var(--accent)] focus:ring-[var(--accent)]"
                />
              ) : (
                <input
                  type="number"
                  value={state.targetValue}
                  onChange={(e) => update("targetValue", e.target.value)}
                  placeholder="0"
                  className="w-full rounded-[8px] bg-[var(--accent)]/20 px-3 py-2.5 text-sm font-semibold text-[var(--accent)] outline-none ring-1 ring-[var(--accent)] focus:ring-[var(--accent)]"
                />
              )}
            </div>
            {/* Unit */}
            {config.showUnit ? (
              <div className="w-20">
                {config.unitOptions ? (
                  <select
                    value={state.unit}
                    onChange={(e) => update("unit", e.target.value)}
                    className="w-full rounded-[8px] bg-[var(--surface-elevated)] px-2 py-2.5 text-xs text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                  >
                    {config.unitOptions.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={state.unit}
                    onChange={(e) => update("unit", e.target.value.slice(0, 16))}
                    placeholder="unit"
                    maxLength={16}
                    className="w-full rounded-[8px] bg-[var(--surface-elevated)] px-2 py-2.5 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                  />
                )}
              </div>
            ) : null}
          </div>
        </FormCard>
      ) : null}

      {/* LINKED EXERCISE */}
      {config.showLinkedExercise ? (
        <FormCard>
          <FormLabel>Linked exercise</FormLabel>
          {linkedExercises.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              No {state.category === "strength" ? "strength" : "cardio"} exercises found. Add exercises first.
            </p>
          ) : (
            <select
              value={state.linkedExerciseId}
              onChange={(e) => update("linkedExerciseId", e.target.value)}
              className="w-full rounded-[8px] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              required
            >
              <option value="">Select an exercise…</option>
              {linkedExercises.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          )}
        </FormCard>
      ) : null}

      {/* LINKED PROGRAM RUN */}
      {config.showLinkedProgram ? (
        <FormCard>
          <FormLabel>Linked program run</FormLabel>
          <input
            type="text"
            value={state.linkedProgramRunId}
            onChange={(e) => update("linkedProgramRunId", e.target.value)}
            placeholder="Program run ID"
            className="w-full rounded-[8px] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          />
          <p className="text-[10px] text-[var(--text-subtle)]">
            TODO: Program run picker (programs spec not yet implemented)
          </p>
        </FormCard>
      ) : null}

      {/* DEADLINE */}
      <FormCard>
        <FormLabel>Deadline (optional)</FormLabel>
        <div className="flex items-center gap-2">
          <CalendarIcon />
          <input
            type="date"
            value={state.deadline}
            onChange={(e) => update("deadline", e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className="flex-1 rounded-[8px] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          />
        </div>
      </FormCard>

      {/* NOTES */}
      <FormCard>
        <FormLabel>Notes (optional)</FormLabel>
        <textarea
          value={state.notes}
          onChange={(e) => update("notes", e.target.value)}
          maxLength={4000}
          rows={3}
          placeholder="Focus on form and progressive overload…"
          className="w-full resize-none rounded-[8px] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
        />
      </FormCard>

      {/* DIRECTION (other only) */}
      {config.showDirection ? (
        <FormCard>
          <FormLabel>Direction</FormLabel>
          <div className="flex gap-2">
            {(["up", "down"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => update("direction", d)}
                className={cn(
                  "flex-1 rounded-[10px] py-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  state.direction === d
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {d === "up" ? "Higher is better" : "Lower is better"}
              </button>
            ))}
          </div>
        </FormCard>
      ) : null}

      {/* Form error */}
      {formError ? (
        <p className="rounded-[8px] bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
          {formError}
        </p>
      ) : null}

      {/* Submit */}
      <div className="pt-2 pb-4 space-y-2">
        <button
          type="submit"
          disabled={pending || !isValid}
          className="w-full rounded-[14px] bg-[var(--accent)] py-4 text-sm font-bold uppercase tracking-widest text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
        >
          {pending
            ? "Saving…"
            : mode === "create"
            ? "Create Goal"
            : "Save"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="w-full rounded-[14px] py-3 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-[var(--text-muted)]">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
