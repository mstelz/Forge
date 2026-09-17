import { setVolumeKg } from "../../../shared/session-log";
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
  // Count each effort once, while compound sets remain one logged set.
  const loggedNormal = logs.filter(
    (l) => l.status === "logged" && ["normal", "drop", "rest_pause", "amrap", "failure"].includes(l.setType),
  );
  const totalVolumeKg = loggedNormal.reduce((sum, log) => sum + setVolumeKg(log), 0);

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
