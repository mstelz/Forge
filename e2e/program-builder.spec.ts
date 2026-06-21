import { test, expect } from "@playwright/test";

// Integration smoke for the program builder (programs/builder) and the program detail
// page (programs/detail) — the two flows have no seed data, so this create→view path is
// the natural way to exercise both. Fresh context => empty IndexedDB => seed (no programs).

test("create a program in the builder, then view it on the detail page", async ({ page }) => {
  await page.goto("/programs/new");

  await page.getByPlaceholder("e.g. Hypertrophy 12").fill("E2E Builder Program");

  // Duration stepper: 4 -> 5 weeks (exercises the week-grid re-render).
  await page.getByRole("button", { name: "Increase weeks" }).click();

  await page.getByRole("button", { name: "Save" }).click();

  // Lands back on the program list with the new program present.
  await expect(page).toHaveURL(/\/programs$/);
  // Anchor on the program name so this matches the card, not the "More options for…" button.
  const card = page.getByRole("button", { name: /^E2E Builder Program \d+ weeks/ });
  await expect(card).toBeVisible();
  await expect(page.getByText("5 weeks · draft")).toBeVisible();

  // Open detail; the schedule grid (extracted ScheduleGrid) renders all 5 weeks.
  await card.click();
  await expect(page).toHaveURL(/\/programs\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "E2E Builder Program" })).toBeVisible();
  await expect(page.getByText("5 weeks")).toBeVisible();
  await expect(page.getByText("Week 05")).toBeVisible();
});
