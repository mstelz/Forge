import { test, expect } from "@playwright/test";

test("rest completion offers catch-up without moving dates until the workout finishes", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-08T12:00:00") });
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await page.evaluate(async () => {
    const path = "/db/forge-db.ts";
    const { forgeDB: db } = await import(path);
    const start = new Date(2026, 8, 7).getTime();
    await db.programRuns.clear();
    await db.sessions.clear();
    await db.routines.put({ id: "calendar-routine", name: "Calendar workout", blocks: [], createdAt: start, updatedAt: start });
    await db.programs.put({
      id: "calendar-program", name: "Calendar program", durationWeeks: 1,
      days: [0, 1, 2, 3, 4].map((dayIndex) => ({
        id: `calendar-day-${dayIndex}`, weekIndex: 0, dayIndex, order: 0,
        isRestDay: dayIndex === 1 || dayIndex === 3,
        routineId: dayIndex === 1 || dayIndex === 3 ? null : "calendar-routine", overrides: null,
      })), createdAt: start, updatedAt: start,
    });
    await db.programRuns.put({
      id: "calendar-run", programId: "calendar-program", status: "active",
      startedAt: start, weekZeroStartDate: start, endedAt: null, currentWeekIndex: 0, currentDayIndex: 1,
      dayStates: [{ id: "calendar-completed", weekIndex: 0, dayIndex: 0, status: "completed", sessionId: null, completedAt: start, updatedAt: start }],
      createdAt: start, updatedAt: start,
    });
  });
  await page.reload();
  const tuesday = () => page.getByRole("button", { name: /^Tuesday, September 8, 2026/ });
  const wednesday = () => page.getByRole("button", { name: /^Wednesday, September 9, 2026/ });
  const thursday = () => page.getByRole("button", { name: /^Thursday, September 10, 2026/ });
  await expect(tuesday()).toHaveAccessibleName(/rest day/);
  await expect(wednesday()).toHaveAccessibleName(/workout planned/);
  await wednesday().click();
  await expect(page.getByRole("dialog")).toContainText("Calendar workout");
  await expect(page.getByRole("dialog")).toContainText("Scheduled workout");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await tuesday().click();
  await page.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(page.getByText("Rest complete · Optional catch-up")).toBeVisible();
  await expect(tuesday()).toHaveAccessibleName(/rest completed/);
  await expect(wednesday()).toHaveAccessibleName(/workout planned/);
  await expect(thursday()).toHaveAccessibleName(/rest day/);
  await page.getByRole("button", { name: "Start Workout", exact: true }).click();
  await expect(page).toHaveURL(/\/workout\/active/);

  // Finish through the same persistence/reconciliation seam as the workout UI.
  await page.evaluate(async () => {
    const dbPath = "/db/forge-db.ts";
    const mutationsPath = "/db/mutations.ts";
    const reconcilePath = "/sync/program-run-reconciler.ts";
    const { forgeDB: db } = await import(dbPath);
    const { finishSession } = await import(mutationsPath);
    const { reconcileProgramRuns } = await import(reconcilePath);
    const session = await db.sessions.where("status").equals("in_progress").first();
    if (!session || session.sourceProgramDayIndex !== 2) throw new Error("Wrong catch-up workout");
    await finishSession({ ...session, status: "finished", endedAt: Date.now(), updatedAt: Date.now() });
    await reconcileProgramRuns();
  });
  await page.goto("/");
  await expect(tuesday()).toHaveAccessibleName(/workout completed/);
  await expect(wednesday()).toHaveAccessibleName(/rest day/);
  await expect(thursday()).toHaveAccessibleName(/workout planned/);
  await tuesday().click();
  await expect(page.getByRole("link", { name: "Open session" })).toBeVisible();
});
