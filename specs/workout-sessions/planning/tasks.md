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

### 1.3 [ ] Partial-unique index for single-active-session invariant
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
- `SessionSourceTypeEnum = z.enum(['routine','program_day','freeform'])`.
- `SessionStatusEnum = z.enum(['in_progress','finished','discarded'])`.
- `RestTimerStatusEnum = z.enum(['idle','running','paused'])`.
- Files: `src/shared/session.ts` (new).

### 2.2 [x] Define `RestTimerSchema`
- `{ status: RestTimerStatusEnum, startedAt: int().nullable(), durationSec: int().min(0).max(3600), pausedAt: int().nullable(), remainingSec: int().nullable() }`.
- Cross-field: `status='running'` requires `startedAt`; `status='paused'` requires `pausedAt` + `remainingSec`.
- Files: `src/shared/session.ts`.
- Depends on: 2.1.

### 2.3 [x] Define `LiveStructureItemSchema` / `LiveStructureBlockSchema` / `LiveStructureSchema`
- Mirrors `RoutineSchema` shape. Adds `performedExerciseId: uuid` per item, `sessionItemId: uuid` per item, `plannedSetId: uuid` per slot.
- `setTargets[]` is ALWAYS materialized (length === `setCount`) for predictability — even when modes are `uniform`. Each entry includes `id` (= `plannedSetId`), `order`, `reps`/`repsMin`/`repsMax`, `rpe`, `setType`, optional `techniqueNotes`, optional `restSec`.
- Block-level fields `type`, `roundCount` (supersets), `restSec`, `tempo`, `notes` carry over from `RoutineBlockSchema`.
- Files: `src/shared/session.ts`.
- Depends on: 2.1.

### 2.4 [x] Define `SessionSchema`, `SessionCreateInput`, `SessionUpdateInput`, `SessionFinishInput`
- `SessionSchema`: `{ id, status, sourceType, sourceRoutineId?, sourceProgramId?, sourceProgramWeekIndex?, sourceProgramDayIndex?, templateSnapshot?: nullable RoutineSchema clone, liveStructure: LiveStructureSchema, restTimer?: RestTimerSchema | null, title?, notes? (max 2000), startedAt, endedAt?, pausedAt?, createdAt, updatedAt }`.
- `SessionCreateInput`: `sourceType` required; conditional refinements (`'routine'` requires `sourceRoutineId`; `'program_day'` requires `sourceProgramId` + week/day indices; `'freeform'` requires all source fields null and `templateSnapshot=null` and `liveStructure.blocks=[]`).
- `SessionUpdateInput`: full document; rejects when caller passes `status='finished'` (server enforces immutability — see 3.5).
- `SessionFinishInput`: `{ endedAt: int() }`.
- Files: `src/shared/session.ts`.
- Depends on: 2.2, 2.3.

### 2.5 [x] Define `SetTypeEnum`, `SessionLogStatusEnum` in `src/shared/session-log.ts`
- `SetTypeEnum = z.enum(['normal','warmup','drop','failure','amrap','rest_pause'])` — extends routines' set-type enum with `'warmup'` and `'failure'`.
- `SessionLogStatusEnum = z.enum(['logged','skipped','extra'])`.
- Files: `src/shared/session-log.ts` (new).

### 2.6 [~] Define `SessionSetLogSchema`, `SessionSetLogCreateInput`, `SessionSetLogUpdateInput`
- Full record per spec § Domain model — session_set_logs.
- Cross-field rules:
  - `status='logged'` AND `setType ∈ {'normal','drop','amrap','failure'}` AND `weightKg` present → `reps` must be > 0.
  - `status='logged'` requires at least one of (`weightKg` and `reps>0`) OR (`durationSec>0`) OR (`distanceM>0`) to support cardio-only sets.
  - `enteredWeight` and `enteredWeightUnit` must be both null or both set; same for `enteredDistance`/`enteredDistanceUnit`.
  - `rpe` half-step `1.0-10.0` (`refine n*2 === Math.round(n*2)`).
  - SI canonical: `weightKg` in kg, `distanceM` in meters, `durationSec` in seconds.
- `SessionSetLogCreateInput`: client-supplied `id`, `sessionId` accepted in body but path takes precedence server-side.
- `SessionSetLogUpdateInput`: full record.
- Files: `src/shared/session-log.ts`.
- Depends on: 2.5.

### 2.7 [x] Extend `PendingEntityEnum` with `'session'` and `'session_log'`
- Extend `src/shared/pending-write.ts` `entity` enum. No structural change to `PendingWriteSchema`.
- Files: `src/shared/pending-write.ts`.

### 2.8 [x] Re-export from `src/shared/index.ts`
- Add `session.ts` and `session-log.ts` exports so `import { SessionSchema, SessionSetLogSchema, type Session, type SessionSetLog } from '@/shared'` works on both client and server.
- Files: `src/shared/index.ts`, `src/shared/types.ts`.

### 2.9 [ ] Write 4 focused schema tests
- Limit to 4 highly focused tests:
  1. Valid `SessionCreateInput` for each `sourceType` parses; cross-field refinements reject mismatches (e.g., `freeform` with a `sourceRoutineId`).
  2. `LiveStructureSchema` materializes per-set `setTargets` with dense `order` and unique UUIDs; rejects mismatched `setCount` vs `setTargets.length`.
  3. `SessionSetLogSchema` accepts a strength log AND a cardio-only log; rejects a `status='logged'` row with no metrics; rejects a half-step-violating RPE.
  4. `PendingEntityEnum` accepts `'session'` and `'session_log'`; existing exercise/routine entries still parse.
- Files: `src/shared/__tests__/session.test.ts` (or wherever existing shared tests live).

### 2.10 [ ] Run schema tests
- Run ONLY the 4 tests written in 2.9. Do NOT run the entire suite.

**Acceptance Criteria (Phase 2):** All 4 schema tests pass; spec § Zod schemas requirements covered; no Dexie/Drizzle/Hono imports in `src/shared`.

---

## Phase 3: Hono routes — `/api/v1/sessions` + sub-resource `/logs`

**Dependencies:** Phase 1, Phase 2.

