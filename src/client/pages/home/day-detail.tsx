import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createSession, setProgramRunDayState } from "../../db/mutations";
import { queryKeys } from "../../db/query-keys";
import { uuidv4 } from "../../lib/uuid";
import { buildLiveStructure } from "../workout/start";
import type { Routine, Session } from "../../../shared";
import type { RoutineItemOverride } from "../../../shared/program";
import type { DayDetail, HomepageCalendarDot } from "../../home/state";

// Day-detail bottom-sheet / popover surface, extracted from home/index.tsx (issue 09).
// Self-contained, prop-driven: DayDetailSurface is the only public entry point.

function DayDetailContent({
  detail,
  onClose,
}: {
  detail: DayDetail;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const dateLabel = new Date(detail.date.y, detail.date.m - 1, detail.date.d).toLocaleDateString(
    "en-US",
    { weekday: "long", month: "short", day: "numeric" },
  );

  const dateQuery = `${detail.date.y}-${String(detail.date.m).padStart(2, "0")}-${String(detail.date.d).padStart(2, "0")}`;

  const handleLogWorkout = useCallback(async (
    routine: Routine,
    programContext: NonNullable<DayDetail["plannedProgramContext"]>,
  ) => {
    const now = Date.now();
    const session: Session = {
      id: uuidv4(),
      status: "in_progress",
      sourceType: "program_day",
      sourceRoutineId: routine.id,
      sourceProgramId: programContext.programId,
      sourceProgramWeekIndex: programContext.weekIndex,
      sourceProgramDayIndex: programContext.dayIndex,
      templateSnapshot: JSON.stringify(routine),
      liveStructure: JSON.stringify(buildLiveStructure(routine, programContext.overrides as RoutineItemOverride[])),
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
    onClose();
    navigate("/workout/active");
  }, [navigate, qc, onClose]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-subtle)]">
          {dateLabel}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <CloseIcon />
        </button>
      </div>

      {detail.session?.status === "in_progress" ? (
        <InProgressDayContent session={detail.session} stats={detail.sessionStats} />
      ) : detail.session?.status === "finished" ? (
        <FinishedDayContent session={detail.session} stats={detail.sessionStats} />
      ) : detail.isRestDay ? (
        <RestDayContent detail={detail} onClose={onClose} />
      ) : detail.plannedRoutine ? (
        <PlannedDayContent
          routine={detail.plannedRoutine}
          exerciseNames={detail.plannedExerciseNames ?? {}}
          programContext={detail.plannedProgramContext}
          isFuture={detail.isFutureDay}
          dateQuery={dateQuery}
          onLogWorkout={handleLogWorkout}
        />
      ) : detail.isFutureDay ? (
        <FutureDayContent />
      ) : (
        <EmptyDayContent dateQuery={dateQuery} />
      )}
    </div>
  );
}

function InProgressDayContent({
  session,
  stats,
}: {
  session: { id: string; title: string | null };
  stats: DayDetail["sessionStats"];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="font-bold text-sm text-[var(--text)]">{session.title ?? "Freeform"}</p>
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[var(--accent)]/20 text-[var(--accent)]">
          In progress
        </span>
      </div>
      {stats ? (
        <p className="text-xs text-[var(--text-muted)] mb-3">
          {stats.exerciseCount} exercises · {stats.setCount} sets
        </p>
      ) : null}
      <Link
        to="/workout/active"
        className="flex w-full items-center justify-center rounded-md bg-[var(--accent)] py-2 text-xs font-bold uppercase tracking-[0.15em] text-[var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        Resume Workout
      </Link>
    </div>
  );
}

function FinishedDayContent({
  session,
  stats,
}: {
  session: { id: string; title: string | null };
  stats: DayDetail["sessionStats"];
}) {
  const dur = stats ? Math.round(stats.durationMs / 60000) : null;
  return (
    <div>
      <p className="font-bold text-sm text-[var(--text)] mb-1">{session.title ?? "Freeform"}</p>
      {stats ? (
        <p className="text-xs text-[var(--text-muted)] mb-3">
          {stats.exerciseCount} exercises · {stats.setCount} sets{dur != null ? ` · ${dur} min` : ""}
        </p>
      ) : null}
      <Link
        to={`/workout/sessions/${session.id}`}
        className="text-xs font-semibold text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        Open session
      </Link>
    </div>
  );
}

