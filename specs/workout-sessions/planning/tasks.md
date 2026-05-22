# Task Breakdown: Workout Sessions (Live Logger)

## Overview

Workout Sessions is the third feature on top of Exercise Library and Routines, and follows the same end-to-end pattern: shared Zod first, then server (Drizzle + Hono), then client storage (Dexie + outbox extension), then UI surfaces (workout-start entrypoint, the live logger, mid-session structural edits, finish flow, post-finish detail, per-exercise history wiring), finishing with polish and a manual verification pass against the mockups.

The logger is the heaviest piece — it owns a stateless next-set cursor, superset round progression, persistent rest timer, full mid-session structural mutations (including superset reshape), and the orphan-log-as-extra rule.

Total Tasks: ~78 across 13 phases.

Visual references:
- `/home/mike/Development/Forge/design/logger-dark.png` (authoritative for live logger layout)
- `/home/mike/Development/Forge/design/logger-light.png` (light variant)
- `/home/mike/Development/Forge/design/workout-start.png` (entrypoint)
- `/home/mike/Development/Forge/design/history-detail.png` (post-finish session detail)
- `/home/mike/Development/Forge/design/exercise-detail.png` (per-exercise history wiring)

Authoritative spec: `/home/mike/Development/Forge/specs/workout-sessions/planning/spec.md`

Status legend: `[x]` done, `[~]` partial, `[ ]` not started.

---

## Phase status

- [x] Phase 1 — Drizzle schema + migration
- [x] Phase 2 — Shared Zod schemas + tests
- [x] Phase 3 — Hono routes (not manually curl-verified)
- [x] Phase 4 — Dexie + outbox + mutations + hooks + reconcile
- [x] Phase 5 — Cursor + Epley + pre-fill utilities + tests
- [x] Phase 6 — /workout/start entrypoint
- [x] Phase 7 — Logger page UI
- [x] Phase 8 — Mid-session structural edits (EditStructureSheet wired to overflow menu)
- [x] Phase 9 — Set logging interactions (9.2 skip, 9.4 ADD SET, 9.7 RPE all done; 9.8 numpad deferred)
- [x] Phase 10 — Finish flow + post-finish detail
- [x] Phase 11 — Per-exercise history wiring
- [ ] Phase 12 — Polish
- [ ] Phase 13 — Manual verification

---

## Phase 1: Drizzle schema + migration (`sessions`, `session_set_logs`)

**Dependencies:** Existing `src/db/schema.ts` (exercises, equipment, routines + children).

### 1.1 [x] Add `sessions` Drizzle table
- Columns per spec § Domain model — sessions: `id` (text PK), `status` (text NN — `'in_progress' | 'finished' | 'discarded'`), `sourceType` (text NN), `sourceRoutineId`, `sourceProgramId`, `sourceProgramWeekIndex` (int), `sourceProgramDayIndex` (int), `templateSnapshot` (text — JSON, nullable), `liveStructure` (text NN — JSON), `restTimer` (text — JSON, nullable), `title`, `notes`, `startedAt`, `endedAt`, `pausedAt` (`timestamp_ms` ints), `createdAt`, `updatedAt` (`timestamp_ms` NN).
- Indexes: `idx_sessions_status` on `status`, `idx_sessions_started_at` on `startedAt`, `idx_sessions_source_routine` on `sourceRoutineId`.
- Files: `src/db/schema.ts`.

### 1.2 [x] Add `session_set_logs` Drizzle table
- Columns per spec § Domain model — session_set_logs. FK `sessionId` → `sessions.id` `onDelete: 'cascade'`. `exerciseId` is a soft reference (no FK, matching `routine_items.exerciseId`).
- Fields: `id`, `sessionId`, `performedExerciseId`, `exerciseId`, `sessionItemId`, `plannedSetId` (nullable), `order` (int NN), `reps` (int), `weightKg` (real), `rpe` (real), `durationSec` (int), `distanceM` (real), `notes`, `setType` (text NN), `status` (text NN), `loggedAt` (`timestamp_ms` NN), `restAfterSec` (int), `enteredWeight` (real), `enteredWeightUnit` (text), `enteredDistance` (real), `enteredDistanceUnit` (text).
- Indexes: `idx_logs_session` on `sessionId`, `idx_logs_exercise_logged` on `(exerciseId, loggedAt)`, `idx_logs_session_performed` on `(sessionId, performedExerciseId, order)`, `idx_logs_planned_set` on `plannedSetId`.
- Files: `src/db/schema.ts`.