### 3.1 [x] Scaffold session sub-router
- Create `src/server/routes/sessions.ts` mounted from `src/server/routes/api.ts` under `/sessions`. Reuse `src/server/lib/errors.ts` shape.
- Done when: `GET /api/v1/sessions` returns `200 { sessions: [] }` against an empty DB.
- Files: `src/server/routes/api.ts`, `src/server/routes/sessions.ts` (new).

### 3.2 [x] Implement `loadSession(id)` server-side helper
- Reads the `sessions` row, parses `templateSnapshot` / `liveStructure` / `restTimer` JSON columns into objects, returns the nested `Session`.
- Files: `src/server/routes/sessions.ts` or `src/server/lib/session-loader.ts` (new).

### 3.3 [x] Implement Sessions GET routes
- `GET /sessions` → `200 { sessions: Session[] }` ordered by `startedAt DESC` server-side.
- `GET /sessions/:id` → `200 Session` | `404 { error: 'not_found' }`.
- Depends on: 3.2.

### 3.4 [x] Implement `POST /sessions`
- Body validated with `SessionCreateInput`. Pre-check: if any row has `status='in_progress'`, return `409 { error: 'in_progress_exists', id }`. On id collision return `409 { error: 'id_conflict', id }`.
- Server stamps `status='in_progress'`, `startedAt`/`createdAt`/`updatedAt` if absent.
- `201 Session` | `400 validation` | `409`.
- Depends on: 3.3.

### 3.5 [x] Implement `PATCH /sessions/:id`
- Body validated with `SessionUpdateInput` (full document; mutates `liveStructure`, `title`, `notes`, `restTimer`, `pausedAt`).
- Reject with `409 { error: 'finished' }` if existing row has `status='finished'`.
- `200` | `404` | `400` | `409`.
- Bumps `updatedAt = max(body.updatedAt, Date.now())`.
- Depends on: 3.3.

### 3.6 [x] Implement `POST /sessions/:id/finish`
- Body: `{ endedAt }`. Server stamps `status='finished'`, `endedAt`, clears `restTimer = null`. Returns `200 Session` | `404` | `409 finished` (idempotent on already-finished — return current row with `200`? — spec says reject as `409 finished`; honor that).
- Depends on: 3.3.

### 3.7 [x] Implement `DELETE /sessions/:id`
- `204` (idempotent). Hard-deletes session + cascades all child logs.

### 3.8 [x] Implement Session Set Logs sub-resource routes
- `GET /sessions/:id/logs` → `200 { logs: SessionSetLog[] }` ordered by `loggedAt ASC`.
- `POST /sessions/:id/logs` — body `SessionSetLogCreateInput` (client `id`); reject `409 finished` if parent finished; `409 id_conflict` on collision.
- `PATCH /sessions/:id/logs/:logId` — body `SessionSetLogUpdateInput` (full record); `409 finished` if parent finished.
- `DELETE /sessions/:id/logs/:logId` → `204` (idempotent); `409 finished` if parent finished.
- Files: `src/server/routes/sessions.ts` (or new `sessions-logs.ts` child router).

### 3.9 [ ] Manual curl verification
- `bun run dev` then exercise: create freeform session, PATCH `liveStructure`, POST a log, PATCH the log, finish the session, attempt a PATCH on a finished session (expect 409 finished), DELETE the session.

**Acceptance Criteria (Phase 3):** All endpoints return spec-conformant status codes and bodies; PATCH replaces session document transactionally; finish stamps status and clears `restTimer`; finished sessions reject all mutations with `409 finished`; partial-unique-index path returns `409 in_progress_exists`.

---

## Phase 4: Dexie mirror + outbox extension + repository + hooks

**Dependencies:** Phase 2, Phase 3.

### 4.1 [x] Add `sessions` and `sessionSetLogs` Dexie stores
- Bump `forge-db.ts` Dexie version. Add:
  - `sessions` (keyPath `id`; indexes `status`, `startedAt`, `sourceRoutineId`) — full nested document per row.
  - `sessionSetLogs` (keyPath `id`; indexes `sessionId`, `[exerciseId+loggedAt]`, `[sessionId+performedExerciseId+order]`, `plannedSetId`).
- Files: `src/client/db/forge-db.ts`.

### 4.2 [~] Implement transactional write helpers in `src/client/db/mutations.ts`
- `createSession(session)`, `updateSession(session)`, `finishSession(id, endedAt)`, `deleteSession(id)`. Each is ONE Dexie transaction touching `sessions` + `pendingWrites`.
- `finishSession` mutates the local row to `status='finished'`, `endedAt`, `restTimer=null`, then enqueues an `entity='session'`, `op='update'` outbox entry carrying the finished record. (Server-side `/finish` is invoked by the flusher; see 4.4.)
- `createSessionLog(log)`, `updateSessionLog(log)`, `deleteSessionLog({id, sessionId})`. Each is ONE Dexie transaction touching `sessionSetLogs` + `pendingWrites` with `entity='session_log'`.
- Pre-write guard on every helper: refuse to mutate a session with `status='finished'` (throw a typed error consumed by UI).
- Files: `src/client/db/mutations.ts`.
- Depends on: 4.1.

### 4.3 [~] Implement Dexie read helpers + query keys
- `getActiveSession()` (returns the at-most-one row with `status='in_progress'`).
- `getSessionById(id)`, `listFinishedSessions()` (ordered by `startedAt` DESC), `listLogsBySession(sessionId)`, `listLogsByExercise(exerciseId)` (ordered by `loggedAt` DESC), `getLastLogForExercise(exerciseId)` (most recent `status='logged'` row — used for `last time` line and pre-fill).
- Files: `src/client/db/queries.ts`, `src/client/db/query-keys.ts`.
- Depends on: 4.1.

