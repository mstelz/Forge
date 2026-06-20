import { test, expect } from "@playwright/test";

// Smoke net for the in-workout "Edit Structure" sheet (workout/edit-structure). Guards
// that the sheet opens over an active session and that a structural edit (add a set to a
// block) flows through to the live structure. Fresh context => empty IndexedDB => seed.

test("edit structure: opening the sheet and adding a set updates the block", async ({ page }) => {
  await page.goto("/workout/start");
  await page.getByRole("button", { name: /Freeform session/ }).click();
  await expect(page).toHaveURL(/\/workout\/active/);

  await page.getByRole("button", { name: "Add exercise" }).first().click();
  await page.getByRole("button", { name: "Bench Press Chest · Barbell", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // Open the edit-structure sheet from the overflow menu.
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Edit workout" }).click();

  const sheet = page.getByRole("dialog", { name: "Edit structure" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Bench Press")).toBeVisible();
  await expect(sheet.getByText("3 sets")).toBeVisible();

  // Add a set to the block via its options menu.
  await sheet.getByRole("button", { name: "Block options" }).click();
  await sheet.getByRole("button", { name: "+ Add set" }).click();

  await expect(sheet.getByText("4 sets")).toBeVisible();
});