### 1.3 [x] Partial-unique index for single-active-session invariant
- Generated SQL must include a partial-unique index `idx_sessions_one_in_progress` on `status` `WHERE status = 'in_progress'`. If Drizzle's index DSL cannot express this directly, hand-edit the generated SQL migration to add the partial unique index.
- Server route in Phase 3 also enforces this at runtime as a fallback.
- Files: `src/db/schema.ts`, generated migration SQL.

### 1.4 [x] Generate and commit migration
- `bun run db:generate`; verify the two tables, FK cascade, and indexes (including the partial unique). `bun run db:migrate` runs cleanly against an existing DB containing exercise/equipment/routine tables.
- Files: `src/db/migrations/<timestamp>_*.sql`.

**Acceptance Criteria (Phase 1):** Fresh DB migrates cleanly; both tables exist; FK cascade verified by deleting a session and observing logs vanish; partial unique index rejects a second `in_progress` row.

---

## Phase 2: Shared Zod schemas (`session.ts`, `session-log.ts`)

**Dependencies:** Phase 1 conceptually; runtime independent. Imports `RoutineSchema` shape from `src/shared/routine.ts`.

### 2.1 [x] Define enums in `src/shared/session.ts`
### 2.2 [x] Define `RestTimerSchema`
### 2.3 [x] Define `LiveStructureItemSchema` / `LiveStructureBlockSchema` / `LiveStructureSchema`
- Slots use `id` (= plannedSetId) as the canonical identifier field throughout — both in the schema and in `start.tsx`/`active.tsx`. The DB log column remains `plannedSetId`.
### 2.4 [x] Define `SessionSchema`, `SessionCreateInput`, `SessionUpdateInput`, `SessionFinishInput`
### 2.5 [x] Define `SetTypeEnum`, `SessionLogStatusEnum` in `src/shared/session-log.ts`
### 2.6 [x] Define `SessionSetLogSchema`, `SessionSetLogCreateInput`, `SessionSetLogUpdateInput`
- Cross-field: weight-type setType requires reps>0 when logged; logged requires at least one metric; rpe half-step; enteredWeight/Unit paired nullability.
### 2.7 [x] Extend `PendingEntityEnum` with `'session'` and `'session_log'`
### 2.8 [x] Re-export from `src/shared/index.ts`
### 2.9 [x] Write focused schema tests — 13 tests in `src/shared/__tests__/session.test.ts`
### 2.10 [x] Tests pass

**Acceptance Criteria (Phase 2):** ✅

---

## Phase 3: Hono routes — `/api/v1/sessions` + sub-resource `/logs`

**Dependencies:** Phase 1, Phase 2.

### 3.1 [x] Scaffold session sub-router — `src/server/routes/sessions.ts`
### 3.2 [x] Implement `loadSession(id)` server-side helper
### 3.3 [x] Implement Sessions GET routes
### 3.4 [x] Implement `POST /sessions`
### 3.5 [x] Implement `PATCH /sessions/:id`
### 3.6 [x] Implement `POST /sessions/:id/finish`
### 3.7 [x] Implement `DELETE /sessions/:id`
### 3.8 [x] Implement Session Set Logs sub-resource routes
### 3.9 [ ] Manual curl verification — deferred

**Acceptance Criteria (Phase 3):** Routes implemented per spec; not curl-verified.

---

## Phase 4: Dexie mirror + outbox extension + repository + hooks

**Dependencies:** Phase 2, Phase 3.