### 4.4 [~] Wire `entity='session'` and `entity='session_log'` into the flusher
- Extend `src/client/sync/flusher.ts` dispatch:
  - `session.create` → `POST /api/v1/sessions`. `201` drop entry; `409 in_progress_exists` → surface to UI (pause flushing of session entries until UI resolves; do NOT drop).
  - `session.update` → if outgoing payload has `status='finished'`, route to `POST /api/v1/sessions/:id/finish` with `{ endedAt }` and drop on `200`/`409 finished`/`404`. Otherwise `PATCH /api/v1/sessions/:id`. `409 finished` → drop entry (server is the truth).
  - `session.delete` → `DELETE /api/v1/sessions/:id` (server cascades; no per-log delete entries needed for discard).
  - `session_log.create` → `POST /api/v1/sessions/:sessionId/logs`. Drop on `201`/`409 id_conflict`/`409 finished`/`404`.
  - `session_log.update` → `PATCH .../logs/:logId`. Drop on `200`/`409 finished`/`404`.
  - `session_log.delete` → `DELETE .../logs/:logId`. Drop on `204`/`409 finished`/`404`.
- Files: `src/client/sync/flusher.ts`.

### 4.5 [ ] Wire reconciliation (pull) for sessions and logs
- Extend `src/client/sync/reconcile.ts`: GET `/api/v1/sessions`; for each non-finished local session, also GET `/api/v1/sessions/:id/logs`. Apply merge rules:
  - For sessions with `status='finished'` server-side: server replaces local unconditionally (immutability) once the outbox has drained for that id.
  - For non-finished: pending-wins guard — if any outbox entry exists for that session id (or its child logs), keep local; else server replaces local.
- Files: `src/client/sync/reconcile.ts`.

### 4.6 [~] Tanstack Query hooks
- `useActiveSession()`, `useSession(id)`, `useFinishedSessions()`.
- `useSessionLogs(sessionId)` (live), `useExerciseLogs(exerciseId)` (live, used by per-exercise history wiring), `useLastLogForExercise(exerciseId)` (used by last-time line + pre-fill).
- Files: `src/client/hooks/use-session.ts` (new), `src/client/hooks/use-session-logs.ts` (new).
- Depends on: 4.3.

### 4.7 [ ] Write 4 focused repository/flusher tests
- Limit to 4 highly focused tests:
  1. `createSession` writes both `sessions` and `pendingWrites` rows in one transaction; rollback on failure.
  2. `finishSession` mutates local status to `'finished'`, clears `restTimer`, and enqueues exactly one update entry.
  3. Flusher routes a `session.update` with `status='finished'` to the `/finish` endpoint, not `PATCH`.
  4. Pre-write guard blocks `createSessionLog` against a finished parent (throws typed error).
- Files: `src/client/db/__tests__/session-mutations.test.ts` (or wherever existing client tests live).

### 4.8 [ ] Run repository tests
- Run ONLY the 4 tests written in 4.7.

**Acceptance Criteria (Phase 4):** Console-driven `createSession` round-trips through outbox to a running server; finish flow routes to `/finish`; reconcile preserves pending writes.

---

## Phase 5: Stateless cursor + 1RM + reuse-prior-values utilities

**Dependencies:** Phase 2, Phase 4.

### 5.1 [~] Implement stateless next-set cursor (`computeNextCursor`)
- Pure function: `(liveStructure, logs) => { performedExerciseId, sessionItemId, plannedSetId, blockIndex, itemIndex, roundIndex, slotIndex, exhausted: boolean }` or `null` when no slots exist.
- Algorithm: walk planned slots in render order (single block: by `slotIndex`; superset block: round-major — A1@r1, A2@r1, …, A1@r2, …). Skip slots that already have a log row with `status ∈ {'logged','skipped'}` matching `performedExerciseId` + `plannedSetId`. The cursor is the lowest such unresolved slot. If none, `exhausted=true`.
- Total planned slots derivation also lives here (excludes extras).
- Files: `src/client/lib/session/cursor.ts` (new).

### 5.2 [~] Implement Epley 1RM utility (`epley`)
- `epley(weightKg, reps) = weightKg * (1 + reps / 30)`.
- `bestEpleyForExercise(logs, exerciseId)` → returns `{ weightKg, reps, epley1RM, logId } | null` over eligible logs (`status='logged'` AND `setType='normal'` AND `reps>0` AND `weightKg>0`).
- Files: `src/client/lib/session/epley.ts` (new).

### 5.3 [~] Implement `getLastLogValuesForExercise` (pre-fill helper)
- `(exerciseId) => { weightKg?, reps?, rpe?, durationSec?, distanceM? } | null` from the most recent `status='logged'` row for that exercise in Dexie. Used by both the "last time" line on the exercise card and the inline editor pre-fill.
- Files: `src/client/lib/session/prior-values.ts` (new).
- Depends on: 4.3.

### 5.4 [~] Implement `summarizeSessionForHistory` (totals helpers)
- For the post-finish detail view: `totalVolumeKg`, `totalLoggedSets`, `prCount` (count of distinct exerciseIds where this session set a new Epley peak vs all prior sessions).
- Files: `src/client/lib/session/summary.ts` (new).

### 5.5 [ ] Write 4 focused utility tests
- Limit to 4:
  1. Cursor walks superset by round (A1@r1 → A2@r1 → A1@r2) and skips logged + skipped slots.
  2. Cursor returns `exhausted=true` when all planned slots resolved (extras excluded from total).
  3. `bestEpleyForExercise` excludes warmup/drop/amrap/failure/rest_pause/skipped/extra/cardio rows.
  4. `getLastLogValuesForExercise` returns the single most recent logged row, ignoring extras.
- Files: `src/client/lib/session/__tests__/cursor.test.ts`, etc.

### 5.6 [ ] Run utility tests
- Run ONLY the 4 tests written in 5.5.

**Acceptance Criteria (Phase 5):** Cursor and 1RM behave per spec § Logger UX and § 1RM Epley estimation.

---

## Phase 6: `/workout/start` entrypoint + Resume/Discard/Cancel guard

**Dependencies:** Phase 4. Mockup `design/workout-start.png`.

### 6.1 [x] Register routes + drawer entry
- Add `/workout/start` (entrypoint), `/workout/active` (logger — phases 7–10), `/workout/sessions/:id` (post-finish detail — phase 10) to the router. Add drawer-nav "Start workout".
- Files: router config, `src/client/layouts/app-shell.tsx` (drawer), `src/client/pages/workout/start.tsx` (new).

### 6.2 [x] Top bar + page skeleton
- Top bar: hamburger, amber "START WORKOUT" title.
- Files: `src/client/pages/workout/start.tsx`.

