# Spec Requirements: Workout Sessions (Live Logger)

## Overview

Workout Sessions is the live execution layer of Forge — the counterpart to the routines template layer. Templates describe planning intent; sessions capture mutable reality. A session is hydrated at start time from one of three sources (a routine, a program day, or free-form), takes a structural snapshot of that source, and from that point forward evolves independently of the source. Later edits to the originating routine or program must never rewrite session history.

This spec covers the full live-logger surface: session lifecycle, the guided next-set progression engine, superset round progression, mid-session structural mutations (including superset reshaping), set logging, the rest timer, immutable finish, per-exercise history reads, and Epley 1RM estimation. It builds on the patterns established by the exercise library (Dexie-first, generic outbox, client-generated UUIDs, Zod-validated Hono endpoints) and reuses the routines template schema as its hydration source.

## Goals

- Hydrate a mutable session from a routine, a program day, or free-form, capturing a snapshot of the source at start.
- Provide a state-driven logger that knows the current exercise and expected next set; eliminate manual set-number entry as the primary flow.
- Progress supersets by round (A1 → A2 → A3, then round 2), keeping the group structurally consistent across set-count changes.
- Allow full mid-session structural edits — add/remove/reorder/swap exercises, add/remove sets, mutate superset structure (add/remove items, split a superset, convert single ↔ superset).
- Persist a rest timer that survives pause/resume, reload, and offline.
- Finish sessions into strictly immutable history with Epley 1RM computed on read.
- Surface per-exercise history (with last-time line and 1RM) from completed sessions.
- Establish session-side patterns (snapshot+live JSON storage, normalized log table, sub-resource log endpoints, outbox extension) that programs and history features will reuse.

## Non-goals (v1)

- Programs feature itself (week/day model, joining/advancing programs) — sessions only consume a program day reference and snapshot from the underlying routine.
- History aggregation dashboards beyond per-exercise history (totals across exercises, weekly volume, streaks).
- Goals tracking.
- Multiple concurrent in-progress sessions — only one in-progress session at a time.
- A grace window or "undo finish" after a session is finalized — finish is strictly immutable.
- Manual set-number entry as the primary flow (it is replaced by guided progression).
- Alternative 1RM formulas — Epley only in v1.
- Auto-deletion of orphaned logs when their planned slot is removed mid-session.
- Per-exercise default rest durations or smart timer suggestions beyond a user-adjustable default.
- Server-side aggregation or query endpoints beyond CRUD over sessions and their logs.

## Requirements Discussion

### First Round Questions (Tier 1 — strategic decisions)

**Q1 (Snapshot storage shape):** Should the routine/program-day snapshot be stored as embedded JSON on the session row (Option A), as copied normalized rows in session-side tables (Option B), or as a hybrid where structure is JSON and performed sets are normalized rows (Option C)?
**Answer:** Option B — hybrid. The template snapshot AND the live mutable session structure are stored as JSON on the session row (`templateSnapshot`, `liveStructure`). Performed set logs go into a separate normalized, indexed `session_set_logs` table. This keeps structural mutation cheap (single-row JSON write) while keeping logs queryable for history and 1RM.

**Q2 (Slot binding strictness):** When a logged set's planned slot is removed or reshaped mid-session, should logs be tightly bound to plannedSetId (and orphan/delete on removal) or loosely bound (logs survive as free-floating extras)?
**Answer:** Tight binding by default but flexible on removal. Each `session_set_logs` row carries a `plannedSetId` FK to the slot inside `liveStructure`, plus `performedExerciseId` identifying the exercise within the session. Skipped planned sets are represented by a log row with `status='skipped'`. Extra sets (beyond planned, or after planned slot removal) carry `plannedSetId=null` and `status='extra'`. Logs from removed planned slots are NEVER auto-deleted; they automatically reclassify as extras attached to the same `performedExerciseId`. If the entire performed exercise is removed, its logs likewise remain attached to that `performedExerciseId` and are still rendered in finish-time history.

