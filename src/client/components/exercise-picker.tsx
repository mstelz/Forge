import { useMemo, useState } from "react";
import { useExercises } from "../hooks/use-exercises";
import { useEquipment } from "../hooks/use-equipment";
import { useFilteredExercises } from "../pages/exercises/use-filtered-exercises";
import { FilterChips, type MuscleFilter, type TypeFilter } from "../pages/exercises/filter-chips";
import { EquipmentFilterSheet } from "../pages/exercises/equipment-filter-sheet";
import type { Exercise, Equipment } from "../../shared";
import { cn } from "../lib/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (exerciseId: string) => void;
  title?: string;
};

export function ExercisePicker({ open, onClose, onSelect, title = "Select exercise" }: Props) {
  const { data: exercises } = useExercises();
  const { data: equipment } = useEquipment();

  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [muscle, setMuscle] = useState<MuscleFilter>("all");
  const [equipmentIds, setEquipmentIds] = useState<Set<string>>(new Set());
  const [equipmentSheetOpen, setEquipmentSheetOpen] = useState(false);

  const equipmentById = useMemo(() => {
    const m = new Map<string, Equipment>();
    for (const eq of equipment ?? []) m.set(eq.id, eq);
    return m;
  }, [equipment]);

  const filtered = useFilteredExercises(exercises, { search, type, muscle, equipmentIds });

  const clearAll = () => {
    setSearch("");
    setType("all");
    setMuscle("all");
    setEquipmentIds(new Set());
  };

  const toggleEquipment = (id: string) =>
    setEquipmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSelect = (id: string) => {
    clearAll();
    onSelect(id);
  };

  const handleClose = () => {
    clearAll();
    onClose();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]"
    >
      <header className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cancel"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ChevronLeftIcon />
        </button>
        <h2 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
          {title}
        </h2>
        <div className="w-9" />
      </header>

      <div className="space-y-3 px-4 pt-3">
        <label className="relative block">
          <span className="sr-only">Search exercises</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search exercises"
            placeholder="Search exercises"
            autoFocus
            className="h-11 w-full rounded-[var(--radius-card)] bg-[var(--surface)] pl-10 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </label>
        <FilterChips
          type={type}
          onTypeChange={setType}
          muscle={muscle}
          onMuscleChange={setMuscle}
          equipmentCount={equipmentIds.size}
          onOpenEquipment={() => setEquipmentSheetOpen(true)}
        />
      </div>

      <ul className="flex-1 overflow-y-auto px-4 pt-3 pb-8 space-y-2">
        {filtered.length === 0 ? (
          <li className="py-12 text-center text-sm text-[var(--text-muted)]">
            No matches
            {(search || type !== "all" || muscle !== "all" || equipmentIds.size > 0) && (
              <button
                type="button"
                onClick={clearAll}
                className="ml-2 text-[var(--accent)] underline"
              >
                Clear filters
              </button>
            )}
          </li>
        ) : (
          filtered.map((ex) => (
            <li key={ex.id}>
              <PickerRow
                exercise={ex}
                equipmentById={equipmentById}
                onSelect={handleSelect}
              />
            </li>
          ))
        )}
      </ul>

      <EquipmentFilterSheet
        open={equipmentSheetOpen}
        onClose={() => setEquipmentSheetOpen(false)}
        equipment={equipment ?? []}
        selectedIds={equipmentIds}
        onToggle={toggleEquipment}
        onClear={() => setEquipmentIds(new Set())}
      />
    </div>
  );
}

const TYPE_BADGE: Record<Exercise["type"], { letter: string; classes: string }> = {
  strength: { letter: "S", classes: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30" },
  cardio: { letter: "C", classes: "bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30" },
  mixed: { letter: "M", classes: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30" },
};

const MUSCLE_LABEL: Record<string, string> = {
  chest: "Chest", back: "Back", quadriceps: "Quads", hamstrings: "Hamstrings",
  glutes: "Glutes", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps",
  forearms: "Forearms", core: "Core", calves: "Calves", full_body: "Full body",
  conditioning: "Conditioning", other: "Other",
};

function PickerRow({
  exercise,
  equipmentById,
  onSelect,
}: {
  exercise: Exercise;
  equipmentById: Map<string, Equipment>;
  onSelect: (id: string) => void;
}) {
  const badge = TYPE_BADGE[exercise.type];
  const primary = exercise.primaryMuscles[0]
    ? MUSCLE_LABEL[exercise.primaryMuscles[0]] ?? exercise.primaryMuscles[0]
    : null;
  const equipmentName = exercise.equipmentIds
    .map((id) => equipmentById.get(id)?.name)
    .find((n): n is string => Boolean(n)) ?? null;
  const secondary = [primary, equipmentName].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={() => onSelect(exercise.id)}
      className="flex w-full items-center gap-3 rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-3 text-left transition-colors hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-semibold",
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
    </button>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
