import { useMemo } from "react";
import { useExerciseLogs } from "../../hooks/use-sessions";

// ---------------------------------------------------------------------------
// Epley 1RM formula
// ---------------------------------------------------------------------------
function epley(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

function formatWeight(kg: number): string {
  return kg % 1 === 0 ? String(kg) : kg.toFixed(1);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExerciseHistorySection({ exerciseId }: { exerciseId: string }) {
  const { data: allLogs } = useExerciseLogs(exerciseId);

  const computed = useMemo(() => {
    if (!allLogs || allLogs.length === 0) return null;

    const loggedNormal = allLogs.filter(
      (l) =>
        l.status === "logged" &&
        l.setType === "normal" &&
        l.weightKg != null &&
        l.weightKg > 0 &&
        l.reps != null &&
        l.reps > 0,
    );

    // EST 1RM — max Epley across logged normal sets
    let best1rmLog: (typeof loggedNormal)[number] | null = null;
    let best1rm = 0;
    for (const log of loggedNormal) {
      const e = epley(log.weightKg!, log.reps!);
      if (e > best1rm) {
        best1rm = e;
        best1rmLog = log;
      }
    }

    // BEST SET — highest Epley log as "Xkg × Y"
    const bestSetStr =
      best1rmLog != null
        ? `${formatWeight(best1rmLog.weightKg!)}kg × ${best1rmLog.reps}`
        : null;

    // TOTAL SESSIONS — distinct sessionIds with ≥1 logged log
    const sessionIds = new Set(
      allLogs.filter((l) => l.status === "logged").map((l) => l.sessionId),
    );
    const totalSessions = sessionIds.size;

    // RECENT HISTORY — last 5 logged sets, newest first
    const logged = allLogs
      .filter((l) => l.status === "logged")
      .sort((a, b) => b.loggedAt - a.loggedAt)
      .slice(0, 5);

    return { best1rm, bestSetStr, totalSessions, logged };
  }, [allLogs]);

  if (!computed || (allLogs ?? []).length === 0) {
    return (
      <section className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Recent history
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          No history yet — log a workout to see progress here.
        </p>
      </section>
    );
  }

  const { best1rm, bestSetStr, totalSessions, logged } = computed;

  return (
    <section className="space-y-3">
      {/* 2×2 stat tiles */}
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Est 1RM"
          value={best1rm > 0 ? `${formatWeight(best1rm)} kg` : "—"}
        />
        <StatTile label="Best Set" value={bestSetStr ?? "—"} />
        <StatTile label="Total Sessions" value={String(totalSessions)} />
        <StatTile label="Logged Sets" value={String(logged.length)} />
      </div>

      {/* Recent history list */}
      {logged.length > 0 ? (
        <div className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-3">
            Recent History
          </h2>
          <ul className="space-y-2">
            {logged.map((log) => {
              const weightStr =
                log.weightKg != null && log.reps != null
                  ? `${formatWeight(log.weightKg)}kg × ${log.reps} reps`
                  : log.reps != null
                  ? `${log.reps} reps`
                  : "—";
              const rpeStr = log.rpe != null ? ` · RPE ${log.rpe}` : "";
              const date = new Date(log.loggedAt);
              const dateStr = date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              return (
                <li key={log.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-[var(--text)]">
                    {weightStr}
                    {rpeStr}
                  </span>
                  <span className="flex-shrink-0 text-xs text-[var(--text-subtle)]">
                    {dateStr}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--surface)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}

// Keep backward-compatible export for any existing usages
/** @deprecated Use ExerciseHistorySection instead */
export function HistoryPlaceholder() {
  return (
    <section className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        Recent history
      </h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        No history yet — log a workout to see progress here.
      </p>
    </section>
  );
}
