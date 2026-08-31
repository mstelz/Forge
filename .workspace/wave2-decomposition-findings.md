# Found while decomposing active.tsx — deliberately not fixed

The decomposition was a pure move, so none of these were touched. Each is a real
defect or duplication, written down here so the refactor stayed reviewable.

## 1. `lib/session/cursor.ts` is a tested implementation nobody calls

`computeNextCursor` and `countPlannedSlots` in `lib/session/cursor.ts` are covered
by 19 tests in `pages/workout/logger/__tests__/logger.test.tsx` and
`log-interactions.test.ts`. **The logger has never used them.** It used its own
private `deriveCursor`, which is now in `logger/structure.ts`.

They are not equivalent:

| | `deriveCursor` | `computeNextCursor` |
|---|---|---|
| No blocks at all | `null` | `null` |
| All slots resolved | `null` | `{ exhausted: true }` |
| Returns | indices only | indices **+** ids |

The logger conflates "nothing planned" with "everything done" — both render the
"All sets done" header, which is why a freeform session with zero exercises shows
"All sets done" before you have added anything.

This is exactly the failure the wave-2 brief describes: tests covering the module
either side of the seam, never the seam itself. Reconciling the two is a behaviour
change, so it wants its own change with its own tests.

## 2. Finishing a workout races its own redirect

`handleFinish` (now `logger/use-session-actions.ts`) does:

```
await finishSession(...)        // session is no longer active
await reconcileGoals(...)       // ← anything can happen here
navigate(`/workout/sessions/${id}`)
```

Meanwhile `useSessionData` holds:

```
if (!sessionLoading && !session) navigate("/workout/start", { replace: true })
```

The moment `finishSession` lands, the live-query invalidation refetches the active
session, gets `null`, and that redirect becomes eligible. Whether the user lands on
their session summary or is bounced to the start screen depends on whether
`reconcileGoals` outruns the refetch.

**Reproduced on `main` and on this branch, identically.** A short session goes to
the summary; a longer one with a superset and more logs went to `/workout/start`.
The fix is probably to navigate before reconciling, or to gate the redirect on not
having just finished — either is a behaviour change.

## 3. Two `useCallback`s omit deps they close over

`handleFinish` reads `isReopenEdit` and `originalEndedAt`; its deps are
`[session, finishing, navigate, showPageToast]`. `handleDiscardConfirmed` reads
`originalEndedAt` and omits it too.

Both are carried over verbatim with an `eslint-disable-line`, so the omission is at
least now visible. In practice `session` changes often enough to mask it, but
finishing a reopened session immediately after an "Edit time" change can use a
stale `originalEndedAt` and stamp the wrong `endedAt`.

## 4. Smaller things

- `SET_TYPE_CHIPS` was rebuilt on every render inside `BottomPanel`; it is a module
  constant now. No behaviour change, just noise removed.
- The arm-to-confirm delete in `ExerciseCard` cannot be triggered by two clicks in
  the same tick — the second reads the same render's `armedDelete`. Only matters to
  automated clicking, not to humans, but it makes the control awkward to test.
- `active.tsx` defined a local `LogSetType` duplicating the one in
  `shared/session-log.ts`. `logger/types.ts` now re-exports the shared one.
