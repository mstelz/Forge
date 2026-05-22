import { Link, useNavigate, useParams } from "react-router";
import { updateGoal } from "../../db/mutations";
import { useGoal } from "../../hooks/use-goals";
import type { Goal } from "../../../shared/goals";
import { GoalForm, goalToFormState } from "./form";

export function GoalEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: goal, isLoading } = useGoal(id);

  const handleSubmit = async (record: Goal) => {
    // On edit, preserve original status/completedAt unless the form changes them
    const updated: Goal = {
      ...record,
      status: goal?.status ?? record.status,
      completedAt: goal?.completedAt ?? record.completedAt,
      createdAt: goal?.createdAt ?? record.createdAt,
    };
    await updateGoal(updated);
    navigate(`/goals/${record.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (!goal) {
    return (
      <>
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
          <Link
            to="/goals"
            aria-label="Back to goals"
            className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <BackIcon />
          </Link>
          <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Edit Goal</h1>
          <span className="w-9" />
        </header>
        <main className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
          <p className="text-base font-semibold text-[var(--text)]">Goal not found</p>
          <Link to="/goals" className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">
            Back to goals
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <Link
          to={`/goals/${goal.id}`}
          aria-label="Back to goal"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <BackIcon />
        </Link>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Edit Goal
        </h1>
        <span className="w-9" aria-hidden="true" />
      </header>
      <main className="flex-1 px-4 pt-2 pb-8">
        <GoalForm
          mode="edit"
          initial={goalToFormState(goal)}
          baseRecord={{ id: goal.id, createdAt: goal.createdAt }}
          onSubmit={handleSubmit}
          onCancel={() => navigate(`/goals/${goal.id}`)}
        />
      </main>
    </>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
