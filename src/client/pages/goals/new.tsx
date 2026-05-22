import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { createGoal } from "../../db/mutations";
import type { Goal } from "../../../shared/goals";
import { GoalForm, emptyGoalFormState } from "./form";
import { uuidv4 as uuid } from "../../lib/uuid";

export function GoalNewPage() {
  const navigate = useNavigate();
  const baseRecord = useMemo(
    () => ({ id: uuid(), createdAt: Date.now() }),
    [],
  );

  const handleSubmit = async (record: Goal) => {
    await createGoal(record);
    navigate("/goals");
  };

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
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          New Goal
        </h1>
        <span className="w-9" aria-hidden="true" />
      </header>
      <main className="flex-1 px-4 pt-2 pb-8">
        <GoalForm
          mode="create"
          initial={emptyGoalFormState()}
          baseRecord={baseRecord}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/goals")}
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
