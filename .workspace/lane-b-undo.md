# Lane B — Undo for destructive actions

**The highest-value item left.** Forge has no undo anywhere; it has five separate
"this cannot be undone" dialogs instead. That taxes every deletion to guard against
the rare mistake, and still leaves the mistake unrecoverable when it happens.

**Owns:** `src/client/components/toast.tsx`, `toast-state.ts`, the four
delete dialogs and the pages that host them:
`pages/{exercises,routines,programs,equipment}/delete-dialog.tsx`,
`pages/equipment/list.tsx`, `pages/exercises/detail.tsx`,
`pages/programs/list.tsx`, `pages/routines/row.tsx`, `pages/goals/detail.tsx`

**Must not touch:** `pages/workout/active.tsx`, `pages/settings/index.tsx`,
`layouts/app-shell.tsx`

---

## Why now

PR #18 added a toast system (`components/toast.tsx`, `useToast`) with a tested
pure reducer in `toast-state.ts`. It is the natural host for an undo affordance, so
this is mostly wiring rather than new infrastructure.

## The shape

Replace *confirm-then-delete* with *delete-then-offer-undo* for anything
recoverable:

1. The action happens immediately — no dialog.
2. A toast appears: "Deleted <name>" with an **Undo** action.
3. If the user taps Undo inside the window, the entity comes back.
4. Otherwise it stays deleted.

Keep a confirm dialog **only** where undo is genuinely impossible. "Reset all data"
is the clear case; decide about the others on the evidence.

## Soft delete already exists — check before building anything

`RoutineSchema` carries `deletedAt` (`src/shared/routine.ts`), so routines are
already modelled for soft deletion. **Start by auditing which entities soft-delete
and which hard-delete** — read `src/client/db/mutations.ts` and the Drizzle schema.
Undo is trivial for soft-deleted rows (clear `deletedAt`) and needs real thought for
hard-deleted ones.

If an entity hard-deletes, prefer adding soft deletion over reconstructing the row
from a client-side snapshot — a snapshot will silently drop relations, and Forge
syncs, so a resurrected row with a new id would diverge across devices.

## Extending the toast system

`toast-state.ts` is a pure reducer with tests — extend it there, test-first. A
toast needs an optional action: a label and a callback. Watch these:

- **The undo window must outlive the default dismiss.** Current auto-dismiss is
  4.5s (`AUTO_DISMISS_MS`); errors never auto-dismiss. An actionable toast wants
  its own, longer, timeout.
- **Undo must be idempotent.** Double-tap, or tapping after the window closed,
  must not throw or create a duplicate.
- **Offline.** Forge queues writes through `src/client/sync/flusher.ts`. Confirm an
  undo issued while offline queues correctly and does not race the original delete.
  This is the part most likely to be subtly wrong — write a test for it.

## Acceptance

- Deleting an exercise, routine, program or equipment item shows an undo toast and
  the undo genuinely restores it, with its relations intact.
- Confirmation dialogs remain only where undo is impossible, and the audit of which
  is which is written down in the PR.
- Undo is safe to invoke twice, and safe offline.
- Tests cover: the reducer's action support, restore-after-delete for each entity
  type, idempotency, and the offline queue path.

## Out of scope

Undo for logged sets inside an active workout. That lives in `active.tsx` and
belongs to Wave 2 — do not touch it here.