### 6.3 [~] "From your program" card (hidden when no program)
- Surfaces when v1 has any program data wired (it does not — feature gated; render hidden by default with a TODO comment for the programs slice).
- When visible: routine name, week/day subtitle, 5-row exercise summary, estimated duration chip, primary amber **START PLANNED** CTA. Tapping POSTs a session with `sourceType='program_day'`.
- Files: `src/client/pages/workout/program-card.tsx` (new).

### 6.4 [x] "OR" divider + "RECENT ROUTINES" list
- Reads routines from Dexie. For each, derive `daysAgo` from the latest finished session's `endedAt` for that `sourceRoutineId` (via `useFinishedSessions`). Rows: routine name, muted "X days ago" (or no subtitle when never used), chevron.
- Tapping a row: hydrate-from-routine flow — POST a session with `sourceType='routine'`, `sourceRoutineId`, `templateSnapshot` = the routine's full nested document, `liveStructure` = deep clone with fresh `performedExerciseId`/`sessionItemId`/`plannedSetId` UUIDs minted at every level, `setTargets[]` always materialized.
- Files: `src/client/pages/workout/recent-routines.tsx` (new), `src/client/lib/session/hydrate.ts` (new — owns the deep clone + UUID minting logic).

### 6.5 [x] "Freeform session" row + "ALL ROUTINES >" footer
- Lightning glyph row: "Start without a routine — add exercises as you go". Tapping POSTs a freeform session (`sourceType='freeform'`, `templateSnapshot=null`, `liveStructure.blocks=[]`).
- Footer link to `/routines`.
- Files: `src/client/pages/workout/freeform-row.tsx` (new).

### 6.6 [~] Resume / Discard / Cancel guard
- Component reads `useActiveSession()`. If a session exists with `status='in_progress'`:
  - Render a sticky **Resume in-progress** banner above the page content, linking to `/workout/active`.
  - Intercept any other start-attempt: show a Radix Dialog with three actions — **Resume** (route to `/workout/active`), **Discard** (call `deleteSession(activeId)` then proceed with the originally-attempted start), **Cancel** (no-op).
- Files: `src/client/pages/workout/active-guard.tsx` (new).
- Depends on: 4.2, 4.3.

**Acceptance Criteria (Phase 6):** Entry routes mounted; recent routines surface "X days ago" computed from finished sessions; Resume/Discard/Cancel prompt fires when an in-progress session exists; freeform start creates an empty `liveStructure`.

---

## Phase 7: Logger page UI — header counter, exercise card, set rows, rest timer

**Dependencies:** Phase 4, Phase 5, Phase 6. Mockups `design/logger-dark.png` + `design/logger-light.png`.

### 7.1 [x] `/workout/active` route + page shell
- Renders `<LoggerPage />`. Reads `useActiveSession()`; redirects to `/workout/start` when no active session.
- Files: `src/client/pages/workout/logger/index.tsx` (new), router config.

### 7.2 [~] Header counter + overflow menu
- Header: "Set <currentSlotIndex+1> of <totalPlannedSlots>" derived from `computeNextCursor` (extras excluded). Right-aligned overflow kebab.
- Overflow items: **Pause and leave** (sets `pausedAt` and routes back to `/workout/start`), **Discard** (Radix Dialog → `deleteSession`), **Add note** (focuses session-level notes textarea), **Edit structure** (opens the structure-edit sheet from Phase 8).
- Files: `src/client/pages/workout/logger/header.tsx` (new).

### 7.3 [x] Exercise card component
- Bold exercise name, optional `SUPERSET A` tag with round pip dots (filled = logged this round, hollow = pending, current = highlighted).
- Muted `last time: <reps × weight × sets · <date>>` line sourced from `getLastLogForExercise`. Hidden when no prior history.
- Compact prescription chips row: `<setCount> sets`, `<reps> reps`, `RPE <rpe>`, `<mm:ss> rest` (chip omitted when its source value is null).
- Files: `src/client/pages/workout/logger/exercise-card.tsx` (new), `src/client/pages/workout/logger/superset-pips.tsx` (new).

### 7.4 [~] Set row component (placeholder / active / logged states)
- Placeholder: muted row showing prescription target (`225 × 5  RPE 8`). Tapping focuses the inline editor on that slot (does NOT auto-skip earlier slots; the cursor still tracks state-derived order).
- Active: amber-highlighted row pointing at the cursor slot.
- Logged: row with a green check glyph showing logged values (`<weight> × <reps>` plus optional `RPE <rpe>`); tapping enters correct-mode (Phase 9).
- `+ ADD SET` and `+ ADD NOTE` affordances render under the active exercise card.
- Files: `src/client/pages/workout/logger/set-row.tsx` (new).

### 7.5 [~] Rest timer strip + persistence
- Strip above the editor: `mm:ss` countdown, play/pause toggle. Reads `session.restTimer` and recomputes `remainingSec` from wall-clock against `startedAt` on every render.
- Auto-start on **LOG SET**: write `restTimer = { status: 'running', startedAt: Date.now(), durationSec: <slot's restSec or 90>, pausedAt: null, remainingSec: durationSec }` in the same `updateSession` call.
- Tap on the duration label opens a numeric stepper to override `durationSec` mid-rest; remaining time recomputes.
- Survives reload/offline (state on session row, parsed from Dexie).
- Cleared on finish (`restTimer = null`).
- Files: `src/client/pages/workout/logger/rest-timer.tsx` (new).
- Depends on: 4.2.

### 7.6 [~] Inline editor (weight/reps steppers, setType chip, note chip, LOG SET CTA)
- Paired number steppers for **WEIGHT** and **REPS**. Pre-fill from `getLastLogValuesForExercise(exerciseId)` (overwritten on user input).
- `setType` chip (`N`, `D`, `W`, `F`, `A`, `RP`) — toggling changes setType for the CURRENT slot only (per spec § Logging interactions, Phase 9).
- `+ Note` chip opens a small inline note textarea (max 500 chars).
- Full-width amber **LOG SET** CTA. After cursor exhaustion, CTA changes to **Add extra set / Finish workout** (Phase 10 wires Finish).
- Mobile-first: tap-tab focus order; numpad keyboard via `inputmode="decimal"`.
- Files: `src/client/pages/workout/logger/inline-editor.tsx` (new).

