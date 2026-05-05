import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { useExercises } from "../../hooks/use-exercises";
import { useEquipment } from "../../hooks/use-equipment";
import type { AppShellOutletContext } from "../../layouts/app-shell";
import { ExerciseRow } from "./row";
import { SearchInput } from "./search";
import { FilterChips, type MuscleFilter, type TypeFilter } from "./filter-chips";
import { EquipmentFilterSheet } from "./equipment-filter-sheet";
import { useFilteredExercises } from "./use-filtered-exercises";
import { FullEmptyState, ZeroMatchState, ListSkeleton } from "./empty-states";

export function ExerciseListPage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const { data: exercises, isLoading } = useExercises();
  const { data: equipment } = useEquipment();

  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [muscle, setMuscle] = useState<MuscleFilter>("all");
  const [equipmentIds, setEquipmentIds] = useState<Set<string>>(new Set());
  const [equipmentSheetOpen, setEquipmentSheetOpen] = useState(false);

  const equipmentById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof equipment>[number]>();
    for (const eq of equipment ?? []) m.set(eq.id, eq);
    return m;
  }, [equipment]);

  const filtered = useFilteredExercises(exercises, {
    search,
    type,
    muscle,
    equipmentIds,
  });

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

  const totalCount = exercises?.length ?? 0;
  const hasActiveFilters =
    search.length > 0 || type !== "all" || muscle !== "all" || equipmentIds.size > 0;

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={openDrawer}
          aria-label="Open navigation"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <HamburgerIcon />
        </button>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
          Exercise Library
        </h1>
        <Link
          to="/exercises/new"
          aria-label="Create exercise"
          className="rounded-md p-2 text-[var(--accent)] hover:text-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <PlusIcon />
        </Link>
      </header>

      <div className="space-y-3 px-4">
        <SearchInput value={search} onChange={setSearch} />
        <FilterChips
          type={type}
          onTypeChange={setType}
          muscle={muscle}
          onMuscleChange={setMuscle}
          equipmentCount={equipmentIds.size}
          onOpenEquipment={() => setEquipmentSheetOpen(true)}
        />
      </div>

      <main className="flex-1 px-4 pt-4 pb-8">
        {isLoading ? (
          <ListSkeleton />
        ) : totalCount === 0 ? (
          <FullEmptyState />
        ) : filtered.length === 0 ? (
          <ZeroMatchState onClear={clearAll} />
        ) : (
          <ul className="space-y-2">
            {filtered.map((e) => (
              <li key={e.id}>
                <ExerciseRow exercise={e} equipmentById={equipmentById} />
              </li>
            ))}
          </ul>
        )}
        {!isLoading && hasActiveFilters && filtered.length > 0 ? (
          <p className="mt-4 text-center text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            {filtered.length} of {totalCount}
          </p>
        ) : null}
      </main>

      <EquipmentFilterSheet
        open={equipmentSheetOpen}
        onClose={() => setEquipmentSheetOpen(false)}
        equipment={equipment ?? []}
        selectedIds={equipmentIds}
        onToggle={toggleEquipment}
        onClear={() => setEquipmentIds(new Set())}
      />
    </>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
