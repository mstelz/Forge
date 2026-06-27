import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { Link, useOutletContext, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SettingsContext } from "../../contexts/settings-context";
import { formatWeight } from "../../lib/units";
import { formatGoalValue } from "../goals/format";
import { reconcileGoals } from "../../goals/reconcile";
import type { AppShellOutletContext } from "../../layouts/app-shell";
import {
  useHomepageState,
  getDayDetail,
  type HomepageCalendarDot,
  type HomepageWeekDot,
  type ActiveRunState,
  type DayDetail,
  type Goal,
} from "../../home/state";
import { createSession, setProgramRunDayState } from "../../db/mutations";
import { useProfiles } from "../../hooks/use-profile";
import { queryKeys } from "../../db/query-keys";
import { uuidv4 } from "../../lib/uuid";
import { buildLiveStructure } from "../workout/start";
import { computeNextPlayableDay } from "../../lib/programs/next-day";
import type { Routine, Session } from "../../../shared";
import { DayDetailSurface } from "./day-detail";

// ---------------------------------------------------------------------------
// Estimated duration helper
// Formula: sum (setCount * ~60s rest) + set count * ~3s per set, per item in blocks
// Only computable when routine has blocks with items.
// ---------------------------------------------------------------------------

function estimateDuration(routine: Routine): { hours: number; minutes: number } | null {
  if (!routine.blocks || routine.blocks.length === 0) return null;
  let totalSec = 0;
  for (const block of routine.blocks) {
    const rounds = block.type === "superset" ? (block.roundCount ?? 1) : 1;
    for (const item of block.items) {
      const sets = block.type === "superset" ? rounds : item.setCount;
      // ~45s per set (work time) + 90s rest per set
      totalSec += sets * (45 + 90);
    }
  }
  if (totalSec === 0) return null;
  const totalMin = Math.round(totalSec / 60);
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
}

function formatDuration(d: { hours: number; minutes: number }): string {
  if (d.hours > 0) return `~${d.hours}h ${d.minutes}m`;
  return `~${d.minutes}m`;
}

// ---------------------------------------------------------------------------
// Rep label helper
// ---------------------------------------------------------------------------

function repLabel(item: Routine["blocks"][number]["items"][number]): string {
  if (item.repMode === "uniform") {
    if (item.uniformReps != null) return `${item.setCount}x ${item.uniformReps}`;
    if (item.uniformRepsMin != null && item.uniformRepsMax != null)
      return `${item.setCount}x ${item.uniformRepsMin}–${item.uniformRepsMax}`;
    if (item.uniformSetType === "amrap") return `${item.setCount}x AMRAP`;
    if (item.uniformSetType === "to_failure") return `${item.setCount}x FAIL`;
    return `${item.setCount}x`;
  }
  return `${item.setCount}x`;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)] ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Top Bar
