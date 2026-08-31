// Centralized time/duration formatters. Previously these were re-implemented in
// active.tsx (formatTimer / secsToTimeStr), routines/builder/mmss.ts, and three
// copies of an ms→"Xh Ym" helper (history list/index, session-detail).

/** Seconds → "m:ss" (e.g. 150 → "2:30"). Clamps negatives to 0 and rounds. */
export function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Seconds → "h:mm:ss" when ≥ 1 hour, otherwise "m:ss". Clamps and rounds. */
export function formatHms(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Parse "m:ss" or plain integer seconds → seconds (0–3600), or null if invalid. */
export function parseMmSs(input: string): number | null {
  const trimmed = input.trim();
  const colonMatch = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
  if (colonMatch) {
    const m = parseInt(colonMatch[1]!, 10);
    const s = parseInt(colonMatch[2]!, 10);
    const total = m * 60 + s;
    return total >= 0 && total <= 3600 ? total : null;
  }
  // Plain integer seconds fallback (e.g. "90")
  const numMatch = /^\d+$/.exec(trimmed);
  if (numMatch) {
    const total = parseInt(trimmed, 10);
    return total >= 0 && total <= 3600 ? total : null;
  }
  return null;
}

/** Upper bound for a logged duration — 24 hours, matching RoutineItemSchema. */
export const MAX_DURATION_SEC = 86_400;

/**
 * Parse a duration a user typed: "h:mm:ss", "m:ss", or bare integer seconds.
 *
 * Three-way result so a controlled input can tell "cleared" from "not valid yet":
 *   number    → a duration
 *   null      → the field is empty, clear the value
 *   undefined → not parseable, keep what the user typed and commit nothing
 */
export function parseDuration(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":");
  if (parts.length > 3) return undefined;
  if (!parts.every((p) => /^\d+$/.test(p))) return undefined;

  const nums = parts.map((p) => parseInt(p, 10));
  let total: number;
  if (nums.length === 1) {
    total = nums[0]!;
  } else {
    // Only the leading unit may exceed its base ("90:00" is a valid 90 minutes).
    if (nums.slice(1).some((n) => n > 59)) return undefined;
    total =
      nums.length === 2
        ? nums[0]! * 60 + nums[1]!
        : nums[0]! * 3600 + nums[1]! * 60 + nums[2]!;
  }

  return total >= 0 && total <= MAX_DURATION_SEC ? total : undefined;
}

/** Milliseconds → compact human duration "Xh Ym" (or "Ym" under an hour). */
export function formatDurationMs(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
