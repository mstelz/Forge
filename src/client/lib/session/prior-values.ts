import { forgeDB } from "../../db/forge-db";
import Dexie from "dexie";
import type { SessionSetLog } from "../../../shared";
import type { LastSet } from "./progression";

export async function getLastLogValuesForExercise(
  exerciseId: string,
): Promise<{
  weightKg?: number;
  reps?: number;
  rpe?: number;
  durationSec?: number;
  distanceM?: number;
} | null> {
  const rows = await forgeDB.sessionSetLogs
    .where("[exerciseId+loggedAt]")
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .toArray();

  const logged = rows.filter((r) => r.status === "logged");
  if (logged.length === 0) return null;

  logged.sort((a, b) => b.loggedAt - a.loggedAt);
  const last = logged[0]!;

  return {
    weightKg: last.weightKg ?? undefined,
    reps: last.reps ?? undefined,
    rpe: last.rpe ?? undefined,
    durationSec: last.durationSec ?? undefined,
    distanceM: last.distanceM ?? undefined,
  };
}

/**
 * The working sets of the last session this exercise was trained in, which is what
 * a progression suggestion reasons about — a single last set cannot tell you
 * whether every set cleared its reps.
 *
 * Pure, so the session-grouping rule is testable without Dexie.
 *
 * Warmups are excluded: progressing off a warmup would suggest going backwards.
 * The current session is excluded too, so sets logged minutes ago do not become
 * the history the next set is judged against.
 */
export function selectLastSessionSets(
  logs: SessionSetLog[],
  currentSessionId: string | null,
): LastSet[] {
  const eligible = logs.filter(
    (l) =>
      (l.status === "logged" || l.status === "extra") &&
      l.setType !== "warmup" &&
      l.sessionId !== currentSessionId,
  );
  if (eligible.length === 0) return [];

  const mostRecent = eligible.reduce((a, b) => (b.loggedAt > a.loggedAt ? b : a));
  return eligible
    .filter((l) => l.sessionId === mostRecent.sessionId)
    .sort((a, b) => a.loggedAt - b.loggedAt)
    .map((l) => ({ weightKg: l.weightKg, reps: l.reps }));
}

export async function getLastSessionSetsForExercise(
  exerciseId: string,
  currentSessionId: string | null,
): Promise<LastSet[]> {
  const rows = await forgeDB.sessionSetLogs
    .where("[exerciseId+loggedAt]")
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .toArray();
  return selectLastSessionSets(rows, currentSessionId);
}