**Q3 (Mid-session structural edit scope):** What scope of structural edits must v1 support — basic add/remove/reorder/swap of exercises and add/remove sets only, or also full superset structure mutation (adding/removing items inside a superset, splitting a superset, converting single↔superset)?
**Answer:** Full scope, including superset structure mutation. Specific rules:
- **Add exercise:** appended or inserted at chosen position; `liveStructure` mutated; no logs affected.
- **Remove exercise:** the exercise's slot is removed from `liveStructure`. Any existing logs for that `performedExerciseId` remain in `session_set_logs` and reclassify to `status='extra'` with `plannedSetId=null`. They still render in the post-finish summary and per-exercise history.
- **Reorder / swap:** order index in `liveStructure` changes; for swap, the new exercise inherits the slot but logs from the previous exercise (if any) remain bound to the original `performedExerciseId` (which is retained as a now-detached entry) — visualized as "previous attempt" in the summary.
- **Add set to a single exercise:** appends a planned set slot.
- **Remove set from a single exercise:** removes the slot; any log for that `plannedSetId` reclassifies to extra (per Q2).
- **Add set inside a superset:** adds a round for the WHOLE GROUP — every exercise in the superset gets a new planned slot at the new round index. This is the rule that keeps superset structure consistent.
- **Remove set inside a superset:** removes that round across the entire group; logs for any removed slots reclassify to extras (still attached to their respective `performedExerciseId`).
- **Add exercise into an existing superset:** new exercise is added to the group; it receives planned slots for all existing rounds (default prescription = blank or carry-over from neighbor — UI decision deferred to spec).
- **Remove exercise from a superset:** exercise leaves the group and is removed from the session entirely (its logs reclassify to extras as in single-exercise removal). If only one exercise remains in the group, the group auto-collapses to a single exercise.
- **Split a superset:** the group is broken into two consecutive single exercises (or two smaller groups, depending on UI affordance). Round structure is preserved per resulting unit.
- **Convert single → superset / superset → single:** wrap a single exercise into a new group (no immediate sibling — it becomes a one-item group awaiting another exercise) or unwrap a one-item group back into a single. Logs are unaffected; only structural metadata changes.
All structural edits are performed on `liveStructure` (JSON) in a single Dexie transaction together with any reclassifying log updates, then enqueued via the outbox. The `templateSnapshot` is NEVER mutated after session start.

**Q4 (Concurrency / one in-progress rule):** Does the app allow multiple paused/in-progress sessions, or strictly one in-progress at a time?
**Answer:** Strictly one in-progress session at a time. Attempting to start a new session while one is in-progress prompts the user with three options: **Resume** (open the existing session), **Discard** (delete the in-progress session and proceed with the new one), or **Cancel** (back out, keep the existing session untouched). There is no "save-in-progress-and-start-another" path in v1.

**Q5 (Finish immutability):** Once a session is finished, is it strictly immutable, or is there a grace window (e.g. 5 minutes / same-day) for corrections?
**Answer:** Strictly immutable. No grace window in v1. Once `finishedAt` is set, the session row, `templateSnapshot`, `liveStructure` (now functionally a frozen final structure), and all `session_set_logs` rows for that session become read-only. Corrections require the user to log a new session.

**Q6 (Rest timer persistence):** How should the rest timer survive pause/resume, app reload, and offline?
**Answer:** Rest timer state is persisted on the session row (fields: `restTimerStartedAt`, `restTimerDurationSec`, `restTimerPausedAt`, `restTimerStatus`). It is computed from wall-clock on render so reload/offline simply pick up where it left off. The timer is cleared (fields nulled) on session finish. Timer state is **never aggregated** into per-exercise history or 1RM calculations — it is purely a runtime convenience.

**Q7 (1RM formula):** Which 1RM estimation formula is canonical?
**Answer:** Epley (`weight * (1 + reps/30)`) only in v1. Computed on read (not stored). Surfaced in three places:
1. Per-exercise history view (best estimated 1RM, recent estimates).
2. Post-finish session summary.
3. Exercise detail page (the `EST 1RM` tile previously empty in the exercise-library spec).
Only sets with `setType='normal'` (or equivalent), positive `reps`, and positive `weight` contribute. Drop sets, warm-ups, and cardio-only sets are excluded from 1RM.

**Q8 (Free-form session shape):** Do free-form sessions reuse the same schema with a null source reference, or is it a separate flow?
**Answer:** Same schema, same logger UI. A free-form session is a session with `sourceType='freeform'`, `sourceRoutineId=null`, `sourceProgramDayRef=null`, and `templateSnapshot=null`. `liveStructure` starts empty and is built up through the same add-exercise affordance available mid-session. All other behavior (logging, rest timer, finish, history, 1RM) is identical.

