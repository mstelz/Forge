import { useRef } from "react";
import type { ExerciseType, Muscle } from "../../../shared";
import { cn } from "../../lib/cn";

export type TypeFilter = "all" | ExerciseType;
export type MuscleFilter = "all" | Muscle;

const TYPE_CHIPS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "mixed", label: "Mixed" },
];

const MUSCLE_CHIPS: { value: MuscleFilter; label: string }[] = [
  { value: "all", label: "All muscles" },
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "quadriceps", label: "Quads" },
  { value: "hamstrings", label: "Hamstrings" },
  { value: "glutes", label: "Glutes" },
  { value: "core", label: "Core" },
  { value: "conditioning", label: "Conditioning" },
];

type Props = {
  type: TypeFilter;
  onTypeChange: (next: TypeFilter) => void;
  muscle: MuscleFilter;
  onMuscleChange: (next: MuscleFilter) => void;
  equipmentCount: number;
  onOpenEquipment: () => void;
};

export function FilterChips({
  type,
  onTypeChange,
  muscle,
  onMuscleChange,
  equipmentCount,
  onOpenEquipment,
}: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const root = toolbarRef.current;
    if (!root) return;
    const buttons = Array.from(
      root.querySelectorAll<HTMLButtonElement>("button[data-chip]"),
    );
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (idx === -1) return;
    e.preventDefault();
    const next =
      e.key === "ArrowRight"
        ? (idx + 1) % buttons.length
        : (idx - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Filter exercises"
      onKeyDown={onKeyDown}
      className="space-y-3"
    >
      <div className="flex flex-wrap gap-2">
        {TYPE_CHIPS.map((c) => (
          <Chip
            key={`type-${c.value}`}
            active={type === c.value}
            variant="primary"
            onClick={() => onTypeChange(c.value)}
          >
            {c.label}
          </Chip>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MUSCLE_CHIPS.map((c) => (
          <Chip
            key={`muscle-${c.value}`}
            active={muscle === c.value}
            variant="muted"
            onClick={() => onMuscleChange(c.value)}
          >
            {c.label}
          </Chip>
        ))}
        <Chip
          active={equipmentCount > 0}
          variant="muted"
          onClick={onOpenEquipment}
          ariaHaspopup="dialog"
        >
          Equipment
          {equipmentCount > 0 ? (
            <span className="ml-1.5 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold text-[var(--accent-fg)]">
              {equipmentCount}
            </span>
          ) : null}
        </Chip>
      </div>
    </div>
  );
}

type ChipProps = {
  active: boolean;
  variant: "primary" | "muted";
  onClick: () => void;
  children: React.ReactNode;
  ariaHaspopup?: "dialog" | "menu";
};

function Chip({ active, variant, onClick, children, ariaHaspopup }: ChipProps) {
  return (
    <button
      type="button"
      data-chip
      aria-pressed={active}
      aria-haspopup={ariaHaspopup}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        active && variant === "primary" && "bg-[var(--accent)] text-[var(--accent-fg)]",
        active && variant === "muted" && "bg-[var(--surface-elevated)] text-[var(--text)] ring-1 ring-[var(--accent)]/50",
        !active && "bg-transparent text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}
