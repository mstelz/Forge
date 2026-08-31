import { test, expect } from "@playwright/test";

// The navigation drawer and the settings segmented controls. Both are behaviours a
// node-env unit test cannot reach: focus containment, Escape handling and focus
// restoration only exist in a real browser, and the distance-unit round trip has to
// survive an actual reload out of IndexedDB to prove the control isn't coercing the
// stored value on the way to the screen.

const hamburger = (name = "Open navigation") => name;

test("Escape closes the drawer and returns focus to the hamburger", async ({ page }) => {
  await page.goto("/");

  const opener = page.getByRole("button", { name: hamburger() });
  await opener.click();

  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-modal", "true");

  // aria-modal is only honest if the rest of the page is actually hidden from
  // assistive tech while the drawer is open.
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");

  await page.keyboard.press("Escape");

  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Tab stays inside the open drawer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: hamburger() }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();

  // Walk further than the drawer has focusable children; a trapped focus wraps
  // around inside the panel instead of escaping to the page behind it.
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    const insideDrawer = await page.evaluate(() => {
      const active = document.activeElement;
      const panel = document.querySelector('[role="dialog"]');
      return !!panel && !!active && panel.contains(active);
    });
    expect(insideDrawer, `focus escaped the drawer after ${i + 1} tabs`).toBe(true);
  }
});

test("Profile is reachable from the drawer", async ({ page }) => {
  await page.goto("/exercises");

  await page.getByRole("button", { name: hamburger() }).click();
  await page.getByRole("link", { name: "Profile", exact: true }).click();

  await expect(page).toHaveURL(/\/profile$/);
});

test("choosing metres as the distance unit survives a reload", async ({ page }) => {
  await page.goto("/settings");

  const metres = page.getByRole("button", { name: "m", exact: true });

  // A tap that lands before the settings row has come out of Dexie is written
  // against the context defaults and then overwritten when the row arrives, so
  // retry the tap until it sticks. The assertion after the reload is the one
  // that matters.
  await expect(async () => {
    await metres.click();
    await expect(metres).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  // Let the Dexie write land, then prove the control reads back what was stored
  // rather than silently displaying a different unit.
  await page.waitForTimeout(500);
  await page.reload();

  await expect(page.getByRole("button", { name: "m", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "km", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
