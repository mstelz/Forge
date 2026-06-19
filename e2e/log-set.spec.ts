import { test, expect } from "@playwright/test";

// Smoke net for the active-workout logging path (active.tsx BottomPanel). Guards the
// behavior a node-env unit test can't reach: committing a set to IndexedDB, the cursor
// advancing, prior-value prefill, and the rest timer starting. Each test gets a fresh
// browser context, so IndexedDB starts empty and the client re-hydrates from seed.

test("logging a set records it, advances the cursor, and starts the rest timer", async ({ page }) => {
  await page.goto("/workout/start");

  // Start a freeform session.
  await page.getByRole("button", { name: /Freeform session/ }).click();
  await expect(page).toHaveURL(/\/workout\/active/);

  // Add an exercise and accept the default set count.
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  await page.getByRole("button", { name: "Bench Press Chest · Barbell", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // Enter weight + reps. The panel has exactly two textboxes here: weight then reps.
  const fields = page.getByRole("textbox");
  await fields.nth(0).fill("60");
  await fields.nth(1).fill("5");

  await page.getByRole("button", { name: "LOG SET" }).click();

  // Set 1 is logged with the entered values.
  await expect(page.getByRole("button", { name: /Set 1 — logged/ })).toBeVisible();
  await expect(page.getByText("60 kg × 5")).toBeVisible();

  // The rest timer started.
  await expect(page.getByText("Rest", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause rest timer" })).toBeVisible();

  // The cursor advanced to set 2, prefilled from the prior set.
  await expect(page.getByRole("heading", { name: "Set 2 of 3" })).toBeVisible();
  await expect(fields.nth(0)).toHaveValue("60");
  await expect(fields.nth(1)).toHaveValue("5");
});
