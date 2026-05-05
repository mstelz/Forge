import { MUSCLE_VALUES, type Muscle } from "../../../../shared";
import { cn } from "../../../lib/cn";

const LABELS: Record<Muscle, string> = {
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
  full_body: "Full Body",
  conditioning: "Conditioning",
  other: "Other",
};

type Props = {
  legend: string;
  selected: Muscle[];
  onToggle: (m: Muscle) => void;
};

export function MusclesField({ legend, selected, onToggle }: Props) {
  const set = new Set(selected);
  return (
    <fieldset className="space-y-1.5">
      <legend className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {MUSCLE_VALUES.map((m) => {
          const active = set.has(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(m)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                active
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "bg-transparent text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:text-[var(--text)]",
              )}
            >
              {LABELS[m]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
