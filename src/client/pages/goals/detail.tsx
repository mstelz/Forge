import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@radix-ui/react-dialog";
import { useGoal } from "../../hooks/use-goals";
import { useAllSessionLogs } from "../../hooks/use-sessions";
import { useExercise } from "../../hooks/use-exercises";
import { updateGoal, deleteGoal } from "../../db/mutations";
import { computeGoalProgress } from "../../goals/progress";
import { formatCountdown, formatMonDD } from "./countdown";
import { formatGoalValue } from "./format";
import { cn } from "../../lib/cn";
import type { Goal } from "../../../shared/goals";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<Goal["category"], string> = {
  strength: "STRENGTH",
  cardio: "CARDIO",
  cardio_volume: "VOLUME",
  weight: "WEIGHT",
  measurement: "MEASUREMENT",
  program: "PROGRAM",
  other: "OTHER",
};

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]">
          <DialogTitle className="text-base font-semibold text-[var(--text)]">Delete goal?</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-[var(--text-muted)]">
            This goal will be permanently deleted. This cannot be undone.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-full bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

// ─── Inline currentValue editor ───────────────────────────────────────────────

function InlineCurrentValueEditor({
  goal,
  onSave,
}: {
  goal: Goal;
  onSave: (newValue: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  const [pending, setPending] = useState(false);

  const currentDisplay = formatGoalValue(goal.currentValue, goal.unit);

  const handleSave = async () => {
    const num = parseFloat(raw);
    if (isNaN(num)) return;
    setPending(true);
    try {
      await onSave(num);
      setEditing(false);
    } finally {
      setPending(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setRaw(String(goal.currentValue ?? "")); setEditing(true); }}
        className="text-4xl font-bold tabular-nums leading-none text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:underline"
        title="Tap to edit current value"
      >
        {currentDisplay}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        autoFocus
        className="w-28 rounded-[8px] bg-[var(--surface-elevated)] px-3 py-2 text-2xl font-bold tabular-nums text-[var(--text)] outline-none ring-1 ring-[var(--accent)]"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-[var(--text-muted)]"
      >
        Cancel
      </button>
    </div>
  );
}

// ─── Detail page ──────────────────────────────────────────────────────────────

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: goal, isLoading } = useGoal(id);
  const { data: setLogs = [] } = useAllSessionLogs();
  const { data: linkedExercise } = useExercise(goal?.linkedExerciseId ?? undefined);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!id) return;
    setActionPending(true);
    try {
      await deleteGoal(id);
      navigate("/goals");
    } finally {
      setActionPending(false);
      setDeleteOpen(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!goal) return;
    const now = Date.now();
    await updateGoal({
      ...goal,
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });
  };

  const handleMarkActive = async () => {
    if (!goal) return;
    const now = Date.now();
    await updateGoal({
      ...goal,
      status: "active",
      completedAt: null,
      updatedAt: now,
    });
  };

  const handleAbandon = async () => {
    if (!goal) return;
    const now = Date.now();
    await updateGoal({
      ...goal,
      status: "abandoned",
      completedAt: null,
      updatedAt: now,
    });
  };

  const handleReactivate = async () => {
    if (!goal) return;
    const now = Date.now();
    await updateGoal({
      ...goal,
      status: "active",
      completedAt: null,
      updatedAt: now,
    });
  };

  const handleCurrentValueSave = async (newValue: number) => {
    if (!goal) return;
    const now = Date.now();

    // Determine if value crosses target (auto-complete)
    let status: Goal["status"] = goal.status;
    let completedAt: number | null = goal.completedAt;

    if (goal.targetValue != null && goal.startValue != null && goal.status === "active") {
      if (goal.direction === "up" && newValue >= goal.targetValue) {
        status = "completed";
        completedAt = now;
      } else if (goal.direction === "down" && newValue <= goal.targetValue) {
        status = "completed";
        completedAt = now;
      }
    }

    await updateGoal({
      ...goal,
      currentValue: newValue,
      status,
      completedAt,
      updatedAt: now,
    });
  };

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (!goal) {
    return (
      <>
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
          <Link
            to="/goals"
            aria-label="Back to goals"
            className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <BackIcon />
          </Link>
          <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Goal</h1>
          <span className="w-9" />
        </header>
        <main className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
          <p className="text-base font-semibold text-[var(--text)]">Goal not found</p>
          <Link to="/goals" className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">
            Back to goals
          </Link>
        </main>
      </>
    );
  }

  const progress = computeGoalProgress(goal, { setLogs });
  const percent = Math.round(progress.percent * 100);
  const countdown = formatCountdown(goal.deadline, goal.status);
  const targetDisplay = formatGoalValue(goal.targetValue, goal.unit);
  const unitLabel = goal.unit ?? "";
  const isManualCategory = goal.category === "weight" || goal.category === "measurement" || goal.category === "other";

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <Link
          to="/goals"
          aria-label="Back to goals"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <BackIcon />
        </Link>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Goal</h1>
        <GoalMenu
          goalId={goal.id}
          status={goal.status}
          onMarkComplete={handleMarkComplete}
          onMarkActive={handleMarkActive}
          onAbandon={handleAbandon}
          onReactivate={handleReactivate}
          onDelete={() => setDeleteOpen(true)}
        />
      </header>

      <main className="flex-1 space-y-4 px-4 pb-8 pt-2">
        {/* Top progress card */}
        <div className="rounded-[14px] bg-[var(--surface)] border border-[var(--border)] p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {CATEGORY_LABELS[goal.category]}
            </span>
          </div>

          <h2 className="text-lg font-bold text-[var(--text)]">{goal.title}</h2>

          {/* Current / target numerics */}
          <div className="flex items-baseline gap-2">
            {isManualCategory ? (
              <InlineCurrentValueEditor goal={goal} onSave={handleCurrentValueSave} />
            ) : (
              <span className="text-4xl font-bold tabular-nums leading-none text-[var(--text)]">
                {formatGoalValue(progress.currentValue ?? goal.startValue, goal.unit)}
              </span>
            )}
            <span className="text-base text-[var(--text-muted)]">/</span>
            <span className="text-2xl font-semibold tabular-nums text-[var(--text-muted)]">
              {targetDisplay}
            </span>
            {unitLabel ? (
              <span className="text-sm text-[var(--text-subtle)]">{unitLabel}</span>
            ) : null}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="relative h-1.5 w-full rounded-full bg-[#26272A] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex justify-between items-center">
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  countdown.variant === "overdue" && "text-red-400",
                  countdown.variant === "completed" && "text-[var(--accent)]",
                  countdown.variant === "abandoned" && "text-[var(--text-subtle)]",
                  countdown.variant === "normal" && "text-[var(--text-muted)]",
                  countdown.variant === "none" && "text-transparent",
                )}
              >
                {countdown.text || "·"}
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
                {percent}%
              </span>
            </div>
          </div>

          {/* Dates */}
          <div className="flex gap-3 text-[10px] text-[var(--text-subtle)]">
            <span>Started {formatMonDD(goal.createdAt)}</span>
            {goal.deadline ? (
              <>
                <span>·</span>
                <span>Target {formatMonDD(goal.deadline)}</span>
              </>
            ) : null}
            {goal.completedAt ? (
              <>
                <span>·</span>
                <span>Completed {formatMonDD(goal.completedAt)}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Read-only fields — tap to edit */}
        <Link
          to={`/goals/${goal.id}/edit`}
          className="block rounded-[14px] bg-[var(--surface)] border border-[var(--border)] px-4 py-3 space-y-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label="Edit goal details"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Details</p>

          <FieldRow label="Category" value={CATEGORY_LABELS[goal.category]} />
          <FieldRow label="Direction" value={goal.direction === "up" ? "Higher is better" : "Lower is better"} />
          {goal.startValue != null && (
            <FieldRow label="Start" value={`${formatGoalValue(goal.startValue, goal.unit)} ${unitLabel}`} />
          )}
          {goal.targetValue != null && (
            <FieldRow label="Target" value={`${targetDisplay} ${unitLabel}`} />
          )}
          {goal.linkedExerciseId && (
            <FieldRow label="Linked exercise" value={linkedExercise?.name ?? goal.linkedExerciseId} />
          )}
          {goal.linkedProgramRunId && (
            <FieldRow label="Linked program run" value={goal.linkedProgramRunId} />
          )}
          {goal.deadline && (
            <FieldRow label="Deadline" value={formatMonDD(goal.deadline)} />
          )}
          {goal.notes && (
            <FieldRow label="Notes" value={goal.notes} multiline />
          )}
        </Link>
      </main>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteConfirm}
        pending={actionPending}
      />
    </>
  );
}

function FieldRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-[var(--text-muted)] shrink-0">{label}</span>
      {multiline ? (
        <span className="text-xs text-[var(--text)] text-right whitespace-pre-wrap max-w-[60%]">{value}</span>
      ) : (
        <span className="text-xs font-semibold text-[var(--text)] text-right">{value}</span>
      )}
    </div>
  );
}

function GoalMenu({
  goalId,
  status,
  onMarkComplete,
  onMarkActive,
  onAbandon,
  onReactivate,
  onDelete,
}: {
  goalId: string;
  status: Goal["status"];
  onMarkComplete: () => void;
  onMarkActive: () => void;
  onAbandon: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Goal actions"
        className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <KebabIcon />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="z-50 min-w-[160px] rounded-[var(--radius-card)] bg-[var(--surface-elevated)] p-1 ring-1 ring-[var(--border)]"
        >
          <DropdownMenuItem
            onSelect={() => navigate(`/goals/${goalId}/edit`)}
            className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--text)] outline-none data-[highlighted]:bg-[var(--surface)]"
          >
            Edit
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1 h-px bg-[var(--border)]" />

          {status === "active" ? (
            <DropdownMenuItem
              onSelect={onMarkComplete}
              className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--text)] outline-none data-[highlighted]:bg-[var(--surface)]"
            >
              Mark complete
            </DropdownMenuItem>
          ) : status === "completed" ? (
            <DropdownMenuItem
              onSelect={onMarkActive}
              className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--text)] outline-none data-[highlighted]:bg-[var(--surface)]"
            >
              Mark active
            </DropdownMenuItem>
          ) : null}

          {status !== "abandoned" ? (
            <DropdownMenuItem
              onSelect={onAbandon}
              className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--text-muted)] outline-none data-[highlighted]:bg-[var(--surface)]"
            >
              Abandon
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={onReactivate}
              className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--text)] outline-none data-[highlighted]:bg-[var(--surface)]"
            >
              Reactivate
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator className="my-1 h-px bg-[var(--border)]" />

          <DropdownMenuItem
            onSelect={onDelete}
            className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--danger)] outline-none data-[highlighted]:bg-[var(--surface)]"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}

function DetailSkeleton() {
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <div className="w-9 h-9 rounded-md bg-[var(--surface)] animate-pulse" />
        <div className="h-4 w-12 rounded bg-[var(--surface)] animate-pulse" />
        <div className="w-9 h-9 rounded-md bg-[var(--surface)] animate-pulse" />
      </header>
      <main className="flex-1 space-y-3 px-4 pt-2 pb-8">
        <div className="h-40 rounded-[14px] bg-[var(--surface)] animate-pulse" />
        <div className="h-32 rounded-[14px] bg-[var(--surface)] animate-pulse" />
      </main>
    </>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
