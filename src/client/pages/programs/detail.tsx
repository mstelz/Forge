import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProgram } from "../../hooks/use-programs";
import { useRoutines } from "../../hooks/use-routines";
import { useActiveRunForProgram } from "../../hooks/use-program-runs";
import {
  createProgramRun,
  updateProgramRun,
  endProgramRun,
} from "../../db/mutations";
import { queryKeys } from "../../db/query-keys";
import { computeRunProgress } from "../../lib/programs/run-progress";
import { uuidv4 } from "../../lib/uuid";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@radix-ui/react-dialog";
import type { Program, ProgramRun, ProgramRunDayState } from "../../../shared";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getDayState(
  run: ProgramRun | null | undefined,
  weekIndex: number,
  dayIndex: number,
): ProgramRunDayState | undefined {
  return run?.dayStates.find(
    (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
  );
}

/** Returns the week index containing the first not_started non-rest day */
function computeCurrentWeekIndex(
  program: Program,
  run: ProgramRun | null | undefined,
): number {
  if (!run || run.status !== "active") return -1;
  for (let w = 0; w < program.durationWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const dayEntries = program.days.filter(
        (pd) => pd.weekIndex === w && pd.dayIndex === d,
      );
      const primary = dayEntries.find((pd) => (pd.order ?? 0) === 0) ?? dayEntries[0];
      if (primary?.isRestDay) continue;
      if (!dayEntries.some((pd) => pd.routineId)) continue;
      const ds = getDayState(run, w, d);
      if (!ds || ds.status === "not_started") return w;
    }
  }
  return program.durationWeeks - 1;
}

function getRoutineAbbr(routineId: string, routineNames: Map<string, string>): string {
  const name = routineNames.get(routineId);
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }
  return name.slice(0, 2).toUpperCase();
}

// ─── End program dialog ───────────────────────────────────────────────────────

function EndProgramDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]">
          <DialogTitle className="text-base font-semibold text-[var(--text)]">
            End this program?
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-[var(--text-muted)]">
            You'll be able to start a new run after ending this one.
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
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60"
            >
              {pending ? "Ending…" : "End program"}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

