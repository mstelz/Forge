import { test, expect } from "@playwright/test";

/**
 * "Reset all data" only clears the local Dexie database. The server keeps its copy
 * and the reconcile pass that runs on the post-reset reload pulls it straight back
 * down, so a dialog promising permanent deletion is lying to the user.
 *
 * This test pins the copy to the behaviour: it fails if the wording starts
 * promising permanence again, and it also fails if the behaviour changes (a real
 * server-side delete, or a reconciler that stops restoring) without the wording
 * being revisited.
 *
 * Needs the API server as well as the client — `bun run dev`, not just `dev:client`.
 * The rest of the e2e suite is deliberately client-only, so skip when it is absent.
 */

/**
 * Counts rows in the app's own IndexedDB without disturbing it — checking the
 * database exists first, because a bare `indexedDB.open` would re-create the very
 * database the reset just destroyed and block Dexie from reopening it.
 */
async function countSessions(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const existing = await indexedDB.databases();
    if (!existing.some((d) => d.name === "forge")) return 0;
    return new Promise<number>((resolve) => {
      const req = indexedDB.open("forge");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("sessions")) {
          db.close();
          return resolve(0);
        }
        const count = db.transaction("sessions", "readonly").objectStore("sessions").count();
        count.onsuccess = () => {
          const result = count.result;
          db.close();
          resolve(result);
        };
        count.onerror = () => {
          db.close();
          resolve(0);
        };
      };
      req.onerror = () => resolve(0);
      req.onblocked = () => resolve(0);
    });
  });
}

test("the reset dialog's promise matches what a reset actually does", async ({ page }) => {
  await page.goto("/");
  const probe = await page.request.get("/api/v1/exercises");
  test.skip(!probe.ok(), "API server not running — start it with `bun run dev`");

  // Something worth losing: one logged set in one session.
  await page.goto("/workout/start");
  await page.getByRole("button", { name: /Freeform session/ }).click();
  await page.waitForURL(/\/workout\/active/);
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  await page.getByRole("button", { name: "Bench Press Chest · Barbell", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const fields = page.getByRole("textbox");
  await fields.nth(0).fill("60");
  await fields.nth(1).fill("5");
  await page.getByRole("button", { name: "LOG SET" }).click();
  await expect(page.getByRole("button", { name: /Set 1 — logged/ })).toBeVisible();

  // Wait for the flusher to mirror it to the server.
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/v1/sessions");
        const body = (await res.json()) as { sessions?: unknown[] };
        return body.sessions?.length ?? 0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  expect(await countSessions(page)).toBeGreaterThan(0);

  // The dialog must describe a device-local reset, not a permanent deletion.
  await page.goto("/settings");
  await page.getByRole("button", { name: /Reset this device/ }).click();
  const dialog = page.getByRole("dialog");
  const copy = (await dialog.innerText()).toLowerCase();
  expect(copy).toContain("server");
  expect(copy).not.toContain("cannot be undone");
  expect(copy).not.toContain("permanently");

  // The reset reloads the page only after `forgeDB.delete()` has resolved, so
  // waiting for that load is what proves the local database really was destroyed
  // before we start looking for the data coming back.
  const reloaded = page.waitForEvent("load");
  await dialog.getByRole("button", { name: "Reset this device", exact: true }).click();
  await reloaded;

  // The reload's reconcile pass pulls the server's copy back down — exactly what
  // the dialog now says will happen. The reset reloads the page, so tolerate the
  // execution context being torn down under the poll.
  await expect
    .poll(async () => countSessions(page).catch(() => 0), { timeout: 20_000 })
    .toBeGreaterThan(0);

  const after = await page.request.get("/api/v1/sessions");
  const body = (await after.json()) as { sessions?: unknown[] };
  expect(body.sessions?.length ?? 0).toBeGreaterThan(0);
});