### 7.7 [x] Cursor exhaustion behavior
- When `cursor.exhausted === true`, the inline editor renders an **Add extra set** chip + a **Finish workout** primary CTA.
- Files: extends `inline-editor.tsx`.

### 7.8 [ ] Write 5 focused logger UI tests
- Limit to 5:
  1. Header counter renders `Set N of M` summed across planned slots, extras excluded.
  2. Active row aligns with `computeNextCursor` output; tapping a placeholder shifts the active editor without marking earlier rows skipped.
  3. Rest timer auto-starts on LOG SET with the slot's `restSec` (or 90 default) and persists across an unmount/remount.
  4. Inline editor pre-fills from the most recent logged row of the same exercise; user input overrides pre-fill.
  5. After cursor exhaustion, the bottom CTA changes to **Add extra set / Finish workout**.
- Files: `src/client/pages/workout/logger/__tests__/logger.test.tsx`.

### 7.9 [ ] Run logger UI tests
- Run ONLY the 5 tests written in 7.8.

**Acceptance Criteria (Phase 7):** Logger renders mockup-faithful header, exercise cards (with superset pip dots and last-time line), placeholder/active/logged set rows, rest timer strip with mid-rest override, and the inline editor with amber LOG SET CTA. State survives reload.

---

## Phase 8: Mid-session structural edits (full scope, including superset reshape)

**Dependencies:** Phase 4, Phase 7.

### 8.1 [ ] "Edit structure" bottom sheet shell
- Reachable from the logger header overflow. Renders the entire `liveStructure` as a draggable list using the same dnd-kit primitives wired in the routines builder.
- Each block/item exposes contextual actions (long-press menu): **Add exercise above/below**, **Replace exercise**, **Add to superset / Split superset / Convert to single ↔ superset**, **Add round (whole group)**, **Remove round (whole group)**, **Remove exercise**.
- All edits stage to a draft `liveStructure` and apply on **Done** in a single Dexie transaction (`updateSession`) PLUS any `updateSessionLog` calls needed for orphan-log reclassification.
- Files: `src/client/pages/workout/logger/edit-structure/index.tsx` (new).

### 8.2 [ ] Add / remove / reorder / swap exercises
- **Add exercise:** opens the reusable `<ExercisePicker />` from the routines slice. Insertion mints fresh `performedExerciseId`/`sessionItemId`/`plannedSetId` UUIDs. Default planned slots: `setCount=1` blank prescription for free-form add; otherwise inherit from chosen template (deferred — v1 uses blank).
- **Remove exercise:** removes the item from `liveStructure`. All existing logs for that `performedExerciseId` are retained — their `plannedSetId` is nulled and `status` reclassified to `'extra'` via batched `updateSessionLog` calls in the same Dexie transaction. Logs are NEVER auto-deleted.
- **Reorder:** dnd-kit drag updates block/item `order`; cursor follows naturally because it's derived per render.
- **Swap (replace exerciseId at slot):** the slot keeps its `performedExerciseId`, `sessionItemId`, and `setTargets`; only `exerciseId` updates. Existing logs for that `performedExerciseId` retain their original `exerciseId` (rendered later as "previous attempt").
- Files: `src/client/pages/workout/logger/edit-structure/exercise-ops.ts` (new).

