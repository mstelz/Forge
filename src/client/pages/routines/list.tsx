import { useState } from "react";
import { Link, useOutletContext } from "react-router";
import { useRoutines } from "../../hooks/use-routines";
import type { AppShellOutletContext } from "../../layouts/app-shell";
import { RoutineRow } from "./row";
import { SearchInput } from "./search";
import { useFilteredRoutines } from "./use-filtered-routines";
import { FullEmptyState, ZeroMatchState, ListSkeleton } from "./empty-states";

export function RoutineListPage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const { data: routines, isLoading } = useRoutines();

  const [search, setSearch] = useState("");

  const filtered = useFilteredRoutines(routines, search);

  const totalCount = routines?.length ?? 0;
  const hasSearch = search.length > 0;

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
          Routines
        </h1>
        <Link
          to="/routines/new"
          aria-label="Create routine"
          className="rounded-md p-2 text-[var(--accent)] hover:text-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <PlusIcon />
        </Link>
      </header>

      <div className="px-4">
        <SearchInput value={search} onChange={setSearch} />
      </div>

      <main className="flex-1 px-4 pt-4 pb-8">
        {isLoading ? (
          <ListSkeleton />
        ) : totalCount === 0 ? (
          <FullEmptyState />
        ) : filtered.length === 0 ? (
          <ZeroMatchState search={search} onClear={() => setSearch("")} />
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => (
              <li key={r.id}>
                <RoutineRow routine={r} />
              </li>
            ))}
          </ul>
        )}
        {!isLoading && hasSearch && filtered.length > 0 ? (
          <p className="mt-4 text-center text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            {filtered.length} of {totalCount}
          </p>
        ) : null}
      </main>
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
