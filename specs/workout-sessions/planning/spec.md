# Specification: Workout Sessions (Live Logger)

## Overview

This slice introduces the **live execution layer** of Forge — mutable workout sessions that capture the performed reality of training. Sessions are the counterpart to the routines template layer: templates describe planning intent, sessions capture mutable reality. A session is hydrated at start time from one of three sources (a routine, a program day, or free-form), takes a structural snapshot of that source, and from that point forward evolves independently. Later edits to the originating routine or program never rewrite session history.

The slice covers the full live-logger surface: lifecycle (start / pause-by-leave / resume / discard / finish), state-driven next-set progression, superset round progression, full mid-session structural mutations (including superset reshape), per-set logging with rest timer, immutable finish, per-exercise history reads, Epley 1RM, the workout-start entrypoint, and the post-finish session detail view. It builds on the patterns established by exercise-library and routines: Drizzle in `src/db`, Zod in `src/shared`, Hono in `src/server`, Dexie + generic `pending_writes` outbox in `src/client`. No new flusher logic is required — only new entity discriminators (`'session'`, `'session_log'`).

## Goals

- Hydrate a mutable session from a routine, a program day, or free-form, with an immutable `templateSnapshot` captured at start.
- Drive logging via a stateless cursor (current exercise + expected next set) derived per render from `liveStructure` + `session_set_logs`.
- Progress supersets by round (A1 → A2 → A3, then round 2), keeping the group structurally consistent across set-count edits.
- Allow full mid-session structural mutations — add/remove/reorder/swap exercises, add/remove sets, mutate superset structure (add/remove items, split, convert single ↔ superset).
- Persist a rest timer that survives pause/resume, reload, and offline; auto-start on log; allow mid-rest duration override.
- Finish sessions into strictly immutable history with Epley 1RM computed on read.
- Surface per-exercise history (EST 1RM / BEST SET / TOTAL SESSIONS / RECENT HISTORY tiles) on the exercise detail page.
- Match the logger, workout-start, history-list, and history-detail mockups in layout, density, and behavior.

## Non-goals (v1)

- Programs feature itself (week/day model, joining, advancement) — sessions only consume a program-day reference and snapshot the underlying routine.
- History aggregation dashboards beyond per-exercise history (cross-exercise totals, weekly volume, streaks, dashboards).
- Goals tracking.
- Multiple concurrent in-progress sessions.
- Finish grace window / undo-finish.
- Alternative 1RM formulas (Brzycki, Lombardi, etc.) — Epley only in v1.
- Manual set-number entry as the primary flow.
- Drop-set parent-child linkage (drop sets are sequential rows with `setType='drop'`).
- Auto-deletion of orphaned logs when their planned slot is removed.
- Today / homepage redesign.
- Settings-driven 1RM formula choice.
- Units display preferences feature itself (units render via the existing global preference; no new settings UI here).
- Server-side aggregation/query endpoints beyond CRUD.

## User Stories

- As a self-tracking lifter, I want to start a workout from a routine, a program day, or fresh, so that the logger meets me wherever my plan lives.
- As a lifter mid-session, I want to swap exercises, add/remove sets, and reshape supersets without losing what I've already logged, so that real-world gym constraints don't corrupt my history.
- As a returning user, I want to see per-exercise history and my estimated 1RM on the exercise detail page, so that I can plan my next session intelligently.

## Specific Requirements

