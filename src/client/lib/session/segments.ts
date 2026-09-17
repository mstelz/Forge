import type { SessionSetLog } from "../../../shared/session-log";
import { formatWeight } from "../units";

export function formatStrengthSet(log: SessionSetLog, unit: "kg" | "lb"): string {
  const effort = (weight: number | null, reps: number | null) =>
    weight != null && reps != null ? `${formatWeight(weight, unit)} × ${reps}` : reps != null ? `${reps} reps` : "";
  return [effort(log.weightKg, log.reps), ...(log.segments ?? []).map(part =>
    `${part.pauseSec > 0 ? `${part.pauseSec}s pause → ` : ""}${effort(part.weightKg, part.reps)}`,
  )].filter(Boolean).join(" → ");
}
