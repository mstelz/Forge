import { MuscleMap } from "../../components/muscle-map/muscle-map";
import { exerciseIntensities } from "../../lib/muscles/muscle-load";
import type { Exercise } from "../../../shared";
import { MUSCLE_LABEL } from "./detail-header";

type Props = { exercise: Pick<Exercise, "primaryMuscles" | "secondaryMuscles"> };

const names = (ms: readonly string[]) => ms.map((m) => MUSCLE_LABEL[m] ?? m);

/** Front/back body with the exercise's primary and secondary muscles shaded. */
export function MuscleCard({ exercise }: Props) {
  const intensities = exerciseIntensities(exercise);
  if (Object.keys(intensities).length === 0) return null;

  const primary = names(exercise.primaryMuscles);
  const secondary = names(exercise.secondaryMuscles.filter((m) => !exercise.primaryMuscles.includes(m)));
  const label = [
    primary.length ? `Primary: ${primary.join(", ")}` : "",
    secondary.length ? `Secondary: ${secondary.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <section aria-labelledby="muscle-card-heading" className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
      <h2
        id="muscle-card-heading"
        className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-subtle)]"
      >
        Muscles worked
      </h2>
      <MuscleMap intensities={intensities} label={label} className="mt-3" />
      <ul className="mt-4 flex flex-wrap gap-1.5" aria-hidden="true">
        {primary.map((n) => (
          <li key={`p-${n}`} className="rounded-full bg-[var(--muscle-4)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-fg)]">
            {n}
          </li>
        ))}
        {secondary.map((n) => (
          <li key={`s-${n}`} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-[var(--text-muted)] ring-1 ring-[var(--border)]">
            <span className="h-2 w-2 rounded-[3px] bg-[var(--muscle-2)]" />
            {n}
          </li>
        ))}
      </ul>
    </section>
  );
}
