import { Link } from "react-router";
import type { Exercise, Equipment } from "../../../shared";
import { cn } from "../../lib/cn";

const TYPE_BADGE: Record<Exercise["type"], { letter: string; classes: string }> = {
  strength: {
    letter: "S",
    classes: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
  },
  cardio: {
    letter: "C",
    classes: "bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30",
  },
  mixed: {
    letter: "M",
    classes: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30",
  },
};

const MUSCLE_LABEL: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  quadriceps: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  calves: "Calves",
  full_body: "Full body",
  conditioning: "Conditioning",
  other: "Other",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const lastUsedLabel = (lastUsedAt: number | null, createdAt: number): string => {
  if (lastUsedAt == null) {
    const ageDays = (Date.now() - createdAt) / DAY_MS;
    return ageDays < 14 ? "NEW" : "NEVER";
  }
  const days = Math.floor((Date.now() - lastUsedAt) / DAY_MS);
  if (days <= 0) return "TODAY";
  return `${days}D AGO`;
};

type Props = {
  exercise: Exercise;
  equipmentById: Map<string, Equipment>;
};

export function ExerciseRow({ exercise, equipmentById }: Props) {
  const badge = TYPE_BADGE[exercise.type];
  const primary = exercise.primaryMuscles[0]
    ? MUSCLE_LABEL[exercise.primaryMuscles[0]] ?? exercise.primaryMuscles[0]
    : null;
  const equipmentName = exercise.equipmentIds
    .map((id) => equipmentById.get(id)?.name)
    .find((n): n is string => Boolean(n)) ?? null;
  const firstAlias = exercise.aliases[0] ?? null;
  const secondary = [primary, equipmentName, firstAlias]
    .filter((s): s is string => Boolean(s))
    .join(" · ");
  const usedLabel = lastUsedLabel(exercise.lastUsedAt, exercise.createdAt);

  const ariaLabel = [
    exercise.name,
    `${exercise.type} exercise`,
    secondary,
    usedLabel === "NEW" || usedLabel === "NEVER"
      ? usedLabel.toLowerCase()
      : `last used ${usedLabel.toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      to={`/exercises/${exercise.id}`}
      aria-label={ariaLabel}
      className="flex items-center gap-3 rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-3 transition-colors hover:bg-[var(--surface-elevated)] focus:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-semibold tabular",
          badge.classes,
        )}
      >
        {badge.letter}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold text-[var(--text)]">
          {exercise.name}
        </span>
        {secondary ? (
          <span className="truncate text-xs text-[var(--text-muted)]">{secondary}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-[var(--text-subtle)] tabular">
        {usedLabel === "NEW" || usedLabel === "NEVER" ? usedLabel : `LAST USED ${usedLabel}`}
      </span>
    </Link>
  );
}
