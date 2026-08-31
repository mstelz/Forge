# Lane A — Settings & navigation polish

Four small, independent defects that happen to live in two files. Batching them
keeps the diff in one place.

**Owns:** `src/client/layouts/app-shell.tsx`, `src/client/pages/settings/index.tsx`
**Must not touch:** anything under `pages/workout/`, `components/toast*`

---

## A1 — Distance unit "m" silently displays as "km"

**Evidence:** `src/client/pages/settings/index.tsx:315`

```tsx
value={settings.distanceUnit === "m" ? "km" : settings.distanceUnit}
```

The control shows "km" while the stored value stays `"m"`. The user sees a setting
they never chose, and every distance in the app formats in metres behind a control
claiming kilometres. `Settings.distanceUnit` is `"m" | "km" | "mi"` but the
segmented control only offers two of the three.

**Fix:** decide whether `"m"` is a real user-facing choice.

- If it is, give it its own segment: `m / km / mi`.
- If it is not (likely — it exists for storage, and `distanceM` is the storage
  unit throughout), migrate any stored `"m"` to `"km"` on read so display and
  storage agree, and drop the coercion.

Either is fine; do not leave the control lying.

**Acceptance:** no code path where the rendered segment disagrees with
`settings.distanceUnit`. Add a test asserting the two agree for every enum value.

---

## A2 — Profile is unreachable from navigation

**Evidence:** `NAV_ITEMS` in `src/client/layouts/app-shell.tsx:24-33` has eight
entries; Profile is not among them. The route exists (`app.tsx`), and the only link
is the avatar on Home. `pages/settings/index.tsx` has a comment where the profile
section was deliberately removed.

**Fix:** add Profile to the drawer, next to Settings in the bottom group — it is a
destination of the same kind, not a top-level surface.

**Acceptance:** Profile reachable from the drawer on every screen.

---

## A3 — Drawer has no Escape handler and no focus trap

**Evidence:** `src/client/layouts/app-shell.tsx:36-92`. The drawer is a hand-rolled
`<div>` overlay: no `Escape` key handling (`grep -c Escape` returns 0), no focus
trap, no focus restoration, and no `aria-modal`. Opening it and pressing Tab walks
into the page behind it.

**Fix:** the app already depends on `@radix-ui/react-dialog`, which is used
elsewhere for exactly this and gives focus trap, Escape, scroll lock and correct
ARIA for free. Prefer converting the drawer to it over hand-rolling a trap.

Keep the visual result identical — same slide-out panel, same amber active state.

**Acceptance:** Escape closes it; Tab cycles within the panel; focus returns to the
hamburger on close; the overlay is `aria-modal`.

**Note:** the audit also flagged that starting a workout is two taps deep behind
this drawer. That is a navigation redesign, not a bug — out of scope here. Mention
it if you have an opinion, don't act on it.

---

## A4 — "Reset all data" scope is ambiguous

**Evidence:** `src/client/pages/settings/index.tsx` — `handleResetConfirm` calls
`forgeDB.close()` then `forgeDB.delete()`, which clears the local Dexie database
only. The dialog says "permanently delete … from this device", which is literally
true, but in an app that syncs it does not say what happens next: whether the
server still holds the data, and whether the next sync restores it or pushes the
deletion.

**Fix:** first find out what actually happens — read `src/client/sync/` and
`src/server/routes/sync.ts` and determine empirically whether a reset device
re-pulls its old data. Then either:

- make the copy state the real outcome precisely, or
- if the current behaviour is genuinely surprising (data silently returns), offer
  the choice: "Reset this device" vs "Delete everything everywhere".

**Acceptance:** the dialog's promise matches observed behaviour. Write down what
you found in the PR description — this is the kind of thing that gets re-discovered
every six months.
