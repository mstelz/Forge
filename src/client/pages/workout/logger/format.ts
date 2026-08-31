import { formatWeight, formatDistance } from "../../../lib/units";
import { formatHms } from "../../../lib/time";
import type { SessionSetLog } from "../../../../shared";
import type { PlannedSlot } from "./types";

export function formatDaysAgo(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function formatRepsTarget(slot: PlannedSlot): string {
  if (slot.repsMin != null && slot.repsMax != null) return `${slot.repsMin}–${slot.repsMax} reps`;
  if (slot.reps != null) return `${slot.reps} reps`;
  return "";
}

export function formatRpeTarget(slot: PlannedSlot): string {
  if (slot.rpe != null) return `RPE ${slot.rpe}`;
  return "";
}

export function formatSetSummary(
  log: SessionSetLog,
  weightUnit: "kg" | "lb",
  distanceUnit: "m" | "km" | "mi",
): string {
  const parts: string[] = [];
  if (log.durationSec != null) parts.push(formatHms(log.durationSec));
  if (log.distanceM != null) parts.push(formatDistance(log.distanceM, distanceUnit));
  if (log.weightKg != null && log.reps != null) parts.push(`${formatWeight(log.weightKg, weightUnit)} × ${log.reps}`);
  else if (log.reps != null) parts.push(`${log.reps} reps`);
  if (parts.length === 0) return "—";
  return parts.join(" · ");
}