### 8.3 [ ] Add / remove sets (single block)
- **Add set:** appends one planned slot (clones the last entry's targets). New `plannedSetId` UUID.
- **Remove set:** removes the slot. Any existing log row bound to that `plannedSetId` reclassifies to `'extra'` (`plannedSetId=null`, `status='extra'`) via `updateSessionLog`.
- Files: `src/client/pages/workout/logger/edit-structure/set-ops.ts` (new).

### 8.4 [ ] Add / remove rounds (superset)
- **Add round:** the WHOLE GROUP gains a round — every member item appends a planned slot at the same round index, with fresh `plannedSetId` UUIDs. `roundCount` increments.
- **Remove round:** the WHOLE GROUP loses that round. Every member item's slot at the round index is removed; logs bound to those `plannedSetId`s reclassify to `'extra'`.
- Files: `src/client/pages/workout/logger/edit-structure/round-ops.ts` (new).

### 8.5 [ ] Add / remove exercises inside a superset
- **Add exercise into a superset:** new item appended to the group; receives planned slots for all existing rounds (default carry-over from neighbor's targets). UUIDs minted.
- **Remove exercise from a superset:** item leaves the group; logs for that `performedExerciseId` reclassify to `'extra'`. If `members.length` after removal === 1, group auto-collapses to a single block (`type='single'`, `roundCount=null`); the surviving member's planned slots remain unchanged.
- Files: extends `exercise-ops.ts`.

### 8.6 [ ] Split superset / convert single ↔ superset
- **Split:** breaks a superset into two consecutive blocks (group-into-two-units). Round structure preserved per resulting unit.
- **Single → superset:** wraps a single block into a one-item superset (`roundCount = current setCount`); the user is prompted to add a second member or leaves it as a one-member group (allowed transient state, but Save's Phase-9 invariant check warns).
- **Superset → single:** unwraps a one-item group back into a single (only available when the group already has 1 member).
- Logs are unaffected; only structural metadata changes.
- Files: `src/client/pages/workout/logger/edit-structure/restructure-ops.ts` (new).

### 8.7 [ ] Cursor stability through structural edits
- Ensure `computeNextCursor` runs cleanly after any edit; specifically, after a reorder the cursor "follows" naturally because it's derived. Add an integration check: a structural-edit smoke test that asserts the cursor lands on the expected slot after each op.
- Files: `src/client/lib/session/cursor.ts` (no logic changes; covered by tests below).

### 8.8 [ ] Write 4 focused structural-edit tests
- Limit to 4:
  1. Removing an exercise reclassifies its existing logs to `'extra'` with `plannedSetId=null`; no logs deleted.
  2. Adding a round inside a superset adds exactly one planned slot per group member at the new round index.
  3. Removing the last non-anchor member from a superset auto-collapses to a single block.
  4. Swap-exercise updates `exerciseId` on the slot but leaves prior logs' `exerciseId` intact (previous-attempt semantics).
- Files: `src/client/pages/workout/logger/edit-structure/__tests__/edits.test.ts`.

### 8.9 [ ] Run structural-edit tests
- Run ONLY the 4 tests written in 8.8.

**Acceptance Criteria (Phase 8):** Every edit operation in spec § Mid-session structural edits is reachable from the Edit-structure sheet; orphan-log-as-extra rule applies uniformly; auto-collapse fires correctly; templateSnapshot is never mutated.

---

## Phase 9: Set logging interactions (log / skip / correct / extra-set, setType scope, inputs)

**Dependencies:** Phase 4, Phase 7.

### 9.1 [x] LOG SET interaction
- Tapping LOG SET writes a `session_set_logs` row in Dexie + outbox in one transaction via `createSessionLog`. Fields: `id` (new UUID), `sessionId`, `performedExerciseId`, `exerciseId`, `sessionItemId`, `plannedSetId`, `order`, `reps`, `weightKg`, `rpe`, `setType`, `status='logged'`, `loggedAt=Date.now()`, `restAfterSec=null` (back-filled at next-log-time or finish), `enteredWeight`/`enteredWeightUnit` from the user's input units. Cursor advances on next render.
- If a log already exists for the slot, route through `updateSessionLog` (correct-mode).
- Files: `src/client/pages/workout/logger/log-set.ts` (new).

### 9.2 [x] Skip set interaction
- Skip CTA on the active row (or in placeholder long-press menu) creates a `status='skipped'` log row with no metric values. Allows the cursor to advance past the slot.
- Files: extends `log-set.ts`.

### 9.3 [x] Correct-mode (tap a logged row to edit)
- Tapping a logged row opens the inline editor pre-filled with that log's values. Saving routes through `updateSessionLog`; the row updates in place; rest timer is NOT restarted on a correction.
- Files: extends `inline-editor.tsx` and `log-set.ts`.

### 9.4 [~] Add extra set
- After cursor exhaustion (or via long-press on an exercise card "+ ADD SET"), inserting an extra set creates a log row with `plannedSetId=null`, `status='extra'`, `order = max(order)+1` for that `performedExerciseId`. Extras do NOT increment the header counter total.
- Files: `src/client/pages/workout/logger/extra-set.ts` (new).

### 9.5 [x] setType scope = single set only
- Changing the setType chip in the inline editor updates ONLY the current set's `setType` on its log row (or its `setTargets[i].setType` for unlogged slots). Does NOT propagate to siblings.
- Files: extends `inline-editor.tsx`.

### 9.6 [ ] Cardio + duration / distance inputs
- For exercises with `type='cardio'` or `type='mixed'`, the inline editor shows `durationSec` and `distanceM` inputs (mm:ss + numeric in display unit) alongside or instead of weight/reps. Pre-fill rules apply to whichever fields exist.
- Files: extends `inline-editor.tsx`, reuse mm:ss helper from routines slice.

### 9.7 [~] Notes + RPE inputs
- RPE input: optional, half-step `1.0–10.0`.
- Notes input: optional textarea max 500 chars per log; opens via `+ Note` chip.
- Files: extends `inline-editor.tsx`.

### 9.8 [~] Mobile-first numpad + steppers
- Number inputs use `inputmode="decimal"` and provide `+`/`-` stepper buttons. Tap targets ≥ 44px.
- Files: shared component `src/client/components/numpad-input.tsx` (new) used by Weight/Reps/RPE/Distance fields.

### 9.9 [ ] `restAfterSec` back-fill at next log
- When the next LOG SET fires, compute the elapsed wall-clock since the previous log's `loggedAt` (clamped to `[0, 3600]`) and patch the previous log row's `restAfterSec` via `updateSessionLog`. On finish, the final logged row remains with `restAfterSec=null`.
- Files: `src/client/pages/workout/logger/rest-attribution.ts` (new).

### 9.10 [ ] Write 4 focused logging interaction tests
- Limit to 4:
  1. LOG SET creates a log + advances cursor; correct-mode patches in place without restarting rest timer.
  2. setType chip changes scope only the current set, not siblings.
  3. Skip creates `status='skipped'` row with no metrics; cursor walks past.
  4. Extra set creates `plannedSetId=null`, `status='extra'`, increments `order` for that performed exercise; header counter total unchanged.
- Files: `src/client/pages/workout/logger/__tests__/log-interactions.test.ts`.

### 9.11 [ ] Run logging interaction tests
- Run ONLY the 4 tests written in 9.10.

**Acceptance Criteria (Phase 9):** All logging interactions per spec § Logger UX & § Logging interactions function offline-first; setType is per-set; cardio inputs render appropriately; rest attribution back-fills.

---

## Phase 10: Finish flow + post-finish session detail page

**Dependencies:** Phase 4, Phase 5, Phase 7, Phase 9. Mockup `design/history-detail.png`.

### 10.1 [x] Finish workout confirm + flow
- Tapping **Finish workout** opens a Radix Dialog: "Finish this workout? You won't be able to edit it after this." On confirm:
  - Call `finishSession(id, endedAt=Date.now())` → mutates local row to `status='finished'`, `endedAt`, `restTimer=null`, enqueues outbox `session.update` (which the flusher routes to `/finish` per 4.4).
  - Navigate to `/workout/sessions/:id` (post-finish detail).
- Files: `src/client/pages/workout/logger/finish-dialog.tsx` (new).

### 10.2 [x] Post-finish detail page route + skeleton
- `/workout/sessions/:id` renders `<SessionDetailPage />`. Reads via `useSession(id)`; if local missing, render "Session not found" with link to history list.
- Top bar: back arrow, "WORKOUT SUMMARY" muted label, share icon (no-op v1).
- Files: `src/client/pages/workout/sessions/detail.tsx` (new), router config.

### 10.3 [x] Header block + optional program subtitle
- Bold session title (default routine name or "Freeform session"). Muted date line `<weekday>, <date> · <duration>` (duration = `endedAt - startedAt` formatted as `Hh Mm`).
- When `sourceType='program_day'`, a muted line `<programName> · Week <N>, Day <M>` (programName resolved best-effort; v1 stub: render the program id when no program data exists).
- Files: `src/client/pages/workout/sessions/header.tsx` (new).

### 10.4 [~] Three top metric tiles (VOLUME / SETS / PRs)
- Uses `summarizeSessionForHistory` from 5.4. VOLUME rendered in display units; SETS = count of `status='logged'`; PRs = count of new EST 1RM peaks vs prior history.
- Files: `src/client/pages/workout/sessions/metrics.tsx` (new).
- Depends on: 5.4.

### 10.5 [~] Per-exercise summary blocks
- Bold exercise name, optional `EST 1RM` chip when this session set a new peak for that exercise. Ordered list of logs:
  - Logged: `<weight> lb × <reps>` (in display units) with green check glyph.
  - Skipped: muted dash row.
  - Extra: row with `EXTRA` chip.
  - Cardio: `<duration> · <distance> · <pace>` summary instead of weight × reps.
- Superset blocks: amber accent bar + `SUPERSET <letter>` header.
- "Previous attempt" treatment: when a slot's logs reference a different `exerciseId` than the slot's current `exerciseId` (post-swap), render those logs in a muted "previous attempt" sub-section.
- Files: `src/client/pages/workout/sessions/exercise-block.tsx` (new), `superset-block.tsx` (new), `cardio-row.tsx` (new).

### 10.6 [x] Footer (notes, Export stub, Done)
- Read-only notes block. **Export** button (CSV stub — disabled with tooltip "Coming soon"). **Done** routes back to history list.
- Files: `src/client/pages/workout/sessions/footer.tsx` (new).

### 10.7 [~] Strict immutability guards
- Page is strictly read-only. All mutation paths (`updateSession`, `createSessionLog`, etc.) refuse for `status='finished'` parents (already enforced at 4.2). Server enforcement covered by 3.5/3.8.
- Files: no new code; verify guard.

### 10.8 [ ] Write 3 focused finish-flow tests
- Limit to 3:
  1. Finish flow mutates local session to `status='finished'`, clears `restTimer`, and navigates to detail.
  2. PR count includes only exercises where this session's best Epley exceeds the prior all-time best.
  3. Post-swap "previous attempt" rendering surfaces logs whose `exerciseId` differs from the current slot's `exerciseId`.
- Files: `src/client/pages/workout/sessions/__tests__/detail.test.tsx`.

### 10.9 [ ] Run finish-flow tests
- Run ONLY the 3 tests written in 10.8.

**Acceptance Criteria (Phase 10):** Finish flow round-trips through outbox to `/finish`; post-finish detail matches `design/history-detail.png` in structure and density; all mutation paths are blocked client- and server-side.

---

## Phase 11: Per-exercise history wiring on `/exercises/:id`

**Dependencies:** Phase 4, Phase 5. Mockup `design/exercise-detail.png`.

### 11.1 [x] Wire EST 1RM tile
- On `/exercises/:id`, replace the v1-empty EST 1RM tile with a value computed via `bestEpleyForExercise(exerciseLogs, exerciseId)` from Phase 5. Render in display units; show empty-state dash when no eligible logs exist.
- Files: `src/client/pages/exercises/detail.tsx`, `src/client/pages/exercises/stat-tiles/est-1rm.tsx` (new).
- Depends on: 4.6, 5.2.

### 11.2 [x] Wire BEST SET tile
- Single log row with the highest Epley estimate, rendered as `<weight> × <reps>` in display units.
- Files: `src/client/pages/exercises/stat-tiles/best-set.tsx` (new).

### 11.3 [x] Wire TOTAL SESSIONS tile
- Count of distinct `sessionId` values where this `exerciseId` has at least one `status='logged'` log.
- Files: `src/client/pages/exercises/stat-tiles/total-sessions.tsx` (new).

### 11.4 [x] Wire RECENT HISTORY list
- List of recent logged sets for this exercise, newest first, grouped by session `endedAt` date. Format: `<weight> × <reps> · RPE <rpe>` (omit RPE chip when null). "VIEW ALL >" routes to `/history?exerciseId=<id>` (history list filtering deferred — link target may 404 in v1; render the link regardless).
- Files: `src/client/pages/exercises/recent-history.tsx` (replace existing placeholder from exercise-library Phase 7.5).

### 11.5 [x] Empty-state preservation
- When no logs exist for the exercise, all four tiles + recent history render the existing v1 "No history yet" empty state. Tiles populate as soon as logs land in Dexie.
- Files: extends 11.1–11.4.

**Acceptance Criteria (Phase 11):** Exercise detail page populates the previously-empty stat tiles and recent history block from Dexie logs; empty states preserved.

---

## Phase 12: Polish

**Dependencies:** Phases 6–11.

### 12.1 [ ] Validation surfaces in logger + structural-edit sheet
- Map Zod issues from `SessionUpdateInput` / `SessionSetLogCreateInput` failures (e.g., RPE half-step violation, missing weight on a logged normal set) to inline editor field errors. Top-of-form sticky error banner when multiple errors exist.
- Files: `src/client/pages/workout/logger/validation.tsx` (new).

### 12.2 [ ] Error states (offline writes blocked, 409 finished, in_progress conflict)
- Surface flusher errors:
  - `409 in_progress_exists` on a manually-issued create (e.g., race against another tab) → toast + offer Resume.
  - `409 finished` on any session-mutation outbox entry → drop entry + toast "Session finished elsewhere".
- Files: `src/client/sync/flusher-banner.tsx` (extend the existing exercise-library banner).

### 12.3 [ ] Empty states across logger, workout-start, post-finish
- Empty `liveStructure` (freeform with no exercises): logger shows centered "Add an exercise to get started" with a primary `+ Add exercise` CTA opening the picker.
- Workout-start with no routines + no program: only the freeform row renders.
- Post-finish detail with zero logged sets (theoretical): metric tiles all show 0; per-exercise blocks empty.
- Files: various.

### 12.4 [ ] Optimistic sync correctness
- Verify: a Dexie write's UI update is immediate; a flusher failure does not roll back the Dexie row (v1 convention); reconciliation respects the pending-wins guard.
- Files: review `src/client/sync/flusher.ts`, `src/client/sync/reconcile.ts`.

### 12.5 [ ] Accessibility sweep
- Verify: header counter and rest timer have `aria-live="polite"`; LOG SET button has `aria-label` describing the slot; setType chip uses `role="radiogroup"`; placeholder rows are buttons (`role="button"`, `aria-label="Tap to log set N"`); structural-edit sheet has focus trap; `aria-expanded` on chevron expanders; mm:ss inputs have `aria-describedby` hint; numpad steppers have `aria-label` on `+`/`-` buttons.
- Files: any components missing a11y.

### 12.6 [ ] Mockup contrast + token audit
- Verify amber LOG SET CTA, START PLANNED CTA, superset accent bar all use existing tokens (`--accent`, `--accent-fg`) and meet WCAG AA against `--bg` / `--surface`.
- Files: `src/client/styles.css` only if a specific pairing fails.

### 12.7 [ ] Outbox ordering correctness
- Verify FIFO ordering preserves intra-session correctness (a `session.create` precedes any of its child `session_log.create` entries; `session.delete` precedes nothing for that id since cascade handles logs).
- Spot-check via a manual offline scenario: create session → log 3 sets → finish → all four entries drain in order against a running server.
- Files: review `src/client/sync/flusher.ts`.

**Acceptance Criteria (Phase 12):** Validation errors readable; offline writes survive refresh and drain on reconnect; keyboard-only navigation reaches every editable surface; empty states honest.

---

## Phase 13: Manual verification against mockups

**Dependencies:** All prior phases.

### 13.1 [ ] Manual test checklist
Run `bun run dev` and step through every flow with `design/logger-dark.png`, `design/logger-light.png`, `design/workout-start.png`, `design/history-detail.png`, and `design/exercise-detail.png` open side-by-side:

- [ ] Visit `/workout/start` with no active session: renders "From your program" hidden (no program), "RECENT ROUTINES" populated, freeform row visible, "ALL ROUTINES >" footer present.
- [ ] Tap a recent routine row → POST creates a session with `sourceType='routine'`, `templateSnapshot` cloned from the routine, `liveStructure` deep-cloned with fresh UUIDs at every level, `setTargets` materialized to length `setCount`. Navigate to `/workout/active`.
- [ ] Logger header reads "Set 1 of N" matching the sum of planned slots; first exercise card highlights its first set as active; `last time` line shows when prior logs exist for that exercise.
- [ ] Pre-fill: editor weight/reps fields show last-time values; user input overrides.
- [ ] LOG SET writes a log + advances cursor + auto-starts rest timer at slot's `restSec` (or 90 default); timer survives a tab reload.
- [ ] Tap rest-timer duration mid-rest → stepper opens; new `durationSec` mutates; remaining recomputes.
- [ ] Superset block: pip dots fill round-major (A1@r1 → A2@r1 → A1@r2 …); cursor walks accordingly.
- [ ] Skip a set → `status='skipped'` log written; cursor advances past.
- [ ] Tap a logged row → editor opens in correct-mode pre-filled; saving patches in place; rest timer NOT restarted.
- [ ] Open Edit structure → reorder a block via drag → cursor lands on the expected slot post-edit.
- [ ] Edit structure → add a round to a superset → all members gain a planned slot at the new round index.
- [ ] Edit structure → remove an exercise that has logs → its logs reclassify to `status='extra'` with `plannedSetId=null` (verified via Dexie devtools).
- [ ] Edit structure → swap exercise on a slot that has prior logs → new logs reflect new exerciseId; old logs retain previous exerciseId.
- [ ] Add extra set after cursor exhaustion → row appears with EXTRA marker; header counter total unchanged.
- [ ] Tap Finish → confirm dialog → POST `/finish` drains; navigated to `/workout/sessions/:id`; mutation attempts on the finished session are rejected (`409 finished`) and dropped from the outbox.
- [ ] Post-finish detail: header, optional program subtitle, three metric tiles (VOLUME / SETS / PRs), per-exercise blocks with checkmarks, EXTRA chips, superset accent bars, cardio rows, read-only notes, Export disabled, Done routes to history list.
- [ ] Visit an exercise detail (`/exercises/:id`) for an exercise with logs: EST 1RM, BEST SET, TOTAL SESSIONS, RECENT HISTORY all populate from Dexie.
- [ ] Single-active-session: with one in-progress, attempting to start another triggers Resume / Discard / Cancel; Discard hard-deletes (cascade) and proceeds.
- [ ] Pause-and-leave from header overflow: navigates back to `/workout/start`; sticky "Resume in-progress" banner appears; resume returns to logger with state intact (cursor, restTimer recomputed).
- [ ] Offline scenario: log 3 sets + finish while offline → outbox accumulates 4 entries (1 session.create or update + 3 session_log.create + 1 session.update[finish]); go online → all drain in order.
- [ ] Refresh mid-outbox with server down: pending entries persist and flush when server returns.
- [ ] Discard an in-progress session via overflow → cascade-deletes session + logs; outbox has exactly one `session.delete` entry (no per-log deletes).
- [ ] Keyboard-only: tab through logger; trigger LOG SET via Enter on the focused button; arrow keys move within the setType radio group; structural-edit sheet keyboard-reorders blocks via dnd-kit's keyboard sensor.

**Acceptance Criteria (Phase 13):** Every checklist item passes; logger, workout-start, post-finish, and exercise-detail surfaces visually match their mockups in structure, density, and accent treatment; offline writes survive refresh and drain on reconnect.

---

## Execution Order (recommended)

1. Drizzle schema + migration (Phase 1)
2. Shared Zod schemas (Phase 2)
3. Hono routes (Phase 3)
4. Dexie + outbox extension + repository + hooks (Phase 4)
5. Cursor / Epley / pre-fill utilities (Phase 5)
6. `/workout/start` entrypoint + Resume guard (Phase 6)
7. Logger page UI (Phase 7)
8. Mid-session structural edits (Phase 8)
9. Set logging interactions (Phase 9)
10. Finish flow + post-finish detail (Phase 10)
11. Per-exercise history wiring on exercise detail (Phase 11)
12. Polish (Phase 12)
13. Manual verification against mockups (Phase 13)