### 4.1 [x] Add `sessions` and `sessionSetLogs` Dexie stores
### 4.2 [x] Implement transactional write helpers in `src/client/db/mutations.ts`
- `createSession`, `updateSession`, `finishSession`, `deleteSession`, `createSessionLog`, `updateSessionLog`, `deleteSessionLog`.
- `guardNotFinished` pre-write guard on all session/log mutations. `SessionFinishedError` typed error.
### 4.3 [x] Implement Dexie read helpers + query keys
- `getActiveSession`, `getSessionById`, `listSessions`, `listSessionLogs`, `listLogsForExercise`, `getLastLogForExercise`, `listAllSessionLogs`, `listFinishedSessions` (with range/routine/exercise/text filters).
### 4.4 [x] Wire `entity='session'` and `entity='session_log'` into the flusher
- `session.update` with `status='finished'` routes to `POST /finish` endpoint.
### 4.5 [~] Wire reconciliation for sessions and logs
- Sessions reconciled (pending-wins guard implemented). Session_set_logs NOT pulled during reconcile — v1 limitation documented in code.
### 4.6 [x] Tanstack Query hooks
- `useActiveSession`, `useSessions`, `useSessionLogs`, `useAllSessionLogs`, `useLastLogForExercise` — all with liveQuery invalidation.
### 4.7 [x] Write focused repository/flusher tests — 9 tests in `src/client/db/__tests__/session-mutations.test.ts`
### 4.8 [x] Tests pass

**Acceptance Criteria (Phase 4):** ✅ (log reconcile deferred to v2)

---

## Phase 5: Stateless cursor + 1RM + reuse-prior-values utilities

**Dependencies:** Phase 2, Phase 4.

### 5.1 [x] Implement stateless next-set cursor — `src/client/lib/session/cursor.ts`
- `computeNextCursor` and `countPlannedSlots`. Walk order: single by slotIndex; superset round-major.
- Note: `active.tsx` has its own local `deriveCursor` (returns `CursorPos | null`, not the full `Cursor` union) that it uses directly, matching slot `id` field (not `plannedSetId`).
### 5.2 [x] Implement Epley 1RM utility — `src/client/lib/session/epley.ts`
### 5.3 [x] Implement `getLastLogValuesForExercise` — `src/client/lib/session/prior-values.ts`
### 5.4 [x] Implement `summarizeSession` — `src/client/lib/session/summary.ts`
- Returns `{ totalVolumeKg, totalLoggedSets, prCount }`. Used in session-detail.tsx.
### 5.5 [x] Write focused utility tests — 9 tests in `src/client/lib/session/__tests__/cursor.test.ts`
### 5.6 [x] Tests pass

**Acceptance Criteria (Phase 5):** ✅

---

## Phase 6: `/workout/start` entrypoint + Resume/Discard/Cancel guard

**Dependencies:** Phase 4. Mockup `design/workout-start.png`.

### 6.1 [x] Register routes + drawer entry
### 6.2 [x] Top bar + page skeleton
### 6.3 [~] "From your program" card — intentionally hidden (deferred to Programs spec)
### 6.4 [x] "OR" divider + "RECENT ROUTINES" list
- `buildLiveStructure` in `start.tsx` mints fresh UUIDs; slots use `id` field (canonical).
### 6.5 [x] "Freeform session" row + "ALL ROUTINES >" footer
### 6.6 [~] Resume / Discard / Cancel guard
- Resume banner when active session exists. Discard available. Full Radix Dialog intercept (blocking a second start attempt) not implemented.

**Acceptance Criteria (Phase 6):** Substantially met; program card and full conflict dialog deferred.

---

## Phase 7: Logger page UI — header counter, exercise card, set rows, rest timer

**Dependencies:** Phase 4, Phase 5, Phase 6. Mockups `design/logger-dark.png` + `design/logger-light.png`.

