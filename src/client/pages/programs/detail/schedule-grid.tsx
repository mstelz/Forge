import type { Program, ProgramRun } from "../../../../shared";
import { DAY_LABELS, getDayState } from "./schedule-helpers";

// The program schedule grid (week/day cells) for the detail page, extracted from
// detail.tsx (issue 09 follow-up). Prop-driven; day taps are emitted via onDayCellMenu.

export function ScheduleGrid({
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
