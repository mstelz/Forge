/**
 * Epley 1RM formula: weightKg * (1 + reps / 30)
 */
export function epley(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

// `bestEpleyForExercise` used to live here and pick an exercise's best estimate
// out of a pile of logs. Record detection replaced it — records need to know when
// a best was set, not just what it is — and nothing else called it. It is gone
// rather than left behind as another tested function with no callers; see
// lib/session/records.ts for the rules that took over.
