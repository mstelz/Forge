import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useEquipmentItem } from "../../hooks/use-equipment";
import { forgeDB } from "../../db/forge-db";
import type { Exercise } from "../../../shared";

export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: equipment, isLoading } = useEquipmentItem(id);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    if (!id) return;
    forgeDB.exercises
      .filter((e) => e.equipmentIds.includes(id))
      .sortBy("name")
      .then(setExercises);
  }, [id]);

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (!equipment) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
        <p className="text-base font-semibold text-[var(--text)]">Equipment not found</p>
        <Link
          to="/equipment"
          className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]"
        >
          Back to equipment
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => navigate("/equipment")}
          aria-label="Back to equipment"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <BackIcon />
        </button>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Equipment
        </h1>
        <div className="w-9" />
      </header>

      <main className="flex-1 px-4 pb-8 pt-4 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)]">{equipment.name}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"}
          </p>
        </div>

        {exercises.length === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              No exercises use this equipment yet.
            </p>
            <Link
              to="/exercises/new"
              className="mt-3 inline-block text-sm font-semibold text-[var(--accent)]"
            >
              Create an exercise
            </Link>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">
              Exercises
            </p>
            <ul className="space-y-2">
              {exercises.map((ex) => (
                <li key={ex.id}>
                  <Link
                    to={`/exercises/${ex.id}`}
                    className="flex items-center gap-3 rounded-[var(--radius-card)] bg-[var(--surface)] px-3 py-3 hover:bg-[var(--surface-elevated)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition-colors"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-[var(--text)]">
                        {ex.name}
                      </span>
                      <span className="text-xs capitalize text-[var(--text-muted)]">
                        {ex.type}
                        {ex.primaryMuscles.length > 0
                          ? ` · ${ex.primaryMuscles[0]?.replace(/_/g, " ")}`
                          : ""}
                      </span>
                    </div>
                    <ChevronRightIcon />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="px-4 pt-4 space-y-4">
      <div className="h-4 w-20 animate-pulse rounded bg-[var(--surface)]" />
      <div className="h-8 w-1/2 animate-pulse rounded bg-[var(--surface)]" />
      <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface)]" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" />
        ))}
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-[var(--text-subtle)]"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
