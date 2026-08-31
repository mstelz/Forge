import type { Session, SessionSetLog } from "../../../shared";
import { countSessionRecords } from "./records";

export function summarizeSession(
  _session: Session,
  logs: SessionSetLog[],
  allPriorLogs: SessionSetLog[],
): {
  totalVolumeKg: number;
  totalLoggedSets: number;
  prCount: number;
} {
  // totalVolumeKg: sum of weightKg * reps for all status='logged', setType='normal' logs
  const loggedNormal = logs.filter(
    (l) => l.status === "logged" && l.setType === "normal",
  );
  const totalVolumeKg = loggedNormal.reduce((sum, l) => {
    if (l.weightKg != null && l.reps != null) {
      return sum + l.weightKg * l.reps;
    }
    return sum;
  }, 0);

  // totalLoggedSets: count of status='logged' logs
  const totalLoggedSets = logs.filter((l) => l.status === "logged").length;

  // prCount: distinct exercises that set a record this session. Shares its rules
  // with the recognition shown while lifting, so the summary cannot disagree with
  // what the user was told mid-workout — see ./records.
  //
  // This is stricter than it used to be: an exercise with no prior history no
  // longer counts, where before every first-ever set scored a PR.
  const prCount = countSessionRecords(logs, allPriorLogs);

  return { totalVolumeKg, totalLoggedSets, prCount };
}