**Domain model — `sessions` table (Drizzle, SQLite)**
- `id` text PK (UUID); `status` text not null (`'in_progress' | 'finished' | 'discarded'` — discarded rows are hard-deleted, status exists only for safety).
- `sourceType` text not null (`'routine' | 'program_day' | 'freeform'`); `sourceRoutineId` text nullable; `sourceProgramId` text nullable; `sourceProgramWeekIndex` integer nullable; `sourceProgramDayIndex` integer nullable.
- `templateSnapshot` text not null nullable (JSON-encoded frozen routine snapshot at start; null for freeform); `liveStructure` text not null (JSON-encoded mutable structure mirroring the routine shape with `performedExerciseId` per item and `plannedSetId` per slot).
- `restTimer` text nullable (JSON: `{ status: 'idle'|'running'|'paused', startedAt, durationSec, pausedAt, remainingSec }`); cleared on finish.
- `title` text nullable (defaults to source routine name or `"Freeform session"`); `notes` text nullable (max 2000 chars).
- `startedAt` integer (timestamp_ms) not null; `endedAt` integer nullable (set on finish); `pausedAt` integer nullable (informational; pause is implicit by leaving).
- `createdAt`, `updatedAt` integer (timestamp_ms) not null.
- Indexes: `idx_sessions_status` on `status`, `idx_sessions_started_at` on `startedAt`, `idx_sessions_source_routine` on `sourceRoutineId`. A partial-unique index/runtime guard enforces at most one row with `status='in_progress'`.

**Domain model — `session_set_logs` table**
- `id` text PK (UUID); `sessionId` text not null FK → `sessions.id` ON DELETE CASCADE.
- `performedExerciseId` text not null (UUID identifying the exercise instance within `liveStructure` — survives reorder/swap-removal); `exerciseId` text not null (FK soft to `exercises.id`); `sessionItemId` text not null (UUID of the structure item; tracks group membership for supersets).
- `plannedSetId` text nullable (UUID of the planned slot inside `liveStructure`; null for extras / orphaned logs); `order` integer not null (0-based within `performedExerciseId`).
- `reps` integer nullable; `weightKg` real nullable; `rpe` real nullable (1.0–10.0, half-step); `durationSec` integer nullable; `distanceM` real nullable; `notes` text nullable (max 500 chars).
- `setType` text not null (`'normal' | 'warmup' | 'drop' | 'failure' | 'amrap' | 'rest_pause'`); `status` text not null (`'logged' | 'skipped' | 'extra'`).
- `loggedAt` integer (timestamp_ms) not null; `restAfterSec` integer nullable (rest taken after this set, in seconds, captured at next-log time or finish).
- `enteredWeight` real nullable, `enteredWeightUnit` text nullable (`'kg' | 'lb'`), `enteredDistance` real nullable, `enteredDistanceUnit` text nullable (`'m' | 'km' | 'mi'`) — audit trail of original entry.
- Indexes: `idx_logs_session` on `sessionId`, `idx_logs_exercise_logged` on `(exerciseId, loggedAt)`, `idx_logs_session_performed` on `(sessionId, performedExerciseId, order)`, `idx_logs_planned_set` on `plannedSetId`.

