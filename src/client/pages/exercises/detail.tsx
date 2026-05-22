import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useExercise } from "../../hooks/use-exercises";
import { useEquipment } from "../../hooks/use-equipment";
import { deleteExercise } from "../../db/mutations";
import { DetailHeader } from "./detail-header";
import { InstructionalCard } from "./instructional-card";
import { Instructions } from "./instructions";
import { ExerciseHistorySection } from "./history-placeholder";
import { DetailMenu } from "./detail-menu";
import { DeleteExerciseDialog } from "./delete-dialog";

export function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: exercise, isLoading } = useExercise(id);
  const { data: equipment } = useEquipment();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const equipmentById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof equipment>[number]>();
    for (const eq of equipment ?? []) m.set(eq.id, eq);
    return m;
  }, [equipment]);

  const onConfirmDelete = async () => {
    if (!id) return;
    setDeletePending(true);
    try {
      await deleteExercise(id);
      navigate("/exercises");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <Link
          to="/exercises"
          aria-label="Back to exercises"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <BackIcon />
        </Link>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Exercise
        </h1>
        {id && exercise ? (
          <DetailMenu exerciseId={id} onDelete={() => setDeleteOpen(true)} />
        ) : (
          <span className="w-9" aria-hidden="true" />
        )}
      </header>

      <main className="flex-1 space-y-4 px-4 pb-8 pt-2">
        {isLoading ? (
          <DetailSkeleton />
        ) : !exercise ? (
          <NotFound />
        ) : (
          <>
            <DetailHeader exercise={exercise} equipmentById={equipmentById} />
            <InstructionalCard
              videoUrl={exercise.videoUrls[0] ?? null}
              description={exercise.description ?? null}
            />
            <Instructions instructions={exercise.instructions ?? null} />
            <ExerciseHistorySection exerciseId={id!} />
          </>
        )}
      </main>

      {exercise ? (
        <DeleteExerciseDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          exerciseName={exercise.name}
          onConfirm={onConfirmDelete}
          pending={deletePending}
        />
      ) : null}
    </>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-base font-semibold text-[var(--text)]">Exercise not found</p>
      <Link
        to="/exercises"
        className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]"
      >
        Back to list
      </Link>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--surface)]" />
      <div className="h-9 w-3/4 animate-pulse rounded bg-[var(--surface)]" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--surface)]" />
      <div className="mt-4 h-32 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" />
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
