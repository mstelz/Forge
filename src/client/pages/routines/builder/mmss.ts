/** Format seconds as mm:ss (e.g. 150 → "2:30") */
export function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Parse mm:ss string to seconds. Returns null on invalid input. */
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