// ─── Start program dialog ─────────────────────────────────────────────────────

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function StartProgramDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (weekZeroStartDate: number) => void;
  pending?: boolean;
}) {
  const today = new Date();
  const [dateValue, setDateValue] = useState(() => toDateInputValue(today));

  const weekZeroStartDate = (() => {
    const [y, mo, day] = dateValue.split("-").map(Number);
    return new Date(y!, mo! - 1, day!, 0, 0, 0, 0).getTime();
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
        <DialogContent className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]">
          <DialogTitle className="text-base font-semibold text-[var(--text)]">
            Start program
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-sm text-[var(--text-muted)]">
            Pick the date to start. Day 1 of the program will be available from this date.
          </DialogDescription>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1.5">
                Start date
              </label>
              <input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                min={toDateInputValue(new Date(today.getTime() - 7 * 86400000))}
                className="w-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              />
            </div>
          </div>

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
              onClick={() => onConfirm(weekZeroStartDate)}
              disabled={pending || !dateValue}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
            >
              {pending ? "Starting…" : "Start program"}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

// ─── Day-cell action menu ─────────────────────────────────────────────────────

function DayCellMenu({
  open,
  onClose,
  weekIndex,
  dayIndex,
  isRestDay,
  run,
  onSkip,
  onUnskip,
}: {
  open: boolean;
  onClose: () => void;
  weekIndex: number;
  dayIndex: number;
  isRestDay: boolean;
  run: ProgramRun | null | undefined;
  onSkip: (weekIndex: number, dayIndex: number) => void;
  onUnskip: (weekIndex: number, dayIndex: number) => void;
}) {
  if (!open) return null;

  const ds = getDayState(run, weekIndex, dayIndex);
  const status = ds?.status ?? "not_started";
  const canSkip = status !== "completed" && status !== "skipped";
  const canUnskip = status === "skipped";
  const dayLabel = DAY_LABELS[dayIndex] ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-t-[var(--radius-card)] bg-[var(--surface)] p-4 space-y-1"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] pb-2">
          Week {weekIndex + 1} · {dayLabel}
        </p>
        {canSkip ? (
          <button
            type="button"
            onClick={() => {
              onSkip(weekIndex, dayIndex);
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-[var(--radius-card)] px-4 py-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Skip day
          </button>
        ) : null}
        {canUnskip ? (
          <button
            type="button"
            onClick={() => {
              onUnskip(weekIndex, dayIndex);
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-[var(--radius-card)] px-4 py-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Unskip
          </button>
        ) : null}
        {!canSkip && !canUnskip ? (
          <p className="px-4 py-3 text-sm text-[var(--text-muted)]">
            No actions available for this day.
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center justify-center px-4 py-2 text-sm text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Kebab menu ───────────────────────────────────────────────────────────────

function KebabMenu({
  open,
  onOpenChange,
  onEdit,
  onEndProgram,
  hasActiveRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onEndProgram: () => void;
  hasActiveRun: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        className="absolute right-4 top-14 z-40 min-w-36 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onEdit();
          }}
          className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Edit
        </button>
        {hasActiveRun ? (
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onEndProgram();
            }}
            className="flex w-full items-center px-4 py-2.5 text-sm text-red-400 hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            End program
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── Schedule grid ────────────────────────────────────────────────────────────

function ScheduleGrid({
  program,
  run,
  currentWeekIndex,
  routineNames,
  onDayCellMenu,
}: {
  program: Program;
  run: ProgramRun | null | undefined;
  currentWeekIndex: number;
  routineNames: Map<string, string>;
  onDayCellMenu: (weekIndex: number, dayIndex: number) => void;
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: program.durationWeeks }, (_, wi) => {
        const isCurrentPeriod = wi === currentWeekIndex && run?.status === "active";

        return (
          <div
            key={wi}
            className={`rounded-[var(--radius-card)] overflow-hidden ${
              isCurrentPeriod
                ? "border border-[var(--accent)]/30 bg-[var(--surface)]"
                : "bg-[var(--surface)]"
            }`}
          >
            {/* Week header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">
                Week {String(wi + 1).padStart(2, "0")}
              </span>
              {isCurrentPeriod ? (
                <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--accent-fg)]">
                  Progressing
                </span>
              ) : null}
            </div>

            {/* Day rows */}
            <div className="divide-y divide-[var(--border)]">
              {Array.from({ length: 7 }, (_, di) => {
                const dayEntries = program.days
                  .filter((pd) => pd.weekIndex === wi && pd.dayIndex === di)
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                const primary = dayEntries.find((pd) => (pd.order ?? 0) === 0) ?? dayEntries[0];
                const ds = getDayState(run, wi, di);
                const status = ds?.status ?? "not_started";

                // Is this the "current" day?
                const isCurrentDay =
                  isCurrentPeriod &&
                  !primary?.isRestDay &&
                  dayEntries.some((pd) => pd.routineId) &&
                  (status === "not_started" || status === "active") &&
                  (() => {
                    for (let d2 = 0; d2 < di; d2++) {
                      const entries2 = program.days.filter(
                        (pd) => pd.weekIndex === wi && pd.dayIndex === d2,
                      );
                      const p2 = entries2.find((pd) => (pd.order ?? 0) === 0) ?? entries2[0];
                      if (p2?.isRestDay || !entries2.some((pd) => pd.routineId)) continue;
                      const ds2 = getDayState(run, wi, d2);
                      const s2 = ds2?.status ?? "not_started";
                      if (s2 === "not_started" || s2 === "active") return false;
                    }
                    return true;
                  })();

                const hasActiveRun = !!run && run.status === "active";
                const canInteract = hasActiveRun && status !== "completed";

                // Status indicator
                let statusNode: React.ReactNode = null;
                if (status === "completed") {
                  statusNode = (
                    <span className="text-green-500 flex-shrink-0" aria-label="completed">
                      <CheckIcon />
                    </span>
                  );
                } else if (status === "skipped") {
                  statusNode = (
                    <span className="text-[10px] text-[var(--text-subtle)] flex-shrink-0 opacity-60">
                      skip
                    </span>
                  );
                } else if (isCurrentDay) {
                  statusNode = (
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)] flex-shrink-0" aria-label="current day" />
                  );
                }

                // Workout chips or rest indicator
                let workoutContent: React.ReactNode;
                if (primary?.isRestDay) {
                  workoutContent = (
                    <span className="text-[11px] text-[var(--text-subtle)] italic">rest</span>
                  );
                } else if (dayEntries.length > 0 && dayEntries.some((pd) => pd.routineId)) {
                  workoutContent = (
                    <div className="flex flex-wrap gap-1">
                      {dayEntries
                        .filter((pd) => pd.routineId)
                        .map((pd) => {
                          const name = routineNames.get(pd.routineId!) ?? "?";
                          const label = pd.label ? `${name} · ${pd.label}` : name;
                          return (
                            <span
                              key={pd.id}
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                isCurrentDay && (pd.order ?? 0) === 0
                                  ? "bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                                  : status === "completed"
                                    ? "bg-green-600/10 text-green-600"
                                    : status === "skipped"
                                      ? "opacity-50 bg-[var(--surface-elevated)] text-[var(--text-subtle)]"
                                      : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
                              }`}
                            >
                              {label}
                            </span>
                          );
                        })}
                    </div>
                  );
                } else {
                  workoutContent = null;
                }

                return (
                  <div
                    key={di}
                    role={canInteract ? "button" : undefined}
                    tabIndex={canInteract ? 0 : undefined}
                    onClick={canInteract ? () => onDayCellMenu(wi, di) : undefined}
                    onKeyDown={canInteract ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDayCellMenu(wi, di); } } : undefined}
                    aria-label={`Week ${wi + 1} ${DAY_LABELS[di]}${primary?.isRestDay ? " (rest)" : status !== "not_started" ? ` (${status})` : ""}`}
                    aria-current={isCurrentDay ? "step" : undefined}
                    className={`flex min-h-[38px] items-center gap-3 px-3 py-1.5 ${
                      canInteract
                        ? "cursor-pointer hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                        : ""
                    } ${isCurrentDay ? "bg-[var(--accent)]/5" : ""}`}
                  >
                    {/* Day label */}
                    <span className={`w-6 flex-shrink-0 text-[10px] font-bold uppercase tracking-wider ${isCurrentDay ? "text-[var(--accent)]" : "text-[var(--text-subtle)]"}`}>
                      {DAY_LABELS[di]}
                    </span>

                    {/* Workout chips */}
                    <div className="flex-1 min-w-0">
                      {workoutContent}
                    </div>

                    {/* Status icon */}
                    {statusNode}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: program, isLoading } = useProgram(id);
  const { data: routines } = useRoutines();
  const { data: activeRun } = useActiveRunForProgram(id);

  const [kebabOpen, setKebabOpen] = useState(false);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [dayCellMenuTarget, setDayCellMenuTarget] = useState<{
    weekIndex: number;
    dayIndex: number;
  } | null>(null);

  // Build routine name map from loaded routines
  const routineNames = new Map<string, string>();
  for (const r of routines ?? []) {
    routineNames.set(r.id, r.name);
  }

  const startRunMutation = useMutation({
    mutationFn: async (weekZeroStartDate: number) => {
      if (!program) throw new Error("No program");
      const now = Date.now();
      const run = {
        id: uuidv4(),
        programId: program.id,
        status: "active" as const,
        startedAt: now,
        endedAt: null,
        currentWeekIndex: 0,
        currentDayIndex: 0,
        weekZeroStartDate,
        dayStates: [],
        createdAt: now,
        updatedAt: now,
      };
      return createProgramRun(run);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.programRuns.all });
      setStartDialogOpen(false);
    },
  });

  const endRunMutation = useMutation({
    mutationFn: async () => {
      if (!activeRun) throw new Error("No active run");
      return endProgramRun(activeRun.id, "abandoned", Date.now());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.programRuns.all });
      setEndDialogOpen(false);
    },
  });

  const skipDayMutation = useMutation({
    mutationFn: async ({
      weekIndex,
      dayIndex,
    }: {
      weekIndex: number;
      dayIndex: number;
    }) => {
      if (!activeRun) throw new Error("No active run");
      const existingState = activeRun.dayStates.find(
        (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
      );
      const newState = {
        id: existingState?.id ?? uuidv4(),
        weekIndex,
        dayIndex,
        status: "skipped" as const,
        sessionId: null,
        updatedAt: Date.now(),
      };
      const updatedDayStates = existingState
        ? activeRun.dayStates.map((s) =>
            s.weekIndex === weekIndex && s.dayIndex === dayIndex ? newState : s,
          )
        : [...activeRun.dayStates, newState];

      return updateProgramRun({
        ...activeRun,
        dayStates: updatedDayStates,
        updatedAt: Date.now(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.programRuns.all });
    },
  });

  const unskipDayMutation = useMutation({
    mutationFn: async ({
      weekIndex,
      dayIndex,
    }: {
      weekIndex: number;
      dayIndex: number;
    }) => {
      if (!activeRun) throw new Error("No active run");
      // Remove the day state row entirely (reverts to not_started)
      const updatedDayStates = activeRun.dayStates.filter(
        (s) => !(s.weekIndex === weekIndex && s.dayIndex === dayIndex),
      );
      return updateProgramRun({
        ...activeRun,
        dayStates: updatedDayStates,
        updatedAt: Date.now(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.programRuns.all });
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse px-4 pt-8 space-y-4">
        <div className="h-12 rounded-[var(--radius-card)] bg-[var(--surface)]" />
        <div className="h-24 rounded-[var(--radius-card)] bg-[var(--surface)]" />
        <div className="h-64 rounded-[var(--radius-card)] bg-[var(--surface)]" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-[var(--text-muted)]">Program not found.</p>
        <Link to="/programs" className="text-sm text-[var(--accent)] underline">
          Back to programs
        </Link>
      </div>
    );
  }

  const progress = activeRun ? computeRunProgress(program, activeRun) : 0;
  const currentWeekIndex = computeCurrentWeekIndex(program, activeRun);
  const desc = program.description?.split("\n")[0]?.trim();

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)] truncate px-1">
          {program.name}
        </h1>
        <button
          type="button"
          onClick={() => setKebabOpen((v) => !v)}
          aria-label="Program options"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <KebabIconVert />
        </button>
      </header>

      <KebabMenu
        open={kebabOpen}
        onOpenChange={setKebabOpen}
        onEdit={() => navigate(`/programs/${program.id}/edit`)}
        onEndProgram={() => setEndDialogOpen(true)}
        hasActiveRun={!!activeRun}
      />

      <div className="flex-1 overflow-y-auto pb-28">
        {/* Summary strip */}
        <div className="px-4 pt-4 space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            {program.durationWeeks} weeks
            {desc ? ` · ${desc}` : ""}
            {activeRun
              ? ` · Started ${formatDate(activeRun.startedAt)}`
              : ""}
          </p>

          {activeRun ? (
            <>
              <div className="flex items-center gap-3">
                <div
                  className="flex-1 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${progress}% complete`}
                >
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
                  {progress}% COMPLETION
                </span>
              </div>
              <span className="inline-block rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                Week {currentWeekIndex + 1} of {program.durationWeeks}
              </span>
            </>
          ) : null}

          {/* Start CTA */}
          {!activeRun ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setStartDialogOpen(true)}
                className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Start program
              </button>
            </div>
          ) : null}
        </div>

        {/* Schedule tab (only tab in v1) */}
        <div className="px-4 mt-4">
          <div className="border-b border-[var(--border)] mb-4">
            <button
              type="button"
              className="pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent)] border-b-2 border-[var(--accent)]"
            >
              Schedule
            </button>
          </div>

          <ScheduleGrid
            program={program}
            run={activeRun}
            currentWeekIndex={currentWeekIndex}
            routineNames={routineNames}
            onDayCellMenu={(wi, di) =>
              setDayCellMenuTarget({ weekIndex: wi, dayIndex: di })
            }
          />
        </div>
      </div>

      {/* Fixed footer */}
      <div className="fixed bottom-0 left-1/2 z-10 flex w-full max-w-md -translate-x-1/2 gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
        <Link
          to={`/programs/${program.id}/edit`}
          className="flex-1 rounded-full border border-[var(--border)] py-2.5 text-center text-xs font-bold uppercase tracking-wider text-[var(--text)] hover:border-[var(--accent)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Copy week pattern
        </Link>
        <Link
          to={`/programs/${program.id}/edit`}
          className="flex-1 rounded-full bg-[var(--accent)] py-2.5 text-center text-xs font-bold uppercase tracking-wider text-[var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Edit program
        </Link>
      </div>

      {/* Day cell action menu */}
      {dayCellMenuTarget ? (
        <DayCellMenu
          open={true}
          onClose={() => setDayCellMenuTarget(null)}
          weekIndex={dayCellMenuTarget.weekIndex}
          dayIndex={dayCellMenuTarget.dayIndex}
          isRestDay={
            !!program.days.find(
              (d) =>
                d.weekIndex === dayCellMenuTarget.weekIndex &&
                d.dayIndex === dayCellMenuTarget.dayIndex &&
                d.isRestDay,
            )
          }
          run={activeRun}
          onSkip={(wi, di) =>
            skipDayMutation.mutate({ weekIndex: wi, dayIndex: di })
          }
          onUnskip={(wi, di) =>
            unskipDayMutation.mutate({ weekIndex: wi, dayIndex: di })
          }
        />
      ) : null}

      {/* Start program dialog */}
      <StartProgramDialog
        open={startDialogOpen}
        onOpenChange={setStartDialogOpen}
        onConfirm={(weekZeroStartDate) => startRunMutation.mutate(weekZeroStartDate)}
        pending={startRunMutation.isPending}
      />

      {/* End program dialog */}
      <EndProgramDialog
        open={endDialogOpen}
        onOpenChange={setEndDialogOpen}
        onConfirm={() => endRunMutation.mutate()}
        pending={endRunMutation.isPending}
      />
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function KebabIconVert() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}
