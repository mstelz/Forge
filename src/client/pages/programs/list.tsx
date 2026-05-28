import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrograms } from "../../hooks/use-programs";
import { useActiveRuns, useFinishedRunsForProgram } from "../../hooks/use-program-runs";
import { deleteProgram } from "../../db/mutations";
import { queryKeys } from "../../db/query-keys";
import { ActiveProgramCard } from "./active-card";
import { DeleteProgramDialog } from "./delete-dialog";
import { FullEmptyState, ZeroMatchState, ListSkeleton } from "./empty-states";
import { useFilteredPrograms } from "./use-filtered-programs";
import type { Program } from "../../../shared";
import type { AppShellOutletContext } from "../../layouts/app-shell";

// ─── Other program row ─────────────────────────────────────────────────────────

function OtherProgramRow({
  program,
  onDelete,
}: {
  program: Program;
  onDelete: (program: Program) => void;
}) {
  const navigate = useNavigate();
  const { data: finishedRuns } = useFinishedRunsForProgram(program.id);
  const latestRun = finishedRuns?.[0] ?? null;

  let subtitle = `${program.durationWeeks} weeks · draft`;
  if (latestRun) {
    if (latestRun.endedAt) {
      const monthsAgo = Math.floor(
        (Date.now() - latestRun.endedAt) / (1000 * 60 * 60 * 24 * 30),
      );
      if (monthsAgo < 1) {
        subtitle = `${program.durationWeeks} weeks · completed recently`;
      } else {
        subtitle = `${program.durationWeeks} weeks · completed ${monthsAgo} month${monthsAgo === 1 ? "" : "s"} ago`;
      }
    } else {
      subtitle = `${program.durationWeeks} weeks · completed`;
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <button
        type="button"
        onClick={() => navigate(`/programs/${program.id}`)}
        className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
      >
        <p className="truncate text-sm font-semibold text-[var(--text)]">
          {program.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
          {subtitle}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onDelete(program)}
        aria-label={`More options for ${program.name}`}
        className="shrink-0 rounded-md p-1.5 text-[var(--text-subtle)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <KebabIcon />
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function ProgramListPage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);
  const qc = useQueryClient();

  const { data: programs, isLoading } = usePrograms();
  const { data: activeRuns } = useActiveRuns();

  // Programs that have an active run
  const activeProgramIds = new Set(activeRuns?.map((r) => r.programId) ?? []);

  // All other programs (no active run)
  const otherPrograms = programs?.filter((p) => !activeProgramIds.has(p.id));
  const filteredOther = useFilteredPrograms(otherPrograms, search);

  const totalCount = programs?.length ?? 0;
  const hasSearch = search.trim().length > 0;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteProgram(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.programs.all });
      qc.invalidateQueries({ queryKey: queryKeys.programRuns.all });
      setDeleteTarget(null);
    },
  });

  const handleDeleteRequest = (program: Program) => {
    // Guard: refuse to delete if this program has an active run
    if (activeProgramIds.has(program.id)) {
      alert("End the active run first before deleting this program.");
      return;
    }
    setDeleteTarget(program);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  };

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
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Programs
        </h1>
        <Link
          to="/programs/new"
          aria-label="Create program"
          className="rounded-md p-2 text-[var(--accent)] hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <PlusIcon />
        </Link>
      </header>

      {/* Search */}
      <div className="px-4 pb-2">
        <label className="relative block">
          <span className="sr-only">Search programs</span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
          >
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search programs"
            placeholder="Search programs"
            className="h-11 w-full rounded-[var(--radius-card)] bg-[var(--surface)] pl-10 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </label>
      </div>

      <main className="flex-1 px-4 pt-2 pb-8 space-y-4">
        {isLoading ? (
          <ListSkeleton />
        ) : totalCount === 0 ? (
          <FullEmptyState />
        ) : (
          <>
            {/* Active program cards */}
            {!hasSearch && activeRuns && activeRuns.length > 0 ? (
              <section className="space-y-2">
                {activeRuns.map((run) => {
                  const program = programs?.find((p) => p.id === run.programId);
                  if (!program) return null;
                  return <ActiveProgramCard key={run.id} program={program} run={run} />;
                })}
              </section>
            ) : null}

            {/* Other programs */}
            {otherPrograms && otherPrograms.length > 0 ? (
              <section>
                {!hasSearch && (activeRuns?.length ?? 0) > 0 ? (
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
                    Other Programs
                  </p>
                ) : null}

                {filteredOther.length === 0 && hasSearch ? (
                  <ZeroMatchState search={search} onClear={() => setSearch("")} />
                ) : (
                  <ul className="space-y-2">
                    {filteredOther.map((p) => (
                      <li key={p.id}>
                        <OtherProgramRow
                          program={p}
                          onDelete={handleDeleteRequest}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : hasSearch && filteredOther.length === 0 ? (
              <ZeroMatchState search={search} onClear={() => setSearch("")} />
            ) : null}
          </>
        )}
      </main>

      <DeleteProgramDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        programName={deleteTarget?.name ?? ""}
        onConfirm={handleDeleteConfirm}
        pending={deleteMutation.isPending}
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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}
