import type { DraftItem } from "./state";
import { formatMmSs } from "../../../lib/time";

export function repsSummary(item: DraftItem): string {
  if (item.repMode === "per_set") return "varies";
  if (item.uniformSetType === "amrap") return "AMRAP";
  if (item.uniformSetType === "to_failure") return "fail";
  if (item.uniformRepsMin != null && item.uniformRepsMax != null) {
    return `${item.uniformRepsMin}–${item.uniformRepsMax}`;
  }
  return item.uniformReps != null ? String(item.uniformReps) : "—";
}

export function restSummary(restSec: number | null | undefined): string | null {
  if (restSec == null) return null;
  return formatMmSs(restSec);
}

export function durationSummary(item: DraftItem): string | null {
  if (item.durationMinSec != null && item.durationMaxSec != null) {
    return `${formatMmSs(item.durationMinSec)}–${formatMmSs(item.durationMaxSec)}`;
  }
  if (item.durationSec != null) return formatMmSs(item.durationSec);
  return null;
}

/** Returns the last-set chip label (e.g. "AMRAP LAST SET") if the uniform or any per-set entry is special */
export function setTypeChip(item: DraftItem): string | null {
  if (item.setTypeMode === "uniform") {
    const t = item.uniformSetType;
    if (!t || t === "normal") return null;
    const labels: Record<string, string> = {
      amrap: "AMRAP",
      to_failure: "TO FAILURE",
      drop_set: "DROP SET",
      rest_pause: "REST-PAUSE",
    };
    return labels[t] ?? null;
  }
  // Per-set: check if last set differs
  const targets = item.setTargets ?? [];
  if (targets.length === 0) return null;
  const lastType = targets[targets.length - 1]?.setType;
  if (!lastType || lastType === "normal") return null;
  const labels: Record<string, string> = {
    amrap: "AMRAP LAST SET",
    to_failure: "LAST SET TO FAILURE",
    drop_set: "DROP SET",
    rest_pause: "REST-PAUSE",
  };
  return labels[lastType] ?? null;
}