### 7.1 [x] `/workout/active` route + page shell — `src/client/pages/workout/active.tsx`
### 7.2 [x] Header counter + overflow menu
- Header "Set N of M" implemented. Overflow menu has: **Edit workout** (opens EditStructureSheet), **Pause and leave** (sets `pausedAt` + navigates to `/workout/start`), **Finish Workout**, **Discard Workout**. "Add note" not yet implemented.
### 7.3 [x] Exercise card component (exercise name, superset label, round pip dots, last-time line)
### 7.4 [x] Set row component
- Placeholder (future), active (cursor accent), logged (green check), editing (accent border + "editing" label when tapped to re-edit).
### 7.5 [x] Rest timer strip + persistence
### 7.6 [x] Inline editor (weight/reps steppers, cardio duration/distance steppers, setType chips, note chip, LOG SET / SAVE EDIT CTA)
### 7.7 [x] Cursor exhaustion → FINISH WORKOUT + Add exercise button
### 7.8 [x] Logger UI tests — 10 tests in `src/client/pages/workout/logger/__tests__/logger.test.tsx`
### 7.9 [x] Tests pass

**Acceptance Criteria (Phase 7):** ✅ (Add note deferred)

---

## Phase 8: Mid-session structural edits (full scope, including superset reshape)

**Dependencies:** Phase 4, Phase 7.

### 8.1 [x] "Edit structure" bottom sheet — `src/client/pages/workout/edit-structure/index.tsx`
- `EditStructureSheet` wired to overflow menu "Edit workout" item. Drag-to-reorder with dnd-kit. Draft liveStructure; applied on Done with batched orphan log reclassification. Also accessible via quick "Add exercise" dashed button at bottom of logger scroll area.
### 8.2 [x] Add / remove / reorder / swap exercises — `exercise-ops.ts`
### 8.3 [x] Add / remove sets (single block) — `set-ops.ts`
### 8.4 [x] Add / remove rounds (superset) — `round-ops.ts`
### 8.5 [x] Add / remove exercises inside a superset — in `exercise-ops.ts`
### 8.6 [x] Split superset / convert single ↔ superset — `restructure-ops.ts`
### 8.7 [x] Cursor stability through structural edits
### 8.8 [x] Structural-edit tests — 4 tests in `src/client/pages/workout/edit-structure/__tests__/edits.test.ts`
### 8.9 [x] Tests pass

**Acceptance Criteria (Phase 8):** ✅

---

## Phase 9: Set logging interactions (log / skip / correct / extra-set, setType scope, inputs)

**Dependencies:** Phase 4, Phase 7.

### 9.1 [x] LOG SET interaction
- Creates log via `createSessionLog`; if slot already has a log, routes through `updateSessionLog` (correct-mode). Cursor advances on next render.
### 9.2 [x] Skip set interaction
- Skip button appears next to LOG SET when cursor is on an unlogged planned set (not extra, not correct-mode). Creates `status='skipped'` log with no reps/weight; cursor advances on next render.
### 9.3 [x] Correct-mode (tap a logged row to edit)
- Tapping a logged row shows "editing" label + accent border; form pre-fills from that log's values; LOG SET becomes SAVE EDIT; saving calls `updateSessionLog`. Rest timer not restarted.
### 9.4 [x] Add extra set
- "Add exercise" button (picker) works. Per-exercise "+ ADD SET" button in ExerciseCard now wired via `onAddSet` prop. Creates `status='extra'` log with `plannedSetId=null`; cursor placed on extra set with `isExtra: true` flag so Skip is hidden and LOG SET is shown directly.
### 9.5 [x] setType scope = single set only
### 9.6 [x] Cardio + duration / distance inputs
- Duration (±10 s, mm:ss display) and distance (±100 m) steppers shown for `type='cardio'` or `type='mixed'` exercises. Cardio shows instead of weight/reps; mixed shows all four.
### 9.7 [x] Notes + RPE inputs
- Notes chip (textarea) implemented. RPE stepper added to inline editor: 0–10 in 0.5 steps, same stepper pattern as weight/reps; included in `createSessionLog` / `updateSessionLog` calls; resets to null after each log.
### 9.8 [~] Mobile-first numpad + steppers
- Steppers implemented (h-11 w-11 tap targets). `inputmode="decimal"` not set. Shared `NumpadInput` component not created.
### 9.9 [x] `restAfterSec` back-fill at next log
- On LOG SET (new logs only, not edits), patches previous log's `restAfterSec` with clamped elapsed seconds via `updateSessionLog`.
### 9.10 [x] Logging interaction tests — 9 tests in `src/client/pages/workout/logger/__tests__/log-interactions.test.ts`
### 9.11 [x] Tests pass

