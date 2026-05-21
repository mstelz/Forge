import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router";
import { useSession, useSessionLogs, useAllSessionLogs } from "../../hooks/use-sessions";
import { summarizeSession } from "../../lib/session/summary";
import { forgeDB } from "../../db/forge-db";
import type { SessionSetLog } from "../../../shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${weekday}, ${month} ${day} ${year}`;
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
  return kg % 1 === 0 ? String(kg) : kg.toFixed(1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: session, isLoading: sessionLoading } = useSession(id);
  const { data: logs } = useSessionLogs(id);
  const { data: allSessionLogs } = useAllSessionLogs();

  const exerciseNamesRef = useRef<Map<string, string>>(new Map());
  const [, setNamesVersion] = useState(0);

  useEffect(() => {
    if (!session) return;
    let ls: { blocks: Array<{ items: Array<{ exerciseId: string }> }> } | null = null;
    try { ls = JSON.parse(session.liveStructure); } catch { /* ignore */ }
    if (!ls) return;
    const ids: string[] = [];
    for (const block of ls.blocks) {
      for (const item of block.items) {
        if (item.exerciseId && !exerciseNamesRef.current.has(item.exerciseId)) {
          ids.push(item.exerciseId);
        }
      }
    }
    if (ids.length === 0) return;
    Promise.all(ids.map((eid) => forgeDB.exercises.get(eid).then((ex) => [eid, ex?.name ?? null] as const)))
      .then((pairs) => {
        let changed = false;
        for (const [eid, name] of pairs) {
          if (name) { exerciseNamesRef.current.set(eid, name); changed = true; }
        }
        if (changed) setNamesVersion((v) => v + 1);
      });
  }, [session]);

  if (sessionLoading) {
    return <DetailSkeleton />;
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
        <p className="text-base font-semibold text-[var(--text)]">Session not found</p>
        <Link to="/history" className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">
          Back to history
        </Link>
      </div>
    );
  }

  const allLogs = logs ?? [];
  const durationMs = session.endedAt != null ? session.endedAt - session.startedAt : 0;

  const priorLogs = (allSessionLogs ?? []).filter((l) => l.sessionId !== session.id);
  const { totalVolumeKg: volumeKg, totalLoggedSets: setCount, prCount } = summarizeSession(
    session,
    allLogs,
    priorLogs,
  );

  // Group logs by sessionItemId
  const itemGroups = new Map<string, SessionSetLog[]>();
  const itemOrder: string[] = [];
  for (const log of allLogs) {
    if (!itemGroups.has(log.sessionItemId)) {
      itemGroups.set(log.sessionItemId, []);
      itemOrder.push(log.sessionItemId);
    }
    itemGroups.get(log.sessionItemId)!.push(log);
  }

  // Parse live structure to get exercise names mapping
  let liveStructure: {
    blocks: Array<{
      type: string;
      items: Array<{
        sessionItemId: string;
        exerciseId: string;
        performedExerciseId: string;
      }>;
    }>;
  } | null = null;
  try {
    liveStructure = JSON.parse(session.liveStructure);
  } catch {
    // ignore
  }

  const sessionItemToExerciseId = new Map<string, string>();
  const sessionItemToBlockType = new Map<string, string>();
  const sessionItemToBlockIndex = new Map<string, number>();

  if (liveStructure) {
    for (const block of liveStructure.blocks) {
      for (const item of block.items) {
        sessionItemToExerciseId.set(item.sessionItemId, item.exerciseId);
        sessionItemToBlockType.set(item.sessionItemId, block.type);
        sessionItemToBlockIndex.set(item.sessionItemId, liveStructure.blocks.indexOf(block));
      }
    }
  } else {
    // Fall back to logs
    for (const log of allLogs) {
      sessionItemToExerciseId.set(log.sessionItemId, log.exerciseId);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <Link
          to="/history"
          aria-label="Back to history"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <BackIcon />
        </Link>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Workout Summary
        </h1>
        <button
          type="button"
          aria-label="Share"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ShareIcon />
        </button>
      </header>

      <main className="flex-1 px-4 pb-24 pt-2 space-y-4">
        {/* Session title + date */}
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)]">
            {session.title ?? "Freeform Session"}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {formatDate(session.startedAt)}
            {session.endedAt != null ? ` · ${formatDuration(durationMs)}` : ""}
          </p>
        </div>

        {/* Metric tiles */}
        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="Volume" value={`${formatVolume(volumeKg)} kg`} />
          <MetricTile label="Sets" value={String(setCount)} />
          <MetricTile label="PRs" value={String(prCount)} />
        </div>

        {/* Per-exercise blocks */}
        {itemOrder.map((sessionItemId, idx) => {
          const itemLogs = itemGroups.get(sessionItemId)!;
          const exerciseId = sessionItemToExerciseId.get(sessionItemId) ?? "";
          const blockType = sessionItemToBlockType.get(sessionItemId) ?? "single";
          const isSuperset = blockType === "superset";

          // Superset counter within same block index
          let supersetNum: number | null = null;
          if (isSuperset) {
            const blockIdx = sessionItemToBlockIndex.get(sessionItemId) ?? 0;
            const priorSupersetItems = itemOrder
              .slice(0, idx)
              .filter((sid) => sessionItemToBlockIndex.get(sid) === blockIdx);
            supersetNum = priorSupersetItems.length + 1;
          }

          const displayName = exerciseNamesRef.current.get(exerciseId) ?? "Unknown exercise";

          return (
            <ExerciseBlock
              key={sessionItemId}
              logs={itemLogs}
              exerciseId={exerciseId}
              exerciseName={displayName}
              isSuperset={isSuperset}
              supersetNum={supersetNum}
            />
          );
        })}

        {/* Notes */}
        {session.notes ? (
          <div className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Notes
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)] whitespace-pre-wrap">
              {session.notes}
            </p>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <div className="sticky bottom-0 bg-[var(--bg)] border-t border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={() => navigate("/history")}
          className="w-full rounded-[var(--radius-card)] bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Done
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--surface)] p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}