**Zod shared schemas**
- New `src/shared/session.ts`: `SessionSourceTypeEnum`, `SessionStatusEnum`, `RestTimerStatusEnum`, `RestTimerSchema`, `LiveStructureItemSchema` / `LiveStructureBlockSchema` / `LiveStructureSchema` (mirrors `RoutineSchema` shape with extra `performedExerciseId`, `plannedSetId` UUIDs and a `setTargets[]` always present per slot for predictability), `SessionSchema`, `SessionCreateInput` (requires `sourceType`, optional `sourceRoutineId` / program coords, optional `templateSnapshot`), `SessionUpdateInput` (full document; rejected if `status='finished'`), `SessionFinishInput` (`{ endedAt }`).
- New `src/shared/session-log.ts`: `SetTypeEnum` (extends routine's enum with `'warmup'` and `'failure'`), `SessionLogStatusEnum`, `SessionSetLogSchema`, `SessionSetLogCreateInput` (client-supplied id, `sessionId` taken from path), `SessionSetLogUpdateInput` (full record; rejected when parent session finished).
- Cross-field rules: `weightKg`/`reps` required for `setType='normal'|'drop'|'amrap'|'failure'` only when contributing to logged status; either weight or duration must be present for `status='logged'` (cardio-only sets allowed via `durationSec` and/or `distanceM`); `enteredWeight`/`enteredWeightUnit` must both be set or both null. SI canonical (`weightKg` kg, `distanceM` meters, `durationSec` seconds).
- `src/shared/pending-write.ts` updated: `PendingEntityEnum` extended with `'session'` and `'session_log'`. No structural change to `PendingWriteSchema`.

**HTTP API — sessions**
- All routes under `/api/v1/sessions`. JSON in/out. No auth gate (consistent with routines/exercises).
- `GET /api/v1/sessions` → `200 { sessions: Session[] }`. Returns full list (ordered by `startedAt` DESC, server-side); filtering client-side.
- `GET /api/v1/sessions/:id` → `200 Session` | `404`.
- `POST /api/v1/sessions` — body: `SessionCreateInput`. Server rejects with `409 { error: 'in_progress_exists', id }` if any session is `in_progress`. `201 Session` | `400 validation` | `409 id_conflict`.
- `PATCH /api/v1/sessions/:id` — body: `SessionUpdateInput` (full document; mutates `liveStructure`, `title`, `notes`, `restTimer`, `pausedAt`). `200` | `404` | `400` | `409 { error: 'finished' }` if parent session is finished.
- `POST /api/v1/sessions/:id/finish` — body: `{ endedAt }`. Server stamps `status='finished'`, `endedAt`, clears `restTimer`. `200 Session` | `404` | `409 finished`.
- `DELETE /api/v1/sessions/:id` → `204`. Hard-deletes the session and all child logs (FK CASCADE). Used for Discard. Idempotent.

**HTTP API — session set logs (sub-resources)**
- `GET /api/v1/sessions/:id/logs` → `200 { logs: SessionSetLog[] }` (server-side ordered by `loggedAt` ASC).
- `POST /api/v1/sessions/:id/logs` — body: `SessionSetLogCreateInput` (client `id`). `201 SessionSetLog` | `400` | `404` (parent missing) | `409 finished` | `409 id_conflict`.
- `PATCH /api/v1/sessions/:id/logs/:logId` — body: `SessionSetLogUpdateInput` (full record). `200` | `404` | `400` | `409 finished`.
- `DELETE /api/v1/sessions/:id/logs/:logId` → `204`. Idempotent. Rejected with `409 finished` if parent finished.
- Example create payload: `{ "id": "log-uuid", "sessionId": "sess-uuid", "performedExerciseId": "pe-uuid", "exerciseId": "ex-bench", "sessionItemId": "si-uuid", "plannedSetId": "ps-uuid", "order": 2, "reps": 5, "weightKg": 102.5, "rpe": 8, "setType": "normal", "status": "logged", "loggedAt": 1714600000000, "restAfterSec": null, "enteredWeight": 225, "enteredWeightUnit": "lb" }`.

**Dexie mirror + outbox**
- Two new Dexie stores: `sessions` (keyPath `id`; indexes on `status`, `startedAt`, `sourceRoutineId`) holding the full nested document; `sessionSetLogs` (keyPath `id`; indexes on `sessionId`, `[exerciseId+loggedAt]`, `[sessionId+performedExerciseId+order]`, `plannedSetId`).
- Reads via Dexie wrapped in Tanstack Query, identical to routines/exercises. Writes always go to Dexie + `pendingWrites` in one transaction.
- Outbox extension: `entity='session'` for session create/update/finish/delete (finish is encoded as an `update` carrying `status='finished'` and `endedAt`); `entity='session_log'` for log create/update/delete. Payload conventions match exercise-library: full record for create/update, `{ id, sessionId }` for log delete.
- Reuse `src/client/sync/flusher.ts` and `src/client/sync/reconcile.ts` unchanged — only the entity dispatch table grows. Reconcile pulls `GET /api/v1/sessions` and `GET /api/v1/sessions/:id/logs` for any session not already finished locally; finished sessions are immutable so server replaces local without the pending-wins guard once outbox has drained.

**Logger UX (state-driven, mockup-faithful — `design/logger-dark.png`, `logger-light.png`)**
- Header counter shows `"Set <currentSlotIndex+1> of <totalPlannedSlots>"` summed across all planned slots in `liveStructure` (extras excluded). Right-aligned overflow menu (Pause-and-leave, Discard, Add note, Edit structure).
- Stateless next-set cursor: derived per render as the lowest-indexed planned slot in `liveStructure` whose status is neither `logged` nor `skipped`, walking by round inside supersets (A1@r1 → A2@r1 → … → A1@r2). After the last planned slot, cursor exhausts and the bottom CTA changes to **Add extra set / Finish workout**.
- Per-exercise card: bold name, superset tag (`SUPERSET A`) with position pip dots (filled = logged this round, hollow = pending, current = highlighted) and `last time: <reps × weight × sets · <date>>` muted line sourced from the most recent `logged` log for that `exerciseId` in the local cache. Hidden if no prior history.
- Placeholder rows: each unlogged planned slot renders as a muted row showing the prescription target (`225 × 5  RPE 8`); the current cursor slot is highlighted; tapping a placeholder makes that slot the active editor (does not skip earlier slots). `+ ADD SET` and `+ ADD NOTE` affordances appear under the active exercise.
- Inline editor at the bottom: paired number steppers for **WEIGHT** and **REPS**, a `setType` chip (`N`, `D`, `W`, `F`, `A`, `RP`), `+ Note` chip, and a full-width amber **LOG SET** CTA. Pre-fill values come from the immediately previous log of the same `exerciseId` (local cache) and are overwritten by user input.
- Rest timer strip above the editor: shows status, mm:ss countdown, and a play/pause toggle. Auto-starts on **LOG SET** with `durationSec` taken from the just-logged slot's prescribed `restSec` (block-level for single, per-round for superset; defaults to 90s if absent). Tapping the duration opens a stepper to override mid-rest (mutates `restTimer.durationSec`; remaining time recomputes against `startedAt`).
- Logging persistence: tapping LOG SET writes a `session_set_logs` row in Dexie + outbox in a single transaction; if the slot already has a log, it patches; the cursor advances on next render. Skipping a set creates a `status='skipped'` log row with no values (allows the cursor to advance past it).

**Mid-session structural edits**
- All edits mutate `liveStructure` (single Dexie transaction, single session PATCH outbox entry). `templateSnapshot` is NEVER mutated post-start.
- Add exercise: appended or inserted; new `performedExerciseId` and `sessionItemId` UUIDs minted; planned slots inherit prescription from a chosen template or default to blank (single sets count = 1 for free-form add).
- Remove exercise: item removed from `liveStructure`. Existing logs for that `performedExerciseId` are retained; their `plannedSetId` is nulled and `status` reclassified to `extra` (transactional log PATCHes accompany the structure write). Logs are NEVER auto-deleted.
- Reorder: order indices shift; cursor follows naturally because it's derived. Logs are unaffected.
- Swap (replace exerciseId at an existing slot): the slot retains its `performedExerciseId`, `sessionItemId`, and planned set targets; `exerciseId` on the slot is updated. Any prior logs for that `performedExerciseId` remain attributable to it (they keep their `exerciseId` of the prior exercise — visualized in the post-finish summary as "previous attempt"). New logs reflect the new `exerciseId`.
- Add/remove set (single): appends or removes a planned slot; removed-slot logs reclassify to `extra` per Q2.
- Add/remove set inside a superset: the WHOLE GROUP gains or loses a round (a planned slot is added/removed at the same round index for every member). Logs in removed rounds reclassify to `extra`.
- Add/remove exercise inside a superset: new exercise receives planned slots for all existing rounds (default carry-over from neighbor); removing leaves the group with N-1 members and auto-collapses to a single block when N-1 = 1.
- Split a superset / convert single ↔ superset: pure structural metadata change (block `type`, `roundCount`, group membership). Logs unaffected; only structure JSON changes.
- All edits are reachable from an "Edit structure" sheet (overflow menu in logger header) plus contextual long-press / overflow on each card.

**Hydration paths (free-form / routine / program-day)**
- Routine-started: `POST /api/v1/sessions` with `sourceType='routine'`, `sourceRoutineId`, `templateSnapshot` = the routine's full nested document at start. `liveStructure` = deep clone of the routine document with fresh `performedExerciseId` / `sessionItemId` / `plannedSetId` UUIDs minted at every level. Per-set targets inside `liveStructure` are always materialized to length `setCount` (uniform fields expanded) so the cursor logic is simple.
- Program-day-started: `sourceType='program_day'`, `sourceProgramId` + week/day indices set, `templateSnapshot` = the routine snapshot resolved from whatever routine the program day points at AT THE MOMENT OF START. After start, the session is independent of program/routine edits. (Programs feature itself is out of scope; only this hydration contract is defined here.)
- Free-form: `sourceType='freeform'`, all source fields null, `templateSnapshot=null`, `liveStructure` initialized to an empty blocks array. The same in-logger Add Exercise affordance builds it up.

**Lifecycle & single-active-session rule**
- Exactly one session may exist with `status='in_progress'` globally. Enforced client-side via Dexie query before creating; enforced server-side via the partial-unique-index / runtime guard returning `409 in_progress_exists`.
- Pause is implicit by leaving the logger; no explicit pause endpoint. `pausedAt` is set when the user backgrounds the app or navigates away (best-effort, optional metadata; not a status).
- Resume / Discard / Cancel guard: when the user attempts to start a new session while one is in-progress, the workout-start page renders a banner offering **Resume** (route to `/workout/active`), **Discard** (DELETE the in-progress session, then proceed), or **Cancel** (no-op).
- Finish: tapping **Finish workout** (visible after cursor exhausts, also reachable from overflow) confirms, then issues `POST /:id/finish`, sets `status='finished'`, `endedAt`, clears `restTimer`, navigates to the post-finish session detail. After finish, all session and log endpoints reject mutations with `409 finished` and Dexie writes are blocked.
- Discard: hard delete of the session + all logs (FK CASCADE on the server; Dexie transaction client-side). Outbox enqueues a single `session` delete (no per-log delete entries — server cascades).

**Per-exercise history view (on `/exercises/:id`, mockup `design/exercise-detail.png`)**
- Wires the previously-empty stat tiles on the exercise detail page (the four blocks marked TODO in the exercise-library spec).
- **EST 1RM:** maximum Epley over all logs for this `exerciseId` matching `setType='normal'`, `status='logged'`, `reps>0`, `weightKg>0`, across all finished sessions. Formula: `weightKg * (1 + reps/30)`. Computed on read; not stored.
- **BEST SET:** the single log row with the highest Epley estimate, rendered as `<weight> × <reps>` in display units.
- **TOTAL SESSIONS:** count of distinct `sessionId` values where this `exerciseId` has at least one `status='logged'` log.
- **RECENT HISTORY:** list of recent logged sets for this exercise, newest first, grouped by session date, formatted `<weight> × <reps> · RPE <rpe>`. "VIEW ALL >" routes to the history-list page filtered to this exercise.
- All read from the local Dexie `sessionSetLogs` cache. Empty states preserved when no logs exist (matches existing exercise-library v1 empty behavior; tiles now populate as soon as logs land).

**1RM Epley estimation**
- Formula: `epley(weightKg, reps) = weightKg * (1 + reps / 30)`. Applied at the per-log level.
- Eligible logs: `status='logged'` AND `setType='normal'` AND `reps > 0` AND `weightKg > 0`. Drop sets, warm-ups, AMRAP, failure, rest-pause, cardio-only, and skipped/extra logs are excluded from 1RM.
- Computed on read in three places: per-exercise history (exercise detail page tiles), post-finish session summary (top metrics), workout-start last-time line (informational). Never persisted; never aggregated across exercises.

**Workout-start entrypoint (`/workout/start`, mockup `design/workout-start.png`)**
- Route mounted from the home/today surface and the drawer nav. Top bar: hamburger, **START WORKOUT** title.
- "From your program" card (only when the user is on a program in v1's read-only program data — if no program, hidden): shows the upcoming program-day routine name, a 5-row exercise summary, estimated duration chip, and a primary **START PLANNED** amber CTA. Tapping POSTs a session with `sourceType='program_day'` and routes to `/workout/active`.
- "OR" divider.
- "RECENT ROUTINES" list: rows show routine name, muted "X days ago" (derived from latest finished session per routine), chevron. Tapping POSTs a session with `sourceType='routine'`, that `sourceRoutineId`, and the routine snapshot.
- "Freeform session" row at the bottom: lightning glyph, "Start without a routine — add exercises as you go". Tapping POSTs a freeform session.
- "ALL ROUTINES >" footer link routes to `/routines`.
- If a session is already in-progress, the page renders a sticky **Resume in-progress** banner above the content; starting any other entrypoint shows the Resume / Discard / Cancel prompt instead of immediately creating a new session.

**Post-finish session detail view (`/workout/sessions/:id`, mockup `design/history-detail.png`)**
- Top bar: back arrow, "WORKOUT SUMMARY" muted label, share icon (no-op in v1).
- Header: bold session title (default routine name or "Freeform session"), muted date line `<weekday>, <date> · <duration>` (duration = `endedAt - startedAt` formatted as Hh Mm).
- Optional muted line showing the source program/block (`Hypertrophy Block · Week 3, Day 2`) when `sourceType='program_day'`.
- Three top metric tiles: **VOLUME** (sum of `weightKg * reps` across logged-normal sets, rendered in display units), **SETS** (count of `status='logged'` rows), **PRs** (count of new EST 1RM peaks vs. prior history; computed on read).
- Per-exercise blocks: bold exercise name, optional `EST 1RM` chip when this session set a new peak, ordered list of logs (`<weight> lb × <reps>` with green check for logged, muted dash for skipped, `EXTRA` chip on extras), superset blocks share an amber accent bar and `SUPERSET <letter>` header.
- Cardio rows render duration / distance / pace summary instead of weight × reps.
- Footer: notes block (read-only), **Export** (CSV stub, out of scope wiring beyond a placeholder) and **Done** (back to history list).
- All data is strictly read-only (`status='finished'` blocks all mutation paths client- and server-side).

## Visual Design

**`design/logger-dark.png` / `design/logger-light.png`**
- Header counter (`3 of 7`) summed across planned slots, overflow kebab right.
- Bold exercise name, `SUPERSET A` tag with round pip dots (filled / hollow / current-highlighted).
- "Last time: 225 lb × 5, 5, 4 · 6 days ago" muted line under the heading.
- Compact prescription chips (`4 sets`, `5 reps`, `RPE 8`, `2:30 rest`) above the set list.
- Logged-set rows show check glyphs; current cursor row is amber-highlighted; future placeholder rows muted; `+ ADD SET` / `+ ADD NOTE` affordances under the exercise.
- Bottom rest-timer strip (mm:ss + play/pause), then weight/reps steppers, setType chip + Note chip, full-width amber **LOG SET** CTA.

**`design/workout-start.png`**
- Top bar amber **START WORKOUT** title, hamburger.
- "FROM YOUR PROGRAM" card with routine name, week/day subtitle, 5 exercise rows, duration chip, **START PLANNED** CTA.
- "OR" divider.
- "RECENT ROUTINES" list with "X DAYS AGO" muted lines and chevrons.
- "Freeform session" row with lightning glyph and short blurb.
- Footer "ALL ROUTINES >" link.

**`design/history-list.png`**
- Top bar "HISTORY" with hamburger and search.
- Three top metric tiles (THIS MONTH workouts / VOLUME / AVG DURATION).
- Date-range chip row (`ALL`, `THIS WEEK`, `THIS MONTH`, …) — note: dashboard tiles and date filters are OUT OF SCOPE for v1; the page in v1 renders only the chronological list.
- Day-rail rows: amber day-number tile, routine title, muted block subtitle, exercise count + duration line, chevron.
- Note: this spec ships only the chronological list; the top tiles render but show empty / single-session aggregates only (no cross-session aggregation in v1 beyond per-exercise).

**`design/history-detail.png`**
- Top bar back / "WORKOUT SUMMARY" / share.
- Bold title, date line, optional program-block subtitle.
- Three metric tiles VOLUME / SETS / PRs.
- Per-exercise blocks with checkmarks per logged set, `SUPERSET` accent bar, `EXTRA` chip on extras, cardio rows.
- Notes block, Export / Done footer.

**`design/exercise-detail.png`**
- Already-built page; this spec wires the four previously-empty tiles (EST 1RM, BEST SET, TOTAL SESSIONS, RECENT HISTORY) per the per-exercise history view requirement above. Visual layout unchanged.

## Existing Code to Leverage

**`specs/exercise-library` end-to-end pattern**
- Mirror the Drizzle table layout, Zod schema split, Hono router wiring, Dexie store shape, list/detail/create page split, and `pendingWrites` outbox usage exactly. Reuse the error shape `{ error, issues?, id?, name? }` and the `409 id_conflict` convention on `POST`.
- Extend `src/server/routes/api.ts` with new sub-routers (`sessions.ts`, `sessions-logs.ts` or nested) following the `exercises.ts` / `equipment.ts` pattern.

**`specs/routines/planning/spec.md` template schema**
- `RoutineSchema` is the upstream snapshot shape — the session captures it verbatim into `templateSnapshot` and clones it into `liveStructure` with extra UUIDs. Sessions read routines but never mutate them. Reuse `BlockTypeEnum`, `SetTypeEnum`, `ModeEnum`, the per-set materialization helper.

**`src/shared/pending-write.ts`**
- Already generic — extend `PendingEntityEnum` with `'session'` and `'session_log'`. No structural change to `PendingWriteSchema`. The existing flusher and reconcile logic in `src/client/sync/` work unchanged once a dispatch entry is added.

**`src/client/db/forge-db.ts` Dexie schema**
- Add `sessions` and `sessionSetLogs` stores alongside the existing `exercises`, `equipment`, `routines`, `pendingWrites`, `meta` stores. Reuse `useLiveQuery` patterns from `queries.ts` and the single-Dexie-transaction write convention from `mutations.ts`.

**`src/client/lib/theme.ts` + `src/client/styles.css` design tokens**
- Use existing CSS variables (`--bg`, `--surface`, `--border`, `--accent`, `--accent-fg`, `--text`, `--text-muted`, `--text-subtle`, `--radius-card`) for all logger surfaces. The amber **LOG SET** CTA, **START PLANNED** CTA, and superset accent come from `--accent`.

## Out of Scope

- Programs feature (week/day model, joining/advancing programs) beyond the program-day hydration contract.
- History aggregation dashboards / cross-exercise totals / weekly volume / streaks / calendar heatmaps. The history-list page tiles (THIS MONTH workouts / VOLUME / AVG DURATION) and date-range filter chips visible in `design/history-list.png` are explicitly deferred.
- Goals tracking.
- Today / homepage redesign.
- Settings-driven 1RM formula choice (Brzycki, Lombardi, etc.).
- Units display preference UI changes beyond consuming the existing global setting.
- Multiple concurrent in-progress sessions, "save-and-start-another" path.
- Finish grace window or "undo finish".
- Manual set-number entry as primary flow.
- Drop-set parent-child linkage / structured technique payloads (drop-weight arrays, pause durations, rest-pause cluster definitions) — drop sets are sequential rows with `setType='drop'`.
- Auto-deletion of orphaned logs when their planned slot is removed.
- Server-side aggregation, search, or query endpoints beyond CRUD over sessions and logs.
- Export functionality (CSV/PDF) beyond a placeholder button on the post-finish view.
- Bearer-token auth on `/api/v1/sessions` (consistent deferral with routines/exercises).
- Bulk import/export and bulk session/log endpoints.
