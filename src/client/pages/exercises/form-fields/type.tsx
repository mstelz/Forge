import type { ExerciseType } from "../../../../shared";
import { cn } from "../../../lib/cn";

const OPTIONS: { value: ExerciseType; label: string }[] = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "mixed", label: "Mixed" },
];

type Props = {
  value: ExerciseType;
  onChange: (next: ExerciseType) => void;
};

export function TypeField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <span
        id="exercise-type-label"
        className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
      >
        Type
      </span>
      <div
        role="radiogroup"
        aria-labelledby="exercise-type-label"
        className="inline-flex rounded-full bg-[var(--surface)] p-1 ring-1 ring-[var(--border)]"
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                active
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