function ExerciseBlock({
  logs,
  exerciseName,
  isSuperset,
  supersetNum,
}: {
  logs: SessionSetLog[];
  exerciseId: string;
  exerciseName: string;
  isSuperset: boolean;
  supersetNum: number | null;
}) {
  const sorted = [...logs].sort((a, b) => a.order - b.order);

  return (
    <div
      className={[
        "rounded-[var(--radius-card)] bg-[var(--surface)] overflow-hidden",
        isSuperset ? "border-l-2 border-[var(--accent)]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isSuperset && supersetNum === 1 ? (
        <div className="px-4 pt-3 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Superset
          </span>
        </div>
      ) : null}
      <div className="px-4 py-3">
        <p className="text-sm font-bold text-[var(--text)]">{exerciseName}</p>
        <ul className="mt-2 space-y-1">
          {sorted.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function LogRow({ log }: { log: SessionSetLog }) {
  const isSkipped = log.status === "skipped";
  const isExtra = log.status === "extra";

  return (
    <li className="flex items-center gap-2">
      {isSkipped ? (
        <span className="text-[var(--text-subtle)] w-4 text-center text-xs">—</span>
      ) : (
        <span className="text-[var(--accent)] w-4 text-center text-xs">✓</span>
      )}
      <span
        className={[
          "text-sm",
          isSkipped ? "text-[var(--text-subtle)] line-through" : "text-[var(--text)]",
        ].join(" ")}
      >
        {log.weightKg != null && log.reps != null
          ? `${log.weightKg} kg × ${log.reps}`
          : log.reps != null
          ? `${log.reps} reps`
          : "—"}
      </span>
      {isExtra ? (
        <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-[var(--accent)]/20 text-[var(--accent)]">
          Extra
        </span>
      ) : null}
    </li>
  );
}

function DetailSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-3">
      <div className="h-5 w-24 animate-pulse rounded bg-[var(--surface)]" />
      <div className="h-8 w-2/3 animate-pulse rounded bg-[var(--surface)]" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--surface)]" />
      <div className="grid grid-cols-3 gap-2 mt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" />
        ))}
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  );
}
