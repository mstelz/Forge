import { forgeDB } from "../../db/forge-db";
import Dexie from "dexie";

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