**Q9 (Program-day hydration shape):** When starting from a program day, what does the session capture?
**Answer:** The session records `sourceType='program_day'`, `sourceProgramId`, `sourceProgramWeekIndex`, `sourceProgramDayIndex`, plus `templateSnapshot` containing the routine snapshot resolved from whatever routine that program day points at at the moment of start. Once captured, later changes to the program OR to the underlying routine do not affect the running session. The program feature itself is out of scope for this spec; only the hydration contract is defined here.

### Existing Code to Reference

**Similar features identified:**
- The exercise library (`specs/exercise-library/planning/spec.md` once written) is the pattern-setter for: Dexie tables, Zod schemas in shared layer, Hono CRUD routes, generic `pending_writes` outbox, client-generated UUIDs, list/detail/create page split, Tailwind v4 dark-mode styling. The session feature reuses these patterns directly.
- The routines template (`specs/routines/planning/spec.md`) is the upstream dependency: it defines the routine/exercise/set-prescription structure that the session snapshot mirrors at start time. Sessions read routines but never mutate them.
- The generic outbox (`pending_writes`) is extended by sessions: new `entity` discriminator values include `'session'` and `'session_log'`. The outbox shape itself is unchanged.
- Equipment and exercise references inside the snapshot are by ID (matching the routines convention); sessions resolve display data from the local Dexie cache, falling back to snapshot fields if a referenced exercise has since been deleted.

### Tier 2 Defaults Confirmed

The following implementation-level defaults are confirmed and stand without further discussion:
- **Units:** stored canonically in SI (kg, meters, seconds) on the log row; the user's display-unit preference (from global settings) governs render and input parsing. Each log row also stores the original entered value and unit for audit.
- **Endpoints:** sessions get standard CRUD at `/api/v1/sessions`; logs are sub-resources at `/api/v1/sessions/:id/logs` (POST/PATCH/DELETE on individual log rows, GET list scoped to the parent session).
- **Outbox extension:** new `entity` values `'session'` and `'session_log'`. No schema change to `pending_writes`.
- **Progression cursor:** stateless — the "current exercise / next set" pointer is derived on each render from `liveStructure` + `session_set_logs` (lowest-indexed slot whose status is neither `logged` nor `skipped`, walking by round for supersets). No cursor field is persisted.
- **Reuse-prior-values pre-fill:** when entering a planned slot, the input fields pre-fill from the user's most recent logged set for the same exercise (querying the local `session_set_logs` cache). For a free-form add-set, pre-fill from the most recent log of that exercise. Pre-fill is purely a UX hint and is overwritten by user input.
- **`setType` model:** per-set enum field on the log row (`normal | warmup | drop | failure | amrap | …`); setType can be changed mid-session and is captured in the log. Drop sets are not linked to a parent set in v1 (no parent-child relation); they are just a set with `setType='drop'` in sequence.

### Mockup Interpretations Confirmed

The logger mockups (under `design/`) drive these confirmed interpretations:
- **Header counter:** the top of the logger shows a session-wide progress counter (e.g. "Set 4 of 18") summed across all planned slots in `liveStructure`, excluding extras.
- **"Last time" line:** under each exercise heading, a muted line reads "Last time: 3 × 8 @ 60kg" or similar, sourced from the most recent completed session's logs for that exercise. Empty/hidden if no prior history.
- **Placeholder rows:** unlogged planned slots render as muted placeholder rows showing the prescription (target reps × target weight). Tapping a placeholder opens the inline log editor for that slot.
- **Position pip dots:** within a superset block, small dots indicate position in the round (filled = logged, hollow = pending, current = highlighted). Dots are per-round and reset visually each round.

### Visual Assets

No visual assets currently in `specs/workout-sessions/planning/visuals/` — the canonical mockups for the logger live under the project-level `design/` directory and should be referenced from there during spec writing.

## Requirements Summary

### Functional Requirements

