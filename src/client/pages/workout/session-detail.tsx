import { useState, useEffect, useRef, useContext } from "react";
import { useNavigate, useParams, Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, useSessionLogs, useAllSessionLogs } from "../../hooks/use-sessions";
import { summarizeSession } from "../../lib/session/summary";
import { forgeDB } from "../../db/forge-db";
import { SettingsContext } from "../../contexts/settings-context";
import { formatWeight, formatDistance } from "../../lib/units";
import { reopenSession, updateSessionTimes, deleteSession } from "../../db/mutations";
import { reconcileProgramRuns } from "../../sync/program-run-reconciler";
import { queryKeys } from "../../db/query-keys";
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

function toDatetimeLocal(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): number {
  return new Date(s).getTime();
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
  return kg % 1 === 0 ? String(kg) : kg.toFixed(1);
}

function formatSecs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { weightUnit, distanceUnit } = useContext(SettingsContext);
  const { data: session, isLoading: sessionLoading } = useSession(id);
  const { data: logs } = useSessionLogs(id);
  const { data: allSessionLogs } = useAllSessionLogs();
  const [reopening, setReopening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingTimes, setEditingTimes] = useState(false);
  const [editStartedAt, setEditStartedAt] = useState("");
  const [editEndedAt, setEditEndedAt] = useState("");
  const [savingTimes, setSavingTimes] = useState(false);

  const exerciseNamesRef = useRef<Map<string, string>>(new Map());
  const exerciseTypesRef = useRef<Map<string, string>>(new Map());
  const [, setNamesVersion] = useState(0);

  useEffect(() => {
    if (!session) return;
    let ls: { blocks: Array<{ items: Array<{ exerciseId: string }> }> } | null = null;
    try { ls = JSON.parse(session.liveStructure); } catch { /* ignore */ }
    const ids: string[] = [];
    if (ls) {
      for (const block of ls.blocks) {
        for (const item of block.items) {
          if (item.exerciseId && !exerciseNamesRef.current.has(item.exerciseId)) {
            ids.push(item.exerciseId);
          }
        }
      }
    }
    // Also collect exercise IDs from all logs (for orphan detection)
    for (const log of logs ?? []) {
      if (log.exerciseId && !exerciseNamesRef.current.has(log.exerciseId)) {
        ids.push(log.exerciseId);
      }
    }
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    Promise.all(uniqueIds.map((eid) => forgeDB.exercises.get(eid).then((ex) => [eid, ex?.name ?? null, ex?.type ?? null] as const)))
      .then((pairs) => {
        let changed = false;
        for (const [eid, name, type] of pairs) {
          if (name) { exerciseNamesRef.current.set(eid, name); changed = true; }
          if (type) { exerciseTypesRef.current.set(eid, type); changed = true; }
        }
        if (changed) setNamesVersion((v) => v + 1);
      });
  }, [session, logs]);

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
  // Set of sessionItemIds that are in the current liveStructure
  const liveSessionItemIds = new Set<string>();

  if (liveStructure) {
    for (const block of liveStructure.blocks) {
      for (const item of block.items) {
        sessionItemToExerciseId.set(item.sessionItemId, item.exerciseId);
        sessionItemToBlockType.set(item.sessionItemId, block.type);
        sessionItemToBlockIndex.set(item.sessionItemId, liveStructure.blocks.indexOf(block));
        liveSessionItemIds.add(item.sessionItemId);
      }
    }
  } else {
    // Fall back to logs — treat all as live
    for (const log of allLogs) {
      sessionItemToExerciseId.set(log.sessionItemId, log.exerciseId);
      liveSessionItemIds.add(log.sessionItemId);
    }
  }

  // Orphan logs: logs whose sessionItemId is not in liveStructure
  const orphanLogs = allLogs.filter((log) => !liveSessionItemIds.has(log.sessionItemId));

  // Group orphan logs by performedExerciseId
  const orphanGroupMap = new Map<string, SessionSetLog[]>();
  for (const log of orphanLogs) {
    const key = log.performedExerciseId;
    if (!orphanGroupMap.has(key)) orphanGroupMap.set(key, []);
    orphanGroupMap.get(key)!.push(log);
  }
  const orphanGroups = Array.from(orphanGroupMap.entries());

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
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Delete workout"
            title="Delete workout"
            disabled={deleting || reopening}
            onClick={() => setDeleteConfirmOpen(true)}
            className="rounded-md p-2 text-[var(--text-muted)] hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-40"
          >
            <TrashIcon />
          </button>
          <button
            type="button"
            aria-label="Edit workout"
            title="Edit workout"
            disabled={reopening || deleting}
            onClick={async () => {
              if (reopening || !session) return;
              const existing = await forgeDB.sessions.where("status").equals("in_progress").first().catch(() => null);
              if (existing) {
                alert("Another workout is already in progress. Finish or discard it first.");
                return;
              }
              setReopening(true);
              try {
                const reopened = await reopenSession(session.id);
                qc.setQueryData(queryKeys.sessions.active(), reopened);
                navigate("/workout/active", {
                  state: {
                    isReopenEdit: true,
                    originalEndedAt: session.endedAt,
                    originalStartedAt: session.startedAt,
                  },
                });
              } finally {
                setReopening(false);
              }
            }}
            className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-40"
          >
            {reopening ? <SpinnerIcon /> : <EditIcon />}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-2 space-y-4">
        {/* Session title + date */}
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)]">
            {session.title ?? "Freeform Session"}
          </h2>
          {editingTimes ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Start
                </label>
                <input
                  type="datetime-local"
                  value={editStartedAt}
                  onChange={(e) => setEditStartedAt(e.target.value)}
                  className="rounded-lg bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                />
              </div>
              {session.endedAt != null && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    End
                  </label>
                  <input
                    type="datetime-local"
                    value={editEndedAt}
                    onChange={(e) => setEditEndedAt(e.target.value)}
                    className="rounded-lg bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingTimes}
                  onClick={async () => {
                    if (!editStartedAt) return;
                    setSavingTimes(true);
                    try {
                      const newStart = fromDatetimeLocal(editStartedAt);
                      const newEnd = session.endedAt != null && editEndedAt
                        ? fromDatetimeLocal(editEndedAt)
                        : session.endedAt;
                      await updateSessionTimes(session.id, newStart, newEnd);
                      qc.invalidateQueries({ queryKey: queryKeys.sessions.byId(session.id) });
                      qc.invalidateQueries({ queryKey: queryKeys.sessions.list() });
                      setEditingTimes(false);
                    } finally {
                      setSavingTimes(false);
                    }
                  }}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] disabled:opacity-40"
                >
                  {savingTimes ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTimes(false)}
                  className="rounded-lg bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditStartedAt(toDatetimeLocal(session.startedAt));
                setEditEndedAt(session.endedAt != null ? toDatetimeLocal(session.endedAt) : "");
                setEditingTimes(true);
              }}
              className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <span>
                {formatDate(session.startedAt)}
                {session.endedAt != null ? ` · ${formatDuration(durationMs)}` : ""}
              </span>
              <ClockEditIcon />
            </button>
          )}
        </div>

        {/* Metric tiles */}
        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="Volume" value={formatWeight(volumeKg, weightUnit)} />
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
          const exerciseType = exerciseTypesRef.current.get(exerciseId) ?? "strength";

          const blockIdx = sessionItemToBlockIndex.get(sessionItemId) ?? 0;

          return (
            <ExerciseBlock
              key={sessionItemId}
              logs={itemLogs}
              exerciseId={exerciseId}
              exerciseName={displayName}
              exerciseType={exerciseType}
              isSuperset={isSuperset}
              supersetNum={supersetNum}
              blockIndex={blockIdx}
            />
          );
        })}

        {/* Previous attempts (orphaned logs from structural edits) */}
        {orphanGroups.length > 0 ? (
          <details className="rounded-[var(--radius-card)] bg-[var(--surface)] overflow-hidden group">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--text-muted)] select-none list-none [&::-webkit-details-marker]:hidden">
              <span>Previous attempt</span>
              <span className="text-xs text-[var(--text-subtle)] transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="px-4 pb-4 space-y-3">
              {orphanGroups.map(([performedExerciseId, oLogs]) => {
                const eid = oLogs[0]?.exerciseId ?? "";
                const name = exerciseNamesRef.current.get(eid) ?? "Unknown exercise";
                const exType = exerciseTypesRef.current.get(eid) ?? "strength";
                return (
                  <ExerciseBlock
                    key={performedExerciseId}
                    logs={oLogs}
                    exerciseId={eid}
                    exerciseName={name}
                    exerciseType={exType}
                    isSuperset={false}
                    supersetNum={null}
                    blockIndex={0}
                  />
                );
              })}
            </div>
          </details>
        ) : null}

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

      {/* Delete confirm sheet */}
      {deleteConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setDeleteConfirmOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-t-[var(--radius-card)] bg-[var(--surface)] p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-[var(--text)]">Delete this workout?</p>
            <p className="text-sm text-[var(--text-muted)]">This can't be undone.</p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await deleteSession(session.id);
                    if (session.sourceType === "program_day") {
                      reconcileProgramRuns().catch(console.error);
                    }
                    qc.invalidateQueries({ queryKey: queryKeys.sessions.list() });
                    navigate("/history", { replace: true });
                  } finally {
                    setDeleting(false);
                    setDeleteConfirmOpen(false);
                  }
                }}
                className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 rounded-full bg-[var(--surface-elevated)] py-2.5 text-sm font-semibold text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

