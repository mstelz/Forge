# Wave 2 — Retire the "Show cardio" toggle

**Small task.** Include it with another Wave 2 branch if you prefer.

**Owns:** the `showCardio` setting end to end
**Must not touch:** unrelated parts of `active.tsx`; coordinate with the
decomposition branch

---

## The finding

`src/client/pages/settings/index.tsx:391` exposes a **Show cardio** switch. In
`active.tsx` it gates the duration and distance fields:

```tsx
const showDurationDistance =
  (currentExerciseType === "cardio" || currentExerciseType === "mixed") && showCardio;
```

The audit flagged this as cardio being "second-class by construction". PR #18 then
made cardio first-class: the routine schema plans it, `defaultItem` shapes defaults
for it, and the "Last time" hint speaks it.

That leaves a setting whose only function is to **hide the fields a cardio exercise
needs in order to be logged at all**. With it off, selecting a run gives you a form
that cannot record a run. The exercise's own `type` already carries this
information — the toggle is redundant at best and a trap at worst.

## The work

1. Remove the toggle from Settings.
2. Drive `showDurationDistance` from `currentExerciseType` alone.
3. Decide what happens to the stored field. `showCardio` is in `SettingsSchema`,
   the Drizzle schema, the sync route and the export registry. **Removing a synced
   field needs care** — an older client, or an export made before this change, may
   still carry it. Prefer leaving the column and the schema key in place (accepted,
   ignored) over a destructive migration. Check `src/server/routes/sync.ts` and
   `export-mappers.ts` before deciding.

## Before you delete it

Consider whether the toggle has a legitimate use you are about to remove: someone
who only lifts might genuinely want cardio hidden from the exercise picker and
filters. If that is the real intent, the honest version is a **library filter**,
not a switch that breaks logging. Either implement that or drop the idea
deliberately — but do not keep the current behaviour.

## Acceptance

- A cardio exercise always offers duration and distance fields.
- No setting can put the logger in a state where a cardio exercise cannot be
  logged.
- Existing stored settings and older exports still load without error — test this.
- If you keep a filtering feature, it filters and does not gate logging.
