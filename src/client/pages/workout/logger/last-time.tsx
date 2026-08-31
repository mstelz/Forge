import { useContext, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { forgeDB } from "../../../db/forge-db";
import { listLogsForExercise } from "../../../db/queries";
import { queryKeys } from "../../../db/query-keys";
import { SettingsContext } from "../../../contexts/settings-context";
import { summarizeLastTime } from "../../../lib/session/last-time";
import { ChevronRightIcon } from "../icons";
import { formatDaysAgo } from "./format";

/**
 * Every log for one exercise, across all sessions, kept fresh against Dexie.
 * Also used by the history sheet, which wants the same data unaggregated.
 */
export function useLastTimeForExercise(exerciseId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.sessionSetLogs.count()).subscribe({
      next: () =>
        qc.invalidateQueries({
          queryKey: queryKeys.exerciseHistory.byExerciseId(exerciseId),
        }),
    });
    return () => sub.unsubscribe();
  }, [exerciseId, qc]);

  return useQuery({
    queryKey: queryKeys.exerciseHistory.byExerciseId(exerciseId),
    queryFn: () => listLogsForExercise(exerciseId),
  });
}

export function LastTimeLine({
  exerciseId,
  sessionId,
  onViewHistory,
}: {
  exerciseId: string;
  sessionId: string;
  onViewHistory: () => void;
}) {
  const { data: allLogs } = useLastTimeForExercise(exerciseId);

  const settings = useContext(SettingsContext);
  const summary = useMemo(() => {
    if (!allLogs || allLogs.length === 0) return null;
    const metrics = summarizeLastTime(allLogs, sessionId, {
      weightUnit: settings.weightUnit,
      distanceUnit: settings.distanceUnit,
    });
    if (!metrics) return null;

    const prior = allLogs.filter(
      (l) => l.sessionId !== sessionId && l.status === "logged",
    );
    const mostRecentAt = Math.max(...prior.map((l) => l.loggedAt));
    return `Last time: ${metrics} · ${formatDaysAgo(mostRecentAt)}`;
  }, [allLogs, sessionId, settings.weightUnit, settings.distanceUnit]);

  if (!summary) return null;
  return (
    <button
      type="button"
      onClick={onViewHistory}
      className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none"
    >
      <span>{summary}</span>
      <ChevronRightIcon />
    </button>
  );
}
