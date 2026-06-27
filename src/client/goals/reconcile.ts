import { forgeDB } from "../db/forge-db";
import { computeGoalProgress } from "./progress";
import type { Goal } from "../../shared/goals";
import type { SessionSetLog } from "../../shared";
import { uuidv4 as uuid } from "../lib/uuid";
import type { PendingWrite } from "../../shared";

/**
 * Invoked after a workout session is finished.
 * Recomputes progress for active goals;
 * flips status → 'completed' when threshold crosses >= 1.0.
 */
export async function reconcileGoals(finishedSessionId: string): Promise<void> {
  // Load all set logs for progress computation
  const allLogs: SessionSetLog[] = await forgeDB.sessionSetLogs.toArray();

  const activeGoals = await forgeDB.goals
    .where("status")
    .equals("active")
    .toArray();

  if (activeGoals.length === 0) return;

  const now = Date.now();
  const toUpdate: Goal[] = [];

  for (const goal of activeGoals) {
    const programRun = goal.category === "program" && goal.linkedProgramRunId
      ? await forgeDB.programRuns.get(goal.linkedProgramRunId)
      : undefined;
    const progress = computeGoalProgress(goal, {
      setLogs: allLogs,
      programRun,
      programDayStates: programRun?.dayStates,
    });

    if (progress.percent >= 1 && goal.status === "active") {
      const updated: Goal = {
        ...goal,
        status: "completed",
        completedAt: now,
        updatedAt: now,
      };
      toUpdate.push(updated);
    }
  }

  if (toUpdate.length === 0) return;

  // Persist all updates in one transaction
  await forgeDB.transaction("rw", forgeDB.goals, forgeDB.pendingWrites, async () => {
    for (const updated of toUpdate) {
      await forgeDB.goals.put(updated);

      const outboxEntry: PendingWrite = {
        id: uuid(),
        entity: "goal",
        op: "update",
        payload: updated,
        createdAt: now,
        retries: 0,
        lastError: null,
        status: "pending" as const,
      };
      await forgeDB.pendingWrites.add(outboxEntry);
    }
  });

  // Suppress unused variable warning — finishedSessionId is passed for context/logging
  void finishedSessionId;
}