- Start a session from one of three sources: a routine, a program day, or free-form. Capture an immutable `templateSnapshot` and seed `liveStructure` from it (or empty for free-form).
- Enforce a single in-progress session globally, with Resume / Discard / Cancel prompt on conflict.
- Persist session state offline-first via Dexie; flush via the generic outbox.
- Drive logging via a state-driven cursor computed from `liveStructure` + `session_set_logs`. The user does not enter set numbers manually.
- Progress supersets by round across all members of the group; keep group structure consistent across set-count edits (adding a set adds a round to the whole group; removing a set removes that round across the group).
- Allow full mid-session structural mutations as enumerated in Q3, with the orphan-becomes-extra rule (Q2) applied uniformly.
- Capture per-set fields: reps, weight, RPE, duration, distance, notes, setType. Units stored in SI; display via user preference.
- Run a persistent rest timer (start/pause/stop/adjust, auto-start on log), state on the session row, cleared on finish.
- Pause/resume (implicit — leaving and returning), discard (delete session and its logs), and finish (immutable seal) lifecycle actions.
- Compute Epley 1RM on read for eligible sets and surface in per-exercise history, post-finish summary, and exercise detail.
- Per-exercise history view: list of past sessions touching that exercise, with set-by-set detail and 1RM trend.
- Render mockup elements: header counter, "last time" line, placeholder rows, superset round pip dots.

### Reusability Opportunities

- Reuse `pending_writes` outbox unchanged; add `'session'` and `'session_log'` entity discriminators.
- Reuse Zod-shared-schema and Hono-route patterns from exercise library.
- Reuse routines template schema as the source for `templateSnapshot` shape (sessions copy, never reference live).
- Reuse global units-preference setting and the same number-input components used elsewhere.
- Reuse the exercise-detail page's empty stat tiles by wiring them to per-exercise history aggregations.

### Scope Boundaries

**In Scope:**
- Session entity (with embedded `templateSnapshot` + `liveStructure` JSON).
- `session_set_logs` normalized indexed table.
- Session and session-log CRUD endpoints (`/api/v1/sessions`, `/api/v1/sessions/:id/logs`).
- Logger UI: state-driven progression, superset round flow, mid-session structural edits (full scope), rest timer, lifecycle controls, finish summary.
- Per-exercise history read view.
- Epley 1RM computed on read.
- Free-form sessions through the same schema and UI.
- Program-day hydration contract (consume program reference, snapshot underlying routine).

**Out of Scope:**
- Programs feature (week/day model, advancement) beyond the hydration contract.
- Cross-exercise history aggregations / dashboards / totals.
- Goals.
- Multiple concurrent in-progress sessions.
- Finish grace window / undo.
- Alternative 1RM formulas.
- Manual set-number entry as primary flow.
- Drop-set parent-child linkage.
- Auto-deletion of orphaned logs.

### Technical Considerations

- **Storage shape:** session row carries `templateSnapshot` (frozen JSON) and `liveStructure` (mutable JSON). `session_set_logs` is normalized with FKs `sessionId`, `performedExerciseId`, `plannedSetId` (nullable), and indexes on `(sessionId)`, `(exerciseId, performedAt)` for history reads.
- **Slot binding rules:** see Q2 — tight by default, orphan-on-removal becomes extra, never auto-delete.
- **Structural edit rules:** see Q3 — superset add/remove set ⇒ whole-group round mutation; removed slots' logs reclassify to extras attached to the same `performedExerciseId`.
- **Concurrency:** single-active-session invariant enforced client-side via a Dexie query at start; server endpoint MAY also reject creation of a second `in_progress` session, but the client is the source of truth.
- **Immutability:** finish sets `finishedAt`; subsequent PATCH/DELETE on the session or its logs are rejected client-side and server-side.
- **Rest timer:** fields persisted on the session row; computed from wall-clock; cleared on finish; never aggregated.
- **1RM:** Epley, computed on read, only over sets with `setType='normal'`, `reps>0`, `weight>0`.
- **Units:** canonical SI on the log row, plus original entered value + unit for audit; display via global units preference.
- **Endpoints:** sub-resource log endpoints under the session.
- **Outbox:** extended via new entity discriminators only.
- **Progression cursor:** stateless, derived per render.
- **Pre-fill:** reuse-prior-values from local log cache.
- **Offline:** all writes go to Dexie + outbox first, identical to exercise-library pattern.
