import { test, expect } from "@playwright/test";

// The muscle map on the exercise page and the per-muscle set heatmap on a
// finished workout's summary. Fresh context each run, so the seed library loads.

test("exercise detail shows the muscles it works", async ({ page }) => {
  await page.goto("/exercises");
  await page.getByText("Bench Press", { exact: true }).first().click();

  const card = page.getByRole("region", { name: "Muscles worked" });
  await expect(card.getByRole("img", { name: "Primary: Chest. Secondary: Triceps, Shoulders" })).toBeVisible();
  if (process.env.MUSCLE_SHOTS) await card.screenshot({ path: `${process.env.MUSCLE_SHOTS}/exercise.png` });
});

test("a finished workout shows working sets per muscle", async ({ page }) => {
  await page.goto("/workout/start");
  await page.getByRole("button", { name: /Freeform session/ }).click();
  await expect(page).toHaveURL(/\/workout\/active/);

  await page.getByRole("button", { name: "Add exercise" }).first().click();
  await page.getByRole("button", { name: "Bench Press Chest · Barbell", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const fields = page.getByRole("textbox");
  await fields.nth(0).fill("60");
  await fields.nth(1).fill("5");
  await page.getByRole("button", { name: "LOG SET" }).click();
  await expect(page.getByRole("heading", { name: "Set 2 of 3" })).toBeVisible();
  await page.getByRole("button", { name: "LOG SET" }).click();
  await expect(page.getByRole("heading", { name: "Set 3 of 3" })).toBeVisible();

  const sessionId = await page.evaluate(async () => {
    const { forgeDB } = await import("/db/forge-db.ts" as string);
    return (await forgeDB.sessions.where("status").equals("in_progress").first())!.id as string;
  });
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Finish Workout" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect.poll(() => page.evaluate(async (id) => {
    const { forgeDB } = await import("/db/forge-db.ts" as string);
    return (await forgeDB.sessions.get(id))?.status;
  }, sessionId)).toBe("finished");
  await page.goto(`/workout/sessions/${sessionId}`);

  const card = page.getByRole("region", { name: "Muscles trained" });
  await expect(
    card.getByRole("img", { name: "Working sets by muscle: Chest 2, Triceps 1, Shoulders 1" }),
  ).toBeVisible();
  if (process.env.MUSCLE_SHOTS) await card.screenshot({ path: `${process.env.MUSCLE_SHOTS}/session.png` });
});
