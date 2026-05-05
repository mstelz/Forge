import { z } from "zod";

export const MUSCLE_VALUES = [
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
  "full_body",
  "conditioning",
  "other",
] as const;

export const MuscleEnum = z.enum(MUSCLE_VALUES);
export type Muscle = z.infer<typeof MuscleEnum>;

export const EXERCISE_TYPE_VALUES = ["strength", "cardio", "mixed"] as const;
export const ExerciseTypeEnum = z.enum(EXERCISE_TYPE_VALUES);
export type ExerciseType = z.infer<typeof ExerciseTypeEnum>;
