import { useNavigate, useOutletContext, Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRoutines } from "../../hooks/use-routines";
import { useSessions, useActiveSession } from "../../hooks/use-sessions";
import { createSession, deleteSession } from "../../db/mutations";
import { queryKeys } from "../../db/query-keys";
import { uuidv4 } from "../../lib/uuid";
import type { AppShellOutletContext } from "../../layouts/app-shell";
import type { Routine, RoutineBlock, RoutineItem, Session } from "../../../shared";

// ---------------------------------------------------------------------------
// Live structure builder
// ---------------------------------------------------------------------------

interface PlannedSlot {
  id: string;
  order: number;
  reps?: number;
  repsMin?: number;
  repsMax?: number;
  rpe?: number;
  setType?: string;
}

interface LiveItem {
  performedExerciseId: string;
  sessionItemId: string;
  exerciseId: string;
  setCount: number;
  uniformReps?: number;
  uniformRpe?: number;
  restSec?: number;
  notes?: string;
  setTargets: PlannedSlot[];
}

interface LiveBlock {
  id: string;
  type: RoutineBlock["type"];
  roundCount?: number;
  restSec?: number;
  items: LiveItem[];
}

interface LiveStructure {
  blocks: LiveBlock[];
}

function buildLiveStructure(routine: Routine): LiveStructure {
  const blocks: LiveBlock[] = routine.blocks.map((block) => {
    const items: LiveItem[] = block.items.map((item: RoutineItem) => {
      const setTargets: PlannedSlot[] = Array.from({ length: item.setCount }, (_, i) => {
        const perSet = item.setTargets?.[i];
        return {
          id: perSet?.id ?? uuidv4(),
          order: i,
          reps: item.repMode === "uniform" ? (item.uniformReps ?? undefined) : (perSet?.reps ?? undefined),
          repsMin: item.repMode === "uniform" ? (item.uniformRepsMin ?? undefined) : (perSet?.repsMin ?? undefined),
          repsMax: item.repMode === "uniform" ? (item.uniformRepsMax ?? undefined) : (perSet?.repsMax ?? undefined),
          rpe: item.rpeMode === "uniform" ? (item.uniformRpe ?? undefined) : (perSet?.rpe ?? undefined),
          setType: item.setTypeMode === "uniform" ? (item.uniformSetType ?? "normal") : (perSet?.setType ?? "normal"),
        };
      });
      return {
        performedExerciseId: uuidv4(),
        sessionItemId: uuidv4(),
        exerciseId: item.exerciseId,
        setCount: item.setCount,
        uniformReps: item.uniformReps ?? undefined,
        uniformRpe: item.uniformRpe ?? undefined,
        notes: item.notes ?? undefined,
        setTargets,
      };
    });
    return {
      id: uuidv4(),
      type: block.type,
      roundCount: block.roundCount ?? undefined,
      restSec: block.restSec ?? undefined,
      items,
    };
  });
  return { blocks };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function WorkoutStartPage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: routines } = useRoutines();
  const { data: sessions } = useSessions();
  const { data: activeSession, refetch: refetchActive } = useActiveSession();

  // Build a map: routineId → most recent finished session endedAt
  const lastSessionByRoutine = new Map<string, number>();
  for (const s of sessions ?? []) {
    if (s.status === "finished" && s.sourceRoutineId && s.endedAt != null) {
      const prev = lastSessionByRoutine.get(s.sourceRoutineId) ?? 0;
      if (s.endedAt > prev) lastSessionByRoutine.set(s.sourceRoutineId, s.endedAt);
    }
  }

  // Sort routines by most recently used
  const sortedRoutines = [...(routines ?? [])].sort((a, b) => {
    const aLast = lastSessionByRoutine.get(a.id) ?? 0;
    const bLast = lastSessionByRoutine.get(b.id) ?? 0;
    return bLast - aLast;
  });

  const handleStartRoutine = async (routine: Routine) => {
    const now = Date.now();
    const session: Session = {
      id: uuidv4(),
      status: "in_progress",
      sourceType: "routine",
      sourceRoutineId: routine.id,
      sourceProgramId: null,
      sourceProgramWeekIndex: null,
      sourceProgramDayIndex: null,
      templateSnapshot: JSON.stringify(routine),
      liveStructure: JSON.stringify(buildLiveStructure(routine)),
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

  const handleStartFreeform = async () => {
    const now = Date.now();
    const session: Session = {
      id: uuidv4(),
      status: "in_progress",
      sourceType: "freeform",
      sourceRoutineId: null,
      sourceProgramId: null,
      sourceProgramWeekIndex: null,
      sourceProgramDayIndex: null,
      templateSnapshot: null,
      liveStructure: JSON.stringify({ blocks: [] }),
      restTimer: null,
      title: null,
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

  const handleDiscard = async () => {
    if (!activeSession) return;
    await deleteSession(activeSession.id);
    await refetchActive();
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={openDrawer}
          aria-label="Open navigation"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <HamburgerIcon />
        </button>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Start Workout
        </h1>
        <span className="w-9" aria-hidden="true" />
      </header>

      <main className="flex-1 px-4 pb-8 pt-2 space-y-4">
        {/* In-progress session banner */}
        {activeSession ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
            <p className="text-sm font-semibold text-[var(--accent)]">
              You have a workout in progress
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/workout/active")}
                className="flex-1 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                className="flex-1 rounded-md bg-[var(--surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}

        {/* Recent Routines */}
        {sortedRoutines.length > 0 ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">
              Recent Routines
            </h2>
            <ul className="rounded-[var(--radius-card)] bg-[var(--surface)] divide-y divide-[var(--border)] overflow-hidden">
              {sortedRoutines.map((routine) => {
                const lastTs = lastSessionByRoutine.get(routine.id);
                const subtitle = lastTs ? daysAgo(lastTs) : "Never";
                return (
                  <li key={routine.id}>
                    <button
                      type="button"
                      onClick={() => handleStartRoutine(routine)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">
                          {routine.name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
                      </div>
                      <ChevronRightIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Freeform session */}
        <div className="rounded-[var(--radius-card)] bg-[var(--surface)] overflow-hidden">
          <button
            type="button"
            onClick={handleStartFreeform}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[var(--accent)]">
              <LightningIcon />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">
                Freeform session
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Start without a routine — add exercises as you go
              </p>
            </div>
            <ChevronRightIcon />
          </button>
        </div>

        {/* All Routines link */}
        <div className="text-center">
          <Link
            to="/routines"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            All Routines &rsaquo;
          </Link>
        </div>
      </main>
    </>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--text-subtle)]">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
