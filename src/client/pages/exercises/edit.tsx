import { Link, useNavigate, useParams } from "react-router";
import { useExercise } from "../../hooks/use-exercises";
import { updateExercise } from "../../db/mutations";
import type { Exercise } from "../../../shared";
import { ExerciseForm, exerciseToFormState } from "./form";

export function ExerciseEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: exercise, isLoading } = useExercise(id);

  const handleSubmit = async (record: Exercise) => {
    await updateExercise(record);
    navigate(`/exercises/${record.id}`);
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <Link
          to={id ? `/exercises/${id}` : "/exercises"}
          aria-label="Back"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <BackIcon />
        </Link>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
          Edit Exercise
        </h1>
        <span className="w-9" aria-hidden="true" />
      </header>
      <main className="flex-1 px-4 pt-2 pb-8">
        {isLoading ? (
          <FormSkeleton />
        ) : !exercise ? (
          <NotFound />
        ) : (
          <ExerciseForm
            mode="edit"
            initial={exerciseToFormState(exercise)}
            baseRecord={{
              id: exercise.id,
              createdAt: exercise.createdAt,
              lastUsedAt: exercise.lastUsedAt,
            }}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/exercises/${exercise.id}`)}
            submitLabel="Save"
          />
        )}
      </main>
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

function FormSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-9 w-full animate-pulse rounded bg-[var(--surface)]" />
      <div className="h-9 w-1/2 animate-pulse rounded bg-[var(--surface)]" />
      <div className="h-32 animate-pulse rounded bg-[var(--surface)]" />
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
