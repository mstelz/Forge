import type { Muscle } from "../../../shared/enums";

/** 0 = untouched … 4 = hardest hit. Drives the muscle map's fill colour. */
export type MuscleIntensity = 0 | 1 | 2 | 3 | 4;
export type MuscleIntensities = Partial<Record<Muscle, MuscleIntensity>>;

/** Muscles the body figure has a region for. */
export const MAPPED_MUSCLES = [
  "chest",
  "back",
  "quadriceps",
  "hamstrings",
  "glutes",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "calves",
] as const satisfies readonly Muscle[];

type MappedMuscle = (typeof MAPPED_MUSCLES)[number];
type MuscleTargets = { primaryMuscles: readonly Muscle[]; secondaryMuscles: readonly Muscle[] };

const isMapped = (m: Muscle): m is MappedMuscle => (MAPPED_MUSCLES as readonly Muscle[]).includes(m);

/**
 * Credit each muscle gets from one exercise: 1 for a primary, 0.5 for a
 * secondary. `full_body` counts as secondary for every drawn muscle; the
 * stronger credit wins when a muscle is listed more than once.
 */
function muscleCredits(ex: MuscleTargets): Map<MappedMuscle, number> {
  const credits = new Map<MappedMuscle, number>();
  const give = (m: MappedMuscle, c: number) => credits.set(m, Math.max(credits.get(m) ?? 0, c));
  const all = [...ex.primaryMuscles, ...ex.secondaryMuscles];
  if (all.includes("full_body")) for (const m of MAPPED_MUSCLES) give(m, 0.5);
  for (const m of ex.secondaryMuscles) if (isMapped(m)) give(m, 0.5);
  for (const m of ex.primaryMuscles) if (isMapped(m)) give(m, 1);
  return credits;
}

/** How strongly to shade each muscle for one exercise. */
export function exerciseIntensities(ex: MuscleTargets): MuscleIntensities {
  const out: MuscleIntensities = {};
  for (const [m, credit] of muscleCredits(ex)) out[m] = credit === 1 ? 4 : 2;
  return out;
}

type LoggedSet = { exerciseId: string; status: string; setType: string };

/**
 * Working sets per muscle for a session. Warmups and sets that were never
 * logged don't count.
 */
export function sessionMuscleSets(
  logs: readonly LoggedSet[],
  exercisesById: ReadonlyMap<string, MuscleTargets>,
): Map<MappedMuscle, number> {
  const sets = new Map<MappedMuscle, number>();
  for (const log of logs) {
    if (log.status !== "logged" || log.setType === "warmup") continue;
    const ex = exercisesById.get(log.exerciseId);
    if (!ex) continue;
    for (const [m, credit] of muscleCredits(ex)) sets.set(m, (sets.get(m) ?? 0) + credit);
  }
  return sets;
}

/** Bucket a session's set count into a heat level: 1–2, 3–5, 6–8, 9+. */
export function setsToIntensity(sets: number): MuscleIntensity {
  if (sets <= 0) return 0;
  if (sets < 3) return 1;
  if (sets < 6) return 2;
  if (sets < 9) return 3;
  return 4;
}
