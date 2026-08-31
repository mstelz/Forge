import { useContext, useMemo } from "react";
import { SettingsContext } from "../../../contexts/settings-context";
import { useExercise } from "../../../hooks/use-exercises";
import { formatDistance, formatWeight } from "../../../lib/units";
import { formatHms } from "../../../lib/time";
import { InstructionalCard } from "../../exercises/instructional-card";
import { Instructions } from "../../exercises/instructions";
import { recordsByLogId } from "../../../lib/session/records";
import { describeRecord, headlineRecord, recordBadge } from "../../../lib/session/record-labels";
import { formatDaysAgo } from "./format";
import { useLastTimeForExercise } from "./last-time";

/** Bottom sheets share a chrome; only the body differs. */
function Sheet({
  label,
  title,
  closeLabel,
  onClose,
  surface,
  maxHeight,
  children,
}: {
  label: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  surface: string;
  maxHeight: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-label={label}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={`relative w-full max-w-lg rounded-t-[var(--radius-card)] ${surface} ring-1 ring-[var(--border)]`}
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <p className="text-sm font-bold text-[var(--text)]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Exercise History Sheet ───────────────────────────────────────────────────

export function ExerciseHistorySheet({
  exerciseId,
  exerciseName,
  open,
  onClose,
}: {
  exerciseId: string;
  exerciseName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: allLogs } = useLastTimeForExercise(exerciseId);
  const { weightUnit, distanceUnit } = useContext(SettingsContext);

  // Records stay visible after the fact — the toast at the time is not the record.
  const records = useMemo(
    () => (allLogs ? recordsByLogId(allLogs) : new Map()),
    [allLogs],
  );

  const sessions = useMemo(() => {
    if (!allLogs) return [];
    const logged = allLogs.filter((l) => l.status === "logged").sort((a, b) => b.loggedAt - a.loggedAt);
    const groups: Array<{ date: number; sets: typeof logged }> = [];
    for (const log of logged) {
      const last = groups[groups.length - 1];
      if (last && last.date - log.loggedAt < 4 * 3_600_000) {
        last.sets.push(log);
      } else {
        groups.push({ date: log.loggedAt, sets: [log] });
      }
    }
    return groups.slice(0, 5);
  }, [allLogs]);

  if (!open) return null;

  return (
    <Sheet
      label={`${exerciseName} history`}
      title={exerciseName}
      closeLabel="Close history"
      onClose={onClose}
      surface="bg-[var(--surface)]"
      maxHeight="70dvh"
    >
      <div className="overflow-y-auto px-4 pb-6 space-y-4" style={{ maxHeight: "calc(70dvh - 80px)" }}>
        {sessions.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">No history yet</p>
        ) : (
          sessions.map((group, gi) => (
            <div key={gi}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                {formatDaysAgo(group.date)}
              </p>
              <div className="space-y-1">
                {group.sets.map((log, si) => {
                  const parts: string[] = [];
                  if (log.weightKg != null) parts.push(formatWeight(log.weightKg, weightUnit));
                  if (log.reps != null) parts.push(`${log.reps} reps`);
                  if (log.durationSec != null) parts.push(formatHms(log.durationSec));
                  if (log.distanceM != null) parts.push(formatDistance(log.distanceM, distanceUnit));
                  const beaten = records.get(log.id) ?? [];
                  const headline = headlineRecord(beaten);
                  return (
                    <div key={log.id} className="flex items-center gap-3">
                      <span className="w-10 text-[10px] font-semibold text-[var(--text-subtle)]">
                        Set {si + 1}
                      </span>
                      <span className="text-sm text-[var(--text)]">{parts.join(" × ") || "—"}</span>
                      {headline && (
                        <span
                          title={describeRecord(headline, { weightUnit, distanceUnit })}
                          className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]"
                        >
                          {recordBadge(headline)}
                        </span>
                      )}
                      {log.rpe != null && (
                        <span className="ml-auto text-[10px] text-[var(--text-muted)]">RPE {log.rpe}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}

// ─── Exercise Info Sheet ──────────────────────────────────────────────────────

export function ExerciseInfoSheet({
  exerciseId,
  exerciseName,
  open,
  onClose,
}: {
  exerciseId: string;
  exerciseName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: exercise } = useExercise(exerciseId);

  if (!open) return null;

  const videoUrl = exercise?.videoUrls?.[0] ?? null;
  const hasContent = videoUrl || exercise?.description || exercise?.instructions;

  return (
    <Sheet
      label={`${exerciseName} info`}
      title={exerciseName}
      closeLabel="Close exercise info"
      onClose={onClose}
      surface="bg-[var(--surface-elevated)]"
      maxHeight="80dvh"
    >
      <div className="overflow-y-auto px-4 pb-8 space-y-3" style={{ maxHeight: "calc(80dvh - 80px)" }}>
        {!exercise ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">Loading…</p>
        ) : !hasContent ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">No description or instructions added yet.</p>
        ) : (
          <>
            <InstructionalCard videoUrl={videoUrl} description={exercise.description ?? null} />
            <Instructions instructions={exercise.instructions ?? null} />
          </>
        )}
      </div>
    </Sheet>
  );
}