const SUPERSET_COLORS = [
  { border: "border-amber-400", text: "text-amber-400" },
  { border: "border-sky-400", text: "text-sky-400" },
  { border: "border-emerald-400", text: "text-emerald-400" },
  { border: "border-violet-400", text: "text-violet-400" },
  { border: "border-rose-400", text: "text-rose-400" },
] as const;

function ExerciseBlock({
  logs,
  exerciseName,
  exerciseType,
  isSuperset,
  supersetNum,
  blockIndex,
}: {
  logs: SessionSetLog[];
  exerciseId: string;
  exerciseName: string;
  exerciseType: string;
  isSuperset: boolean;
  supersetNum: number | null;
  blockIndex: number;
}) {
  const sorted = [...logs].sort((a, b) => a.order - b.order);
  const supersetColor = SUPERSET_COLORS[blockIndex % SUPERSET_COLORS.length]!;

  return (
    <div
      className={[
        "rounded-[var(--radius-card)] bg-[var(--surface)] overflow-hidden",
        isSuperset ? `border-l-4 ${supersetColor.border}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isSuperset && supersetNum === 1 ? (
        <div className="px-4 pt-3 pb-1">
          <span className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${supersetColor.text}`}>
            Superset
          </span>
        </div>
      ) : null}
      <div className="px-4 py-3">
        <p className="text-sm font-bold text-[var(--text)]">{exerciseName}</p>
        <ul className="mt-2 space-y-1">
          {sorted.map((log) => (
            <LogRow key={log.id} log={log} exerciseType={exerciseType} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function buildLogLabel(log: SessionSetLog, exerciseType: string, weightUnit: "kg" | "lb", distanceUnit: "m" | "km" | "mi"): string {
  const hasWeight = log.weightKg != null && log.reps != null;
  const hasDuration = log.durationSec != null && log.durationSec > 0;
  const hasDistance = log.distanceM != null && log.distanceM > 0;

  const isCardioLog = hasDuration || hasDistance;
  const effectiveType = isCardioLog && exerciseType === "strength" ? "mixed" : exerciseType;

  if (effectiveType === "cardio") {
    const parts: string[] = [];
    if (hasDuration) parts.push(formatSecs(log.durationSec!));
    if (hasDistance) parts.push(formatDistance(log.distanceM!, distanceUnit));
    return parts.length > 0 ? parts.join(" · ") : "—";
  }

  if (effectiveType === "mixed") {
    const parts: string[] = [];
    if (hasWeight) parts.push(`${formatWeight(log.weightKg!, weightUnit)} × ${log.reps}`);
    else if (log.reps != null) parts.push(`${log.reps} reps`);
    if (hasDuration) parts.push(formatSecs(log.durationSec!));
    if (hasDistance) parts.push(formatDistance(log.distanceM!, distanceUnit));
    return parts.length > 0 ? parts.join(" · ") : "—";
  }

  if (hasWeight) return `${formatWeight(log.weightKg!, weightUnit)} × ${log.reps}`;
  if (log.reps != null) return `${log.reps} reps`;
  return "—";
}

function LogRow({ log, exerciseType }: { log: SessionSetLog; exerciseType: string }) {
  const { weightUnit, distanceUnit } = useContext(SettingsContext);
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
          "flex-1 text-sm",
          isSkipped ? "text-[var(--text-subtle)] line-through" : "text-[var(--text)]",
        ].join(" ")}
      >
        {buildLogLabel(log, exerciseType, weightUnit, distanceUnit)}
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

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="animate-spin">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function ClockEditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="opacity-50">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l3 3" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
