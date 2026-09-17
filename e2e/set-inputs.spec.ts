import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.abort());
  await page.goto('/workout/start');
  await page.getByRole('button', { name: /Freeform session/ }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { forgeDB } = await import('/db/forge-db.ts' as string);
    return forgeDB.exercises.count();
  })).toBeGreaterThan(2);
  await page.evaluate(async () => {
    const { forgeDB } = await import('/db/forge-db.ts' as string);
    const session = (await forgeDB.sessions.toArray())[0];
    const exercises = (await forgeDB.exercises.toArray()).filter((e: any) => e.type === 'strength').slice(0, 2);
    const items = exercises.map((e: any) => ({
      performedExerciseId: crypto.randomUUID(), sessionItemId: crypto.randomUUID(), exerciseId: e.id,
      setCount: 2, setTargets: [{ id: crypto.randomUUID(), reps: 8 }, { id: crypto.randomUUID(), reps: 8 }],
    }));
    await forgeDB.sessions.update(session.id, { liveStructure: JSON.stringify({ blocks: [{ id: crypto.randomUUID(), type: 'superset', items }] }) });
  });
  await page.reload();
  await expect(page.getByRole('textbox').first()).toBeVisible();
});

test('switching superset members clears metrics without history', async ({ page }) => {
  const fields = page.getByRole('textbox');
  await fields.nth(0).fill('80');
  await fields.nth(1).fill('12');
  await page.getByRole('button', { name: 'Set 1 — upcoming', exact: true }).click();
  await expect(fields.nth(0)).toHaveValue('');
  await expect(fields.nth(1)).toHaveValue('8');
});

test('logging a manually selected superset member advances away from that saved set', async ({ page }) => {
  await page.getByRole('button', { name: 'Set 1 — upcoming', exact: true }).click();
  await page.getByRole('textbox').nth(0).fill('20');
  await page.getByRole('textbox').nth(1).fill('8');
  await page.getByRole('button', { name: 'LOG SET', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set 1 — logged. Tap to edit.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'LOG SET', exact: true })).toBeVisible();
});

for (const kind of ['Drop', 'Rest-pause']) {
  test(`${kind} saves individual efforts as one set and restores them for editing`, async ({ page }) => {
    await page.getByRole('textbox').nth(0).fill('60');
    await page.getByRole('textbox').nth(1).fill('8');
    await page.getByRole('button', { name: kind, exact: true }).click();
    await page.getByRole('button', { name: kind === 'Drop' ? '+ Add drop' : '+ Add pause + reps', exact: true }).click();
    const suffix = kind === 'Drop' ? 'drop 1' : 'effort 2';
    await page.getByRole('textbox', { name: `Weight for ${suffix}`, exact: true }).fill('40');
    await page.getByRole('textbox', { name: `Reps for ${suffix}`, exact: true }).fill('5');
    if (kind === 'Rest-pause') await page.getByRole('textbox', { name: 'Pause seconds for effort 2' }).fill('25');
    await page.screenshot({ path: `/tmp/forge-${kind}.png`, fullPage: true });
    await page.getByRole('button', { name: 'LOG SET', exact: true }).click();
    const row = page.getByRole('button', { name: 'Set 1 — logged. Tap to edit.', exact: true });
    await expect(row).toContainText('40 kg × 5');
    if (kind === 'Rest-pause') await expect(row).toContainText('25s pause');
    await page.reload();
    await row.click();
    await expect(page.getByRole('textbox', { name: `Weight for ${suffix}`, exact: true })).toHaveValue('40');
    await expect(page.getByRole('textbox', { name: `Reps for ${suffix}`, exact: true })).toHaveValue('5');
    await page.getByRole('textbox', { name: `Reps for ${suffix}`, exact: true }).fill('6');
    await page.getByRole('button', { name: 'SAVE EDIT', exact: true }).click();
    await expect(row).toContainText('40 kg × 6');
    const stored = await page.evaluate(async () => {
      const { forgeDB } = await import('/db/forge-db.ts' as string);
      return forgeDB.sessionSetLogs.toArray();
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].segments).toEqual([{ weightKg: 40, reps: 6, pauseSec: kind === 'Drop' ? 0 : 25 }]);
  });
}

test('editing an older extra set updates that exact row', async ({ page }) => {
  for (const weight of ['30', '50']) {
    await page.getByRole('button', { name: 'ADD SET', exact: true }).first().click();
    await expect(page.getByText(`Turkish Get-up · Set ${weight === '30' ? 3 : 4}`, { exact: true })).toBeVisible();
    await page.getByRole('textbox').nth(0).fill(weight);
    await page.getByRole('textbox').nth(1).fill('5');
    await page.getByRole('button', { name: 'LOG SET', exact: true }).click();
    await expect(page.getByRole('button', { name: /Set \d+ — logged/ }).filter({ hasText: `${weight} kg × 5` })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Set 3 — logged. Tap to edit.', exact: true }).click();
  await expect(page.getByRole('textbox').nth(0)).toHaveValue('30');
  await page.getByRole('textbox').nth(0).fill('35');
  await page.getByRole('button', { name: 'SAVE EDIT', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set 3 — logged. Tap to edit.', exact: true })).toContainText('35 kg × 5');
  await expect(page.getByRole('button', { name: 'Set 4 — logged. Tap to edit.', exact: true })).toContainText('50 kg × 5');
});

test('each superset exercise loads its own previous values and keeps edits through refreshes', async ({ page }) => {
  await page.evaluate(async () => {
    const { forgeDB } = await import('/db/forge-db.ts' as string);
    const session = (await forgeDB.sessions.toArray())[0];
    const items = JSON.parse(session.liveStructure).blocks[0].items;
    await forgeDB.sessionSetLogs.bulkAdd(items.map((item: any, index: number) => ({
      id: crypto.randomUUID(), sessionId: crypto.randomUUID(), performedExerciseId: item.performedExerciseId,
      exerciseId: item.exerciseId, sessionItemId: item.sessionItemId, plannedSetId: null,
      order: 0, weightKg: index ? 20 : 80, reps: index ? 12 : 6, rpe: null, notes: null,
      durationSec: null, distanceM: null, setType: 'normal', status: 'logged', loggedAt: Date.now() - 86400000,
      restAfterSec: null, enteredWeight: null, enteredWeightUnit: null, enteredDistance: null, enteredDistanceUnit: null,
    })));
  });
  await page.reload();
  await expect(page.getByRole('textbox').nth(0)).toHaveValue('80');
  await expect(page.getByRole('textbox').nth(1)).toHaveValue('6');
  await page.getByRole('button', { name: /^A2\./ }).click();
  await expect(page.getByRole('textbox').nth(0)).toHaveValue('20');
  await expect(page.getByRole('textbox').nth(1)).toHaveValue('12');
  await page.getByRole('textbox').nth(0).fill('22');
  await page.evaluate(async () => {
    const { forgeDB } = await import('/db/forge-db.ts' as string);
    const session = (await forgeDB.sessions.toArray())[0];
    await forgeDB.sessions.update(session.id, { title: 'Refreshed workout', updatedAt: Date.now() });
  });
  await expect(page.getByRole('textbox').nth(0)).toHaveValue('22');
  await page.getByRole('button', { name: 'LOG SET', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set 1 — logged. Tap to edit.', exact: true })).toContainText('22 kg × 12');
});