// ---------------------------------------------------------------------------

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function TopBar({
  openDrawer,
  profile,
}: {
  openDrawer: () => void;
  profile: { name: string; avatarDataUrl: string | null } | null;
}) {
  const initials = profile ? nameInitials(profile.name) : "?";

  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open navigation"
        className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <HamburgerIcon />
      </button>

      <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)]">
        FORGE
      </span>

      <Link
        to="/profile"
        aria-label="View profile"
        className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden bg-[var(--surface)] ring-1 ring-[var(--border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] hover:ring-[var(--accent)] transition-all"
      >
        {profile?.avatarDataUrl ? (
          <img
            src={profile.avatarDataUrl}
            alt={profile.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-bold uppercase text-[var(--accent)]">
            {initials}
          </span>
        )}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily Briefing Strip
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DOW_HEADERS = ["S", "M", "T", "W", "T", "F", "S"] as const;

function DailyBriefingStrip() {
  const today = new Date();
  const dayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(today);
  const dateStr = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(today);

  return (
    <div className="px-4 pb-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)]">
        {dayName}, {dateStr}
      </p>
      <p className="text-lg font-bold text-[var(--text)]">Daily Briefing</p>
    </div>
  );
}

function CalendarCell({ dot, onTap }: { dot: HomepageCalendarDot; onTap: () => void }) {
  const label = new Date(dot.y, dot.m - 1, dot.d).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  return (
    <div className="relative flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onTap}
        aria-label={label}
        className={[
          "flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          dot.isToday
            ? "ring-[1.5px] ring-[var(--accent)] text-[var(--accent)]"
            : "text-[var(--text-muted)] hover:bg-[var(--surface)]",
        ].join(" ")}
      >
        {dot.d}
      </button>
      {/* Under-cell dot: filled = session done; ring = scheduled but not done */}
      {dot.hasFinishedSession ? (
        <div className="h-[3px] w-[3px] rounded-full bg-[var(--accent)]" aria-hidden="true" />
      ) : dot.hasScheduledWorkout ? (
        <div className="h-[3px] w-[3px] rounded-full ring-[1.5px] ring-[var(--accent)] opacity-60" aria-hidden="true" />
      ) : (
        <div className="h-[3px] w-[3px] rounded-full bg-transparent" aria-hidden="true" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primary Today Card
// ---------------------------------------------------------------------------

function TodayCard({
  activeState,
  inProgressSession,
}: {
  activeState: ActiveRunState;
  inProgressSession: NonNullable<ReturnType<typeof useHomepageState>["data"]>["inProgressSession"];
}) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).getTime();
  const sessionIsToday = inProgressSession != null && inProgressSession.startedAt >= todayStart;
  const { routine, exerciseNames, dayStatus, daySessionId, isRestDay, restDaySlot, run } = activeState;

  if (isRestDay) {
    const accentColor = dayStatus === "completed" ? "bg-green-500" : "bg-[var(--text-subtle)]";
    return (
      <div className="mx-4 mb-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] ring-1 ring-[var(--border)]">
        <div className="flex">
          <div className={`w-1 flex-shrink-0 ${accentColor}`} aria-hidden="true" />
          <div className="flex-1 p-4">
            <RestDayVariant dayStatus={dayStatus} runId={run.id} restDaySlot={restDaySlot} />
          </div>
        </div>
      </div>
    );
  }

  if (routine != null && dayStatus === "completed") {
    return (
      <div className="mx-4 mb-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] ring-1 ring-[var(--border)]">
        <div className="flex">
          <div className="w-1 flex-shrink-0 bg-green-500" aria-hidden="true" />
          <div className="flex-1 p-4">
            <CompletedDayVariant routine={routine} sessionId={daySessionId} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] ring-1 ring-[var(--border)]">
      <div className="flex">
        <div className="w-1 flex-shrink-0 bg-[var(--accent)]" aria-hidden="true" />
        <div className="flex-1 p-4">
          {routine != null ? (
            <RoutineVariant routine={routine} exerciseNames={exerciseNames} sessionIsToday={sessionIsToday} inProgressSession={inProgressSession} activeState={activeState} />
          ) : (
            <NoProgramVariant />
          )}
        </div>
      </div>
    </div>
  );
}

function RoutineVariant({
  routine,
  exerciseNames,
  sessionIsToday,
  inProgressSession,
  activeState,
}: {
  routine: Routine;
  exerciseNames: Record<string, string>;
  sessionIsToday: boolean;
  inProgressSession: { id: string } | null;
  activeState: ActiveRunState;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const duration = estimateDuration(routine);

  const handleStartOrResume = async () => {
    if (sessionIsToday && inProgressSession) {
      navigate("/workout/active");
      return;
    }
    const { run, program } = activeState;
    const nextDay = computeNextPlayableDay(program, run);
    if (!nextDay) return;

    const primaryEntry =
      program.days.find(
        (d) => d.weekIndex === nextDay.weekIndex && d.dayIndex === nextDay.dayIndex && (d.order ?? 0) === 0,
      ) ??
      program.days.find(
        (d) => d.weekIndex === nextDay.weekIndex && d.dayIndex === nextDay.dayIndex,
      );
    if (!primaryEntry?.routineId) return;

    const now = Date.now();
    const session: Session = {
      id: uuidv4(),
      status: "in_progress",
      sourceType: "program_day",
      sourceRoutineId: primaryEntry.routineId,
      sourceProgramId: run.programId,
      sourceProgramWeekIndex: nextDay.weekIndex,
      sourceProgramDayIndex: nextDay.dayIndex,
      templateSnapshot: JSON.stringify(routine),
      liveStructure: JSON.stringify(buildLiveStructure(routine, primaryEntry.overrides)),
      restTimer: null,
      title: routine.name,
      notes: null,
      startedAt: now,
      endedAt: null,
      pausedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await createSession(session);
    qc.setQueryData(queryKeys.sessions.active(), session);
    navigate("/workout/active");
  };

  // Gather exercise preview rows (max 6)
  const previewItems = routine.blocks
    .flatMap((b) => b.items)
    .slice(0, 6);

  return (
    <>
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)]">
        Session Priority
      </p>
      <h2 className="text-base font-bold text-[var(--text)]">{routine.name}</h2>
      {duration ? (
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{formatDuration(duration)}</p>
      ) : null}

      {previewItems.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {previewItems.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--text)]">{exerciseNames[item.exerciseId] ?? item.exerciseId}</span>
              <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">
                {repLabel(item)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={handleStartOrResume}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-[var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-opacity"
      >
        <PlayIcon />
        {sessionIsToday && inProgressSession ? "Resume Workout" : "Start Workout"}
      </button>
    </>
  );
}

function RestDayVariant({
  dayStatus,
  runId,
  restDaySlot,
}: {
  dayStatus: ActiveRunState["dayStatus"];
  runId: string;
  restDaySlot: { weekIndex: number; dayIndex: number } | null;
}) {
  const qc = useQueryClient();

  const handleComplete = async () => {
    if (!restDaySlot) return;
    await setProgramRunDayState(runId, restDaySlot.weekIndex, restDaySlot.dayIndex, "completed");
    qc.invalidateQueries({ queryKey: ["homepage", "state"] });
  };

  const handleSkip = async () => {
    if (!restDaySlot) return;
    await setProgramRunDayState(runId, restDaySlot.weekIndex, restDaySlot.dayIndex, "skipped");
    qc.invalidateQueries({ queryKey: ["homepage", "state"] });
  };

  if (dayStatus === "completed") {
    return (
      <>
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-green-500">
          Rest Day Complete
        </p>
        <h2 className="text-base font-bold text-[var(--text)]">Recovery Day</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Rest logged. Come back strong tomorrow.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)]">
        Rest Day
      </p>
      <h2 className="text-base font-bold text-[var(--text)]">Recovery Day</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Scheduled rest. Recovery is part of training.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleComplete}
          className="flex w-full items-center justify-center rounded-md bg-[var(--accent)] py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-[var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-opacity"
        >
          Mark Rest Complete
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="flex w-full items-center justify-center rounded-md border border-[var(--border)] py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
        >
          Skip Rest / Work Out Instead
        </button>
      </div>
    </>
  );
}

function NoProgramVariant() {
  return (
    <>
      <h2 className="text-base font-bold text-[var(--text)]">No workout scheduled</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Follow a program for structured training, or jump straight into a freeform session.
      </p>
      <Link
        to="/programs"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-[var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-opacity"
      >
        Browse Programs
      </Link>
      <Link
        to="/workout/start"
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
      >
        Start Freeform Workout
      </Link>
    </>
  );
}

function CompletedDayVariant({
  routine,
  sessionId,
}: {
  routine: Routine;
  sessionId: string | null;
}) {
  return (
    <>
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-green-500">
        Completed Today
      </p>
      <h2 className="text-base font-bold text-[var(--text)]">{routine.name}</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Great work — today's session is done.
      </p>
      {sessionId ? (
        <Link
          to={`/workout/sessions/${sessionId}`}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-green-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        >
          View session
        </Link>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Program Strip (hidden when no active program)
// ---------------------------------------------------------------------------

function ProgramStrip({ weekDots }: { weekDots: HomepageWeekDot[] }) {
  // All dots empty = no active program
  const allEmpty = weekDots.every((d) => d.state === "empty");
  if (allEmpty) return null;

  return (
    <Link
      to="/programs"
      className="mx-4 mb-3 flex items-center justify-between rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      aria-label="Active program"
    >
      <p className="text-xs font-semibold text-[var(--text-muted)]">Program</p>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {weekDots.map((dot) => (
          <WeekDot key={dot.index} dot={dot} />
        ))}
      </div>
    </Link>
  );
}

function WeekDot({ dot }: { dot: HomepageWeekDot }) {
  const base = "h-2.5 w-2.5 rounded-full transition-all";
  if (dot.state === "done") {
    return <span className={`${base} bg-[var(--accent)]`} />;
  }
  if (dot.state === "today_active") {
    return <span className={`${base} animate-pulse-amber ring-2 ring-[var(--accent)]`} />;
  }
  if (dot.state === "today_idle") {
    return <span className={`${base} ring-2 ring-[var(--accent)]`} />;
  }
  if (dot.state === "planned") {
    return <span className={`${base} bg-[var(--text-subtle)]`} />;
  }
  if (dot.state === "rest") {
    return <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-subtle)] opacity-40" />;
  }
  if (dot.state === "skipped") {
    return (
      <span className={`${base} relative bg-[var(--text-subtle)] opacity-60`}>
        <span className="absolute inset-0 flex items-center justify-center text-[6px] font-bold text-white">
          /
        </span>
      </span>
    );
  }
  // empty
  return <span className={`${base} bg-transparent ring-1 ring-[var(--border)]`} />;
}

// ---------------------------------------------------------------------------
// Mini Calendar (standalone interactive version)
// ---------------------------------------------------------------------------

function MiniCalendar({
  calendarDots,
  onDayTap,
}: {
  calendarDots: HomepageCalendarDot[];
  onDayTap: (dot: HomepageCalendarDot) => void;
}) {
  return (
    <div className="mx-4 mb-3 rounded-[var(--radius-card)] bg-[var(--surface)] px-4 pt-3 pb-4 ring-1 ring-[var(--border)]">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)]">
        This Week
      </p>
      <div className="grid grid-cols-7 gap-1">
        {DOW_HEADERS.map((h, i) => (
          <div key={i} className="text-center text-[9px] font-semibold uppercase text-[var(--text-subtle)]">
            {h}
          </div>
        ))}
        {calendarDots.map((dot, i) => (
          <CalendarCell key={i} dot={dot} onTap={() => onDayTap(dot)} />
        ))}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Goals Section
// ---------------------------------------------------------------------------

function GoalsSection({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) return null;

  return (
    <div className="mx-4 mb-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">
        Priority Objectives
      </p>
      <div className="space-y-2">
        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} />
        ))}
      </div>
    </div>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const progress = Math.round(goal.percent * 100);
  const currentDisplay = formatGoalValue(goal.currentValue, goal.unit);
  const targetDisplay = formatGoalValue(goal.targetValue, goal.unit);
  const unitLabel = goal.unit && goal.unit !== "mm:ss" ? goal.unit : null;

  const countdown = (() => {
    if (!goal.deadline) return null;
    const now = Date.now();
    const diff = goal.deadline - now;
    if (diff < 0) return "OVERDUE";
    if (goal.status === "completed") return "COMPLETED";
    const weeks = Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
    return `${weeks} week${weeks !== 1 ? "s" : ""} left`;
  })();

  return (
    <Link
      to={`/goals/${goal.id}`}
      className="block rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--border)] hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--text-subtle)] bg-[var(--surface-elevated)] rounded px-1.5 py-0.5">
            {goal.category}
          </span>
          <p className="mt-1 text-sm font-bold text-[var(--text)]">{goal.title}</p>
        </div>
        <p className="text-xl font-bold tabular-nums text-[var(--text)] flex-shrink-0">
          {currentDisplay}
          {goal.targetValue != null ? (
            <span className="text-sm font-semibold text-[var(--text-muted)]"> / {targetDisplay}</span>
          ) : null}
          {unitLabel ? <span className="text-xs font-normal text-[var(--text-muted)] ml-0.5">{unitLabel}</span> : null}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-1">
        <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-end mt-0.5">
          <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">{progress}%</span>
        </div>
      </div>

      {countdown ? (
        <p className={[
          "text-[10px] font-semibold uppercase tracking-wide",
          countdown === "OVERDUE" ? "text-red-400" : "text-[var(--text-subtle)]",
        ].join(" ")}>
          {countdown}
        </p>
      ) : null}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Quick Stats Row
// ---------------------------------------------------------------------------

function QuickStatsRow({
  workouts,
  volumeKg,
  streakWeeks,
}: {
  workouts: number;
  volumeKg: number;
  streakWeeks: number;
}) {
  const { weightUnit } = useContext(SettingsContext);
  const formatted = formatWeight(volumeKg, weightUnit).split(" ");
  const volValue = formatted[0] ?? "0";
  const volUnit = formatted[1] ?? weightUnit;
  return (
    <div className="mx-4 mb-3 grid grid-cols-3 gap-2">
      <StatTile label="This Week" value={String(workouts)} unit="workouts" />
      <StatTile label="Volume" value={volValue} unit={volUnit} />
      <StatTile label="Streak" value={String(streakWeeks)} unit="wk" />
    </div>
  );
}

function StatTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] bg-[var(--surface)] px-2 py-3 ring-1 ring-[var(--border)] text-center">
      <p className="text-[28px] font-bold leading-none tabular-nums text-[var(--text)]">
        {value}
      </p>
      <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)]">
        {label} · {unit}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error Banner
// ---------------------------------------------------------------------------

function ErrorBanner() {
  return (
    <div className="mx-4 mb-3 rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-3 ring-1 ring-red-500/30">
      <p className="text-xs text-[var(--text-muted)]">
        Couldn't load latest data — try refreshing.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function HomeSkeleton() {
  return (
    <div className="space-y-3 px-4 pb-8" aria-hidden="true">
      <Skeleton className="h-40" />
      <Skeleton className="h-12" />
      <Skeleton className="h-28" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Homepage Page
// ---------------------------------------------------------------------------

export function HomePage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const { data, isLoading } = useHomepageState();
  const { data: profiles } = useProfiles();
  const profile = profiles?.[0] ?? null;

  const [selectedDot, setSelectedDot] = useState<HomepageCalendarDot | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isLoading) return;
    reconcileGoals("home").catch(() => undefined);
  }, [isLoading, data]);

  const handleDayTap = useCallback(async (dot: HomepageCalendarDot) => {
    setSelectedDot(dot);
    setDayDetailLoading(true);
    setDayDetail(null);
    try {
      const detail = await getDayDetail({ y: dot.y, m: dot.m, d: dot.d });
      setDayDetail(detail);
    } catch {
      setDayDetail({
        date: { y: dot.y, m: dot.m, d: dot.d },
        plannedRoutine: null,
        plannedDayState: null,
        plannedProgramContext: null,
        session: null,
        sessionStats: null,
        isRestDay: false,
        isFutureDay: false,
      });
    } finally {
      setDayDetailLoading(false);
    }
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedDot(null);
    setDayDetail(null);
  }, []);

  // Keyboard dismiss for day detail
  useEffect(() => {
    if (!selectedDot) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseDetail();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDot, handleCloseDetail]);

  const hasError = !isLoading && data === undefined;

  return (
    <>
      <TopBar openDrawer={openDrawer} profile={profile} />

      {hasError ? <ErrorBanner /> : null}

      {isLoading ? (
        <HomeSkeleton />
      ) : data ? (
        <main className="flex-1 pb-8">
          {/* Daily Briefing Strip */}
          <DailyBriefingStrip />

          {/* Program today cards — one per active run, or no-program fallback */}
          {data.activeRunStates.length > 0 ? (
            data.activeRunStates.map((activeState) => (
              <TodayCard
                key={activeState.run.id}
                activeState={activeState}
                inProgressSession={data.inProgressSession}
              />
            ))
          ) : (
            <div className="mx-4 mb-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] ring-1 ring-[var(--border)]">
              <div className="flex">
                <div className="w-1 flex-shrink-0 bg-[var(--accent)]" aria-hidden="true" />
                <div className="flex-1 p-4">
                  <NoProgramVariant />
                </div>
              </div>
            </div>
          )}

          {/* Mini Calendar (interactive) */}
          <MiniCalendar calendarDots={data.calendarDots} onDayTap={handleDayTap} />

          {/* Goals */}
          <GoalsSection goals={data.topGoals} />

          {/* Quick Stats */}
          <QuickStatsRow
            workouts={data.weeklyStats.workouts}
            volumeKg={data.weeklyStats.volumeKg}
            streakWeeks={data.weeklyStats.streakWeeks}
          />
        </main>
      ) : null}

      {/* Day Detail Surface */}
      {selectedDot != null ? (
        <DayDetailSurface
          dot={selectedDot}
          anchorRef={anchorRef}
          detail={dayDetail}
          isLoading={dayDetailLoading}
          onClose={handleCloseDetail}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
