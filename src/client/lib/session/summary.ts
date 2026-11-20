import { setVolumeKg } from "../../../shared/session-log";
import type { Session, SessionSetLog } from "../../../shared";
import { sessionRecordsByExercise } from "./records";

export function summarizeSession(
  _session: Session,
  logs: SessionSetLog[],
  allPriorLogs: SessionSetLog[],
) {
  // Count each effort once, while compound sets remain one logged set.
  const loggedNormal = logs.filter(
    (l) => l.status === "logged" && ["normal", "drop", "rest_pause", "amrap", "failure"].includes(l.setType),
  );
  const totalVolumeKg = loggedNormal.reduce((sum, log) => sum + setVolumeKg(log), 0);

  // totalLoggedSets: count of status='logged' logs
  const totalLoggedSets = logs.filter((l) => l.status === "logged").length;

  const recordsByExercise = sessionRecordsByExercise(logs, allPriorLogs);

  return { totalVolumeKg, totalLoggedSets, prCount: recordsByExercise.size, recordsByExercise };
}
