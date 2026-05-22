/**
 * program-run-reconciler.ts
 *
 * After a workout-session write finishes, joins sessions with
 * sourceType='program_day' back onto the matching program run's
 * day-state records. Auto-completes the run when all non-rest days
 * are completed or skipped.
 *
 * Idempotent — safe to call on app load and after each session mutation.
 */

import { forgeDB } from "../db/forge-db";
import { endProgramRun, updateProgramRun } from "../db/mutations";
import { uuidv4 as uuid } from "../lib/uuid";
import type { Program, ProgramRun, ProgramRunDayState } from "../../shared";

/**
 * Run the full reconciler pass.
 * - For every session with sourceType='program_day', upsert the matching
 *   program_run_day_states row based on session status.
 * - After each run mutation, check for auto-complete.
 */
export async function reconcileProgramRuns(): Promise<void> {
  try {
    const sessions = await forgeDB.sessions
      .where("sourceType")
      .equals("program_day")
      .toArray();

    // For each program-day session, find the active run for that program
    for (const session of sessions) {
      if (!session.sourceProgramId || session.sourceProgramWeekIndex == null || session.sourceProgramDayIndex == null) {
        continue;
      }

      const run = await forgeDB.programRuns
        .where("programId")
        .equals(session.sourceProgramId)
        .filter((r) => r.status === "active")
        .first();

      if (!run) continue;

      // Determine what status the day-state should be
      let targetStatus: ProgramRunDayState["status"];
      if (session.status === "finished") {
        targetStatus = "completed";
      } else if (session.status === "in_progress") {
        targetStatus = "active";
      } else {
        continue; // discarded or unknown — skip
      }

      const weekIndex = session.sourceProgramWeekIndex;
      const dayIndex = session.sourceProgramDayIndex;

      const existingStateIdx = run.dayStates.findIndex(
        (ds) => ds.weekIndex === weekIndex && ds.dayIndex === dayIndex,
      );

      let changed = false;
      let updatedRun: ProgramRun;

      if (existingStateIdx === -1) {
        // Create new day-state row
        const newDayState: ProgramRunDayState = {
          id: uuid(),
          weekIndex,
          dayIndex,
          status: targetStatus,
          sessionId: session.id,
          updatedAt: Date.now(),
        };
        updatedRun = {
          ...run,
          dayStates: [...run.dayStates, newDayState],
          updatedAt: Date.now(),
        };
        changed = true;
      } else {
        const existing = run.dayStates[existingStateIdx]!;
        // Only update if status needs changing, or sessionId needs linking
        if (existing.status !== targetStatus || existing.sessionId !== session.id) {
          const updated: ProgramRunDayState = {
            ...existing,
            status: targetStatus,
            sessionId: session.id,
            updatedAt: Date.now(),
          };
          const newDayStates = [...run.dayStates];
          newDayStates[existingStateIdx] = updated;
          updatedRun = {
            ...run,
            dayStates: newDayStates,
            updatedAt: Date.now(),
          };
          changed = true;
        } else {
          updatedRun = run;
        }
      }

      if (changed) {
        // Use low-level Dexie put (bypass guard since run is still active)
        await forgeDB.transaction(
          "rw",
          forgeDB.programRuns,
          forgeDB.pendingWrites,
          async () => {
            await forgeDB.programRuns.put(updatedRun);
            await forgeDB.pendingWrites.add({
              id: uuid(),
              entity: "program_run",
              op: "update",
              payload: updatedRun,
              createdAt: Date.now(),
              retries: 0,
              lastError: null,
            });
          },
        );

        // Check auto-complete after updating
        await maybeAutoCompleteRun(updatedRun);
      }
    }

    // Also null-out sessionIds for deleted sessions
    await nullOrphanedSessionIds();
  } catch (err) {
    console.warn("[program-run-reconciler] error", err);
  }
}

/**
 * If all non-rest days in the program have a day-state of 'completed' or
 * 'skipped', transition the run to status='completed'.
 */
async function maybeAutoCompleteRun(run: ProgramRun): Promise<void> {
  if (run.status !== "active") return;

  const program = await forgeDB.programs.get(run.programId);
  if (!program) return;

  const nonRestDays = getNonRestDays(program);
  if (nonRestDays.length === 0) return;

  const allResolved = nonRestDays.every(({ weekIndex, dayIndex }) => {
    const ds = run.dayStates.find(
      (s) => s.weekIndex === weekIndex && s.dayIndex === dayIndex,
    );
    return ds?.status === "completed" || ds?.status === "skipped";
  });

  if (allResolved) {
    await endProgramRun(run.id, "completed", Date.now());
  }
}

/**
 * Returns all (weekIndex, dayIndex) pairs that are non-rest days in the program.
 * Days that have a row with isRestDay=true are rest days.
 * Days that have a routineId assigned are non-rest workout days.
 * Unfilled days (no row) are treated as optional — not counted as non-rest
 * unless there's a routineId.
 */
function getNonRestDays(
  program: Program,
): { weekIndex: number; dayIndex: number }[] {
  return program.days.filter(
    (d) => !d.isRestDay && d.routineId != null,
  );
}

/**
 * For sessions that have been deleted, null out the sessionId in any
 * day-states that reference them.
 */
async function nullOrphanedSessionIds(): Promise<void> {
  const runs = await forgeDB.programRuns
    .where("status")
    .equals("active")
    .toArray();

  for (const run of runs) {
    let changed = false;
    const updatedDayStates = await Promise.all(
      run.dayStates.map(async (ds) => {
        if (!ds.sessionId) return ds;
        const session = await forgeDB.sessions.get(ds.sessionId);
        if (session) return ds;
        // Session was deleted — null the sessionId
        changed = true;
        return { ...ds, sessionId: null, updatedAt: Date.now() };
      }),
    );

    if (changed) {
      const updatedRun: ProgramRun = {
        ...run,
        dayStates: updatedDayStates,
        updatedAt: Date.now(),
      };
      await forgeDB.transaction(
        "rw",
        forgeDB.programRuns,
        forgeDB.pendingWrites,
        async () => {
          await forgeDB.programRuns.put(updatedRun);
          await forgeDB.pendingWrites.add({
            id: uuid(),
            entity: "program_run",
            op: "update",
            payload: updatedRun,
            createdAt: Date.now(),
            retries: 0,
            lastError: null,
          });
        },
      );
    }
  }
}

/**
 * Exported helper for Phase 8: auto-complete check after skip/unskip.
 * Call after any updateProgramRun that changes day-state status.
 */
export async function checkAutoComplete(runId: string): Promise<void> {
  const run = await forgeDB.programRuns.get(runId);
  if (run) {
    await maybeAutoCompleteRun(run);
  }
}
