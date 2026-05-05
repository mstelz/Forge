import type { Exercise, Equipment } from "../../../shared";

const TYPE_LABEL: Record<Exercise["type"], string> = {
  strength: "STRENGTH",
  cardio: "CARDIO",
  mixed: "MIXED",
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

type Props = {
  exercise: Exercise;
  equipmentById: Map<string, Equipment>;
};

export function DetailHeader({ exercise, equipmentById }: Props) {
  const muscles = exercise.primaryMuscles
    .map((m) => MUSCLE_LABEL[m] ?? m)
    .filter((s): s is string => Boolean(s));
  const equipment = exercise.equipmentIds
    .map((id) => equipmentById.get(id)?.name)
    .filter((s): s is string => Boolean(s));
  const meta = [...muscles, ...equipment].join(" · ");

  return (
    <div className="space-y-3">
      <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)] ring-1 ring-[var(--accent)]/60">
        {TYPE_LABEL[exercise.type]}
      </span>
      <h1 className="text-3xl font-bold uppercase tracking-tight text-[var(--text)]">
        {exercise.name}
      </h1>
      {meta ? (
        <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{meta}</p>
      ) : null}
      {exercise.aliases.length > 0 ? (
        <p className="text-xs text-[var(--text-subtle)]">
          aka: {exercise.aliases.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