**Acceptance Criteria (Phase 9):** Partially met — skip UI and ADD SET wiring remain.

---

## Phase 10: Finish flow + post-finish session detail page

**Dependencies:** Phase 4, Phase 5, Phase 7, Phase 9. Mockup `design/history-detail.png`.

### 10.1 [x] Finish workout confirm + flow
- `finishSession` called; navigates to `/workout/sessions/:id`. Replaced `window.confirm` with a Radix `Dialog`-based confirm ("Finish workout? This can't be undone." with Cancel + Finish buttons). Triggered from both overflow menu and FINISH WORKOUT CTA. Outbox routes to `/finish`.
### 10.2 [x] Post-finish detail page route + skeleton — `src/client/pages/workout/session-detail.tsx`
### 10.3 [x] Header block (title, date, duration)
### 10.4 [~] Three top metric tiles (VOLUME / SETS / PRs)
- All three rendered; VOLUME and SETS computed from logs; PRs from `summarizeSession` via `useAllSessionLogs`. Display layout present.
### 10.5 [x] Per-exercise summary blocks
- Logged set rows with weight × reps and green check implemented. EXTRA chip shown. Superset accent bars, cardio rows, "previous attempt" (post-swap) treatment not yet implemented.
### 10.6 [x] Footer (read-only notes, Export stub disabled, Done → history list)
### 10.7 [x] Strict immutability guards — `guardNotFinished` in mutations
### 10.8 [x] Finish-flow tests — 8 tests in `src/client/pages/workout/sessions/__tests__/detail.test.tsx`
### 10.9 [x] Tests pass

**Acceptance Criteria (Phase 10):** Substantially met; Radix confirm dialog, superset/cardio/previous-attempt rendering deferred.

---

## Phase 11: Per-exercise history wiring on `/exercises/:id`

**Dependencies:** Phase 4, Phase 5. Mockup `design/exercise-detail.png`.

### 11.1 [x] Wire EST 1RM tile
### 11.2 [x] Wire BEST SET tile
### 11.3 [x] Wire TOTAL SESSIONS tile
### 11.4 [x] Wire RECENT HISTORY list
### 11.5 [x] Empty-state preservation

**Acceptance Criteria (Phase 11):** ✅

---

## Phase 12: Polish

**Dependencies:** Phases 6–11.

### 12.1 [ ] Validation surfaces in logger + structural-edit sheet
### 12.2 [ ] Error states (offline writes blocked, 409 finished, in_progress conflict)
### 12.3 [ ] Empty states across logger, workout-start, post-finish
- Freeform empty state + "Add exercise" CTA implemented. Other empty states TBD.
### 12.4 [ ] Optimistic sync correctness review
### 12.5 [ ] Accessibility sweep
### 12.6 [ ] Mockup contrast + token audit
### 12.7 [ ] Outbox ordering correctness

**Acceptance Criteria (Phase 12):** Not started.

---

## Phase 13: Manual verification against mockups

**Dependencies:** All prior phases.

### 13.1 [ ] Manual test checklist (see spec for full list)

**Acceptance Criteria (Phase 13):** Not started.

---

## Remaining gaps (priority order for next session)

1. **Phase 12** — validation surfaces, error states (offline, 409, conflict), empty states, optimistic sync review, a11y sweep, mockup contrast audit, outbox ordering
2. **Phase 13** — manual verification against mockups
3. **9.8 numpad** — `inputmode="decimal"` not set; shared NumpadInput not created (deferred)
4. **6.6 Full conflict dialog** — resume banner exists; full Radix intercept for second start attempt not implemented
5. **4.5 log reconcile** — `session_set_logs` not pulled during reconcile (v1 limitation)