function PlannedDayContent({
  routine,
  exerciseNames,
  programContext,
  isFuture,
  dateQuery,
  onLogWorkout,
}: {
  routine: Routine;
  exerciseNames: Record<string, string>;
  programContext: DayDetail["plannedProgramContext"];
  isFuture: boolean;
  dateQuery: string;
  onLogWorkout: (routine: Routine, ctx: NonNullable<DayDetail["plannedProgramContext"]>) => void;
}) {
  return (
    <div>
      <p className="font-bold text-sm text-[var(--text)] mb-1">{routine.name}</p>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        {isFuture ? "Scheduled workout" : "Workout not yet logged"}
      </p>
      <ul className="mb-3 space-y-1 text-xs text-[var(--text-muted)]">
        {routine.blocks.flatMap((b) => b.items).map((item) => (
          <li key={item.id}>{exerciseNames[item.exerciseId] ?? "Exercise"} · {item.setCount} sets</li>
        ))}
      </ul>
      {!isFuture ? (
        programContext ? (
          <button
            type="button"
            onClick={() => onLogWorkout(routine, programContext)}
            className="text-xs font-semibold text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Log this workout
          </button>
        ) : (
          <Link
            to={`/workout/start?date=${dateQuery}`}
            className="text-xs font-semibold text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Log this workout
          </Link>
        )
      ) : null}
    </div>
  );
}

function RestDayContent({ detail, onClose }: { detail: DayDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completed = detail.plannedDayState === "completed";
  const handleComplete = async () => {
    const context = detail.plannedProgramContext;
    if (!context || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setProgramRunDayState(context.runId, context.weekIndex, context.dayIndex, "completed");
      await qc.invalidateQueries({ queryKey: ["homepage", "state"] });
      onClose();
    } catch {
      setError("Could not complete this rest day. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <p className="font-bold text-sm text-[var(--text)] mb-1">{completed ? "Rest day complete" : "Rest day"}</p>
      <p className="text-xs text-[var(--text-muted)]">{completed ? "Rest logged." : "Recover and come back tomorrow."}</p>
      {!detail.isFutureDay && !completed && detail.plannedDayState !== "skipped" && detail.plannedProgramContext ? (
        <button type="button" disabled={saving} onClick={handleComplete} className="mt-3 text-xs font-semibold text-[var(--accent)] hover:underline disabled:opacity-50">
          {saving ? "Saving…" : "Mark complete"}
        </button>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-xs text-[var(--text-muted)]">{error}</p> : null}
    </div>
  );
}

function FutureDayContent() {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">Nothing scheduled.</p>
    </div>
  );
}

function EmptyDayContent({ dateQuery }: { dateQuery: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-2">Nothing scheduled.</p>
      <Link
        to={`/workout/start?date=${dateQuery}`}
        className="text-xs font-semibold text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        Log a freeform workout
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Responsive Day Detail wrapper (popover desktop / sheet mobile)
// ---------------------------------------------------------------------------

export function DayDetailSurface({
  dot,
  anchorRef,
  detail,
  isLoading,
  onClose,
}: {
  dot: HomepageCalendarDot;
  anchorRef: React.RefObject<HTMLElement | null>;
  detail: DayDetail | null;
  isLoading: boolean;
  onClose: () => void;
}) {
  void dot;
  void anchorRef;

  // Use matchMedia to decide popover vs sheet
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Focus trap ref
  const containerRef = useRef<HTMLDivElement>(null);

  // Restore focus on close
  const triggerRef = useRef<Element | null>(null);
  useEffect(() => {
    triggerRef.current = document.activeElement;
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, []);

  // Keyboard handler for focus trap + Esc
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const el = containerRef.current;
      if (!el) return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  const content = (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className="p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Day detail"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : detail ? (
        <DayDetailContent detail={detail} onClose={onClose} />
      ) : null}
    </div>
  );

  if (isDesktop) {
    return (
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="absolute rounded-[var(--radius-card)] bg-[var(--surface)] shadow-2xl ring-1 ring-[var(--border)] w-72"
          style={{
            top: (anchorRef.current?.getBoundingClientRect().bottom ?? 0) + 8,
            left: Math.max(
              8,
              Math.min(
                (anchorRef.current?.getBoundingClientRect().left ?? 0) - 120,
                window.innerWidth - 288 - 8,
              ),
            ),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  // Mobile sheet
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="presentation"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* Sheet */}
      <div
        className="relative rounded-t-[var(--radius-card)] bg-[var(--surface)] ring-1 ring-[var(--border)]"
        style={{ maxHeight: "60dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle visual */}
        <div className="flex justify-center pt-2 pb-0">
          <div className="h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden="true" />
        </div>
        {content}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
