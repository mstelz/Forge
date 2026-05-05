# Spec Requirements: Goals

## Overview

Goals are user-defined training targets shown on `/goals` (a dense, filterable list of cards) and edited via `/goals/new` and `/goals/:id/edit` (a category-aware single-page form). Goals span six categories — `strength`, `cardio`, `weight`, `measurement`, `program`, `other` — each with a deadline, optional start/target values, optional notes, and a progress percentage rendered as an amber bar plus a "X weeks left" countdown. The slice introduces one new Drizzle table (`goals`), one Zod module (`src/shared/goals.ts`), a Hono CRUD sub-router under `/api/v1/goals`, and a Dexie mirror that reuses the established `pending_writes` outbox unchanged.

Goals are **derived-on-read** for any category whose progress can be computed from existing data (`strength`, `cardio`, `program`); manually-tracked categories (`weight`, `measurement`, `other`) store their current value directly on the goal row. There is no separate body-metric log table in v1.

Visual references (authoritative): `design/goals-list.png` + `design/goals-list.json`, `design/goal-form.png` + `design/goal-form.json`. PRD: `docs/PRD.md` §Goals, §Goal progress page.

## Goals

- Let the single user create, view, edit, complete, abandon, and delete goals across six categories, fully offline.
- Surface live progress for `strength`, `cardio`, and `program` goals derived from existing `session_set_logs` and `program_run_day_states` data — no duplicated state, no migrations when those tables change shape.
- Surface user-entered progress for `weight`, `measurement`, and `other` goals via a single `currentValue` field on the goal row, editable from the detail surface.
- Match the goals-list and goal-form mockups in card layout, dense typography, amber progress bars, and category-aware form fields.
- Reuse the Dexie + outbox + Tanstack Query pattern established by exercise-library verbatim; no new persistence primitives.

## Non-goals (v1)

- Separate body-metric / measurement log table or trend charts for weight / waist / etc.
- Goal-progress charts or per-goal contribution lists on the detail surface (deferred to a later "goal-detail" iteration once history page lands; v1 detail is form-only with a progress card).
- Reminders, notifications, or push (deadline countdown is purely visual).
- Sharing, public goals, social features.
- Multi-user / per-user isolation, auth UI.
- Bulk endpoints, bulk import/export.
- Auto-creating goals from program runs (program goals are user-created and link to an existing run).
- Cross-category goals (one goal = one category).
- Settings-driven units; v1 goal display reads `units` from existing user settings or defaults to `lb` for weight and `min:sec` for cardio time, mirroring sibling specs.

## User stories

- As the single user, I open `/goals`, see active goals first sorted by deadline ascending, with an amber progress bar and "X weeks left" badge per card.
- As the user, I tap `+`, pick a category (segmented control), fill the category-aware form, and save — the goal appears immediately, fully offline.
- As the user with a `Squat 315 lb` strength goal, I link the goal to the `Barbell Back Squat` exercise and the form pre-fills my `Start` value from the current best Epley 1RM observed in `session_set_logs`.
- As the user, I narrow the list with chips: `Active` (default amber-filled) / `Completed` / `All`, plus a category filter row (`Strength` · `Cardio` · `Weight` · `Measurement` · `Program` · `Other`).
- As the user, I tap a card → see goal detail with the same form (read-only mode flippable to edit) plus a larger progress card; from there I can update `currentValue` for manual categories, mark the goal complete, abandon it, or delete it.
- As the user, I change my mind and edit a saved strength goal's exercise link or target — progress recomputes on next read.
- As the user, I do all of the above offline; my changes show up immediately and reconcile when online.

## Data model

One new entity. IDs are client-generated UUIDs; the server accepts client-supplied IDs and returns 409 on collision (consistent with sibling specs).

### Goal

- `id` — UUID, client-generated, primary key
- `category` — enum, required: `strength | cardio | weight | measurement | program | other`
- `title` — string, required, 1–120 chars (e.g., "Squat 315 lb", "Bodyweight 180 lb")
- `direction` — enum, required: `up | down`. Determines whether progress = (current − start)/(target − start) or (start − current)/(start − target). Defaults per category: `up` for `strength`, `program`, `other`; `down` for `cardio` (faster time = lower number = down), `weight`, `measurement`. User can override on `other`; locked for the rest.
- `startValue` — number, nullable. Required for `strength`, `cardio`, `weight`, `measurement`, `other`; null for `program`.
- `targetValue` — number, nullable. Required for `strength`, `cardio`, `weight`, `measurement`, `other`; null for `program`.
- `currentValue` — number, nullable. **Manual categories only** (`weight`, `measurement`, `other`): stored value, last-updated by the user. **Derived categories** (`strength`, `cardio`, `program`): null in storage, computed on read.
- `unit` — string, nullable. Free-form short label rendered next to the numeric (`lb`, `kg`, `in`, `cm`, `min:sec`, etc.). Required for `strength`, `cardio`, `weight`, `measurement`; null for `program`, optional for `other`.
- `linkedExerciseId` — UUID, nullable, FK into `exercises`. Required for `strength` and `cardio`; null otherwise.
- `linkedProgramRunId` — UUID, nullable, FK into `program_runs`. Required for `program`; null otherwise.
- `deadline` — integer (timestamp_ms), nullable. Optional for all categories; if present, drives the "X weeks left" badge and the default sort.
- `notes` — string, nullable, free-form, no length cap beyond a sanity limit.
- `status` — enum, required: `active | completed | abandoned`. Defaults to `active`. Auto-set to `completed` (with `completedAt` set) when progress crosses 100% on the next read for derived categories, or on `currentValue` save for manual categories. User can manually override (mark complete early, mark abandoned, or revert completed → active).
- `completedAt` — integer (timestamp_ms), nullable. Set when `status` transitions to `completed`; cleared on revert.
- `createdAt` — integer (timestamp_ms), required.
- `updatedAt` — integer (timestamp_ms), required.

No `archivedAt`, no `priority`, no `parentGoalId`, no `tags`.

### Progress computation (read-side, client-side)

Goals expose a derived `progress: { currentValue: number | null, percent: number, isComplete: boolean }` computed by a helper in `src/client/goals/progress.ts`:

- **`strength`**: scan `session_set_logs` for `linkedExerciseId` since `createdAt` (and where `status='logged'`, `setType IN ('normal','amrap','to_failure','drop_set','rest_pause')`, `reps > 0`, `weightKg > 0`); compute Epley 1RM per row; `currentValue` = max observed (converted to goal `unit`); `percent` = clamp((current − start)/(target − start), 0, 1).
- **`cardio`**: same scan but compute the best per-row metric matching the goal's `unit` (e.g., for time-under-X cardio: minimum `durationSec` where `distanceM` ≥ target distance). When no log meets the criterion, `currentValue` = `startValue`, `percent` = 0.
- **`program`**: read the linked `program_run` plus its `program_run_day_states`; `currentValue.weeks` = max(week index over day states with `state='completed'`); `percent` = completedDays / totalDays.
- **`weight` / `measurement` / `other`**: pass-through `currentValue` from the row; `percent` derived from `direction`, `start`, `target`, `current`.
- `isComplete` = `percent >= 1` OR `status === 'completed'`. Status auto-update to `completed` happens inside the same transaction that observes the threshold (for manual categories: on PATCH; for derived: on a lightweight reconcile pass triggered by session finish — see Sync section).

### `goals` Drizzle / Dexie store

Drizzle table `goals` mirrors the fields above (numeric columns as `real`, JSON-encoded fields not needed). Indexes: `idx_goals_status` on `status`, `idx_goals_category` on `category`, `idx_goals_deadline` on `deadline`, `idx_goals_updated_at` on `updatedAt`. Dexie store `goals` mirrors the schema 1:1, indexed by `status`, `category`, `deadline`, `updatedAt`.

### Outbox

Reuses the existing `pending_writes` table verbatim; new discriminator value `'goal'` for the `entity` column. Payload = full record on create/update; `{ id }` on delete. No schema migration.

## API surface

All endpoints under `/api/v1/goals`. No auth gate in v1 (consistent deferral with sibling slices).

- `GET /api/v1/goals` — full list. Filtering is client-side. Returns `200 { goals: Goal[] }`.
- `GET /api/v1/goals/:id` — single record.
- `POST /api/v1/goals` — create. Accepts client-supplied `id`; 409 on collision. Body validated by `GoalCreateSchema`.
- `PATCH /api/v1/goals/:id` — partial update. Body validated by `GoalUpdateSchema`. Partial body validated category-aware: server enforces required fields per category by re-running full schema after merge.
- `DELETE /api/v1/goals/:id` — hard delete.

No sub-resources, no bulk endpoints. No server-side aggregation endpoints — progress is computed client-side over the same Dexie data the rest of the app already reads.

Request/response validation lives in `src/shared/goals.ts` and is reused by both client and server.

## UI pages and behaviors

Routes:

- `/goals` — list (active by default).
- `/goals/new` — create (full-page form).
- `/goals/:id` — detail (read-only render of the form plus a larger progress card; kebab menu with Edit / Mark complete / Abandon / Delete).
- `/goals/:id/edit` — edit (same form, prefilled).

### List page (`/goals`)

Visual reference: `design/goals-list.png` + `design/goals-list.json`.

Top-to-bottom:

1. Top bar: hamburger left, amber **GOALS** title, `+` action that routes to `/goals/new`.
2. Single horizontal-scrolling filter chip row, two visual segments separated by a thin divider:
   - Status segment (single-select, default `Active`): `Active` (amber fill when active) · `Completed` · `All`.
   - Category segment (single-select, default none): `Strength` · `Cardio` · `Weight` · `Measurement` · `Program` · `Other`. Selecting a category adds an AND filter; tapping the active chip clears it.
3. Stack of goal cards, sorted by deadline ascending (nulls last), then `updatedAt` descending. Each card:
   - Top row: small muted category pill (`STRENGTH` / `WEIGHT` / `CARDIO` / `MEASUREMENT` / `PROGRAM` / `OTHER`), bold title, right-aligned muted "X weeks left" (`Xd left` once under 14 days; `OVERDUE` in muted red if deadline has passed and status is still active; hidden if `deadline` is null).
   - Big tabular numerics line: `<currentValue> / <targetValue> <unit>` (program: `Week <currentWeek> / <totalWeeks>`).
   - Amber progress bar with right-aligned percent (`80%`); rendered grey at 0% with a hairline.
   - Muted footer: `Started <Mon DD> · Target <Mon DD>` (target hidden if no deadline).
4. Empty state: when no goals exist at all, full-card empty state with a `+ New goal` CTA. When the active filter excludes everything, a dim "No matching goals" line plus a `Clear filters` button.

Tap a card → `/goals/:id`.

### Detail page (`/goals/:id`)

Visual reference: same form mockup, with a stat card at top.

1. Top bar: back arrow, amber **GOAL** label, kebab menu with **Edit**, **Mark complete** (or **Mark active** if already completed), **Abandon**, **Delete**.
2. Top progress card: oversized tabular numerics for `currentValue / targetValue <unit>`, amber progress bar, "X weeks left" / "OVERDUE" / "COMPLETED on <date>" line.
3. Below the card, render the form fields read-only (title, category, exercise/program link, start, target, deadline, notes, direction). Tap any field row or `Edit` to navigate to `/goals/:id/edit`.

No per-goal history list, no charts, no contribution log in v1 — deferred.

### Create / Edit pages (`/goals/new`, `/goals/:id/edit`)

Visual reference: `design/goal-form.png` + `design/goal-form.json`. One full-page, category-aware form. Cancel discards.

Sections (each grouped in a subtle card):

1. **Type** — segmented control with six options across two rows: `Strength` · `Cardio` · `Weight` · `Measurement` · `Program` · `Other`. Required. Selecting a category mutates the rest of the form (see Category-aware fields below).
2. **Title** — text input, required.
3. **Start / Target** (hidden for `program`) — two side-by-side numeric inputs with a unit dropdown. For `cardio`, the unit dropdown switches the inputs to a `mm:ss` mask with a paired distance field. For `strength`, unit = `lb` / `kg` (default per global settings). For `weight` / `measurement`, unit = `lb` / `kg` / `in` / `cm` / etc. Helper text: "Current: auto-filled from <linked exercise> PR" when applicable.
4. **Linked exercise** (visible only for `strength`, `cardio`) — outlined picker button. Required. Tap opens a single-select sheet over the Dexie `exercises` table, filtered by `type='strength'` for strength goals and `type='cardio' OR type='mixed'` for cardio goals.
5. **Linked program run** (visible only for `program`) — outlined picker button. Required. Tap opens a single-select sheet over Dexie `program_runs` (active and historical).
6. **Deadline** — date field with calendar picker. Optional.
7. **Notes** — multiline text area. Optional.
8. **Direction** (visible only for `other`) — small toggle: `Higher is better` / `Lower is better`. Locked for the other categories (defaults applied automatically per Data Model).
9. Bottom: large amber `CREATE GOAL` button (or `SAVE` for edit). Disabled until required fields per category validate.

### Category-aware fields summary

| Category | Required | Hidden | Notes |
|---|---|---|---|
| `strength` | title, linkedExercise, startValue, targetValue, unit, direction (locked `up`) | linkedProgramRun | Start can be auto-filled from observed Epley 1RM. |
| `cardio` | title, linkedExercise, startValue, targetValue, unit, direction (locked `down`) | linkedProgramRun | Time-under-X uses `mm:ss` mask. |
| `weight` | title, startValue, targetValue, unit, direction (locked `down`) | linkedExercise, linkedProgramRun | currentValue editable from detail. |
| `measurement` | title, startValue, targetValue, unit, direction (locked `down`) | linkedExercise, linkedProgramRun | currentValue editable from detail. |
| `program` | title, linkedProgramRun, direction (locked `up`) | linkedExercise, startValue, targetValue, unit | currentValue derived. |
| `other` | title, startValue, targetValue, direction (user-selectable) | linkedExercise, linkedProgramRun | currentValue editable from detail. |

`deadline` and `notes` are optional for every category.

## Search, filter, and sort semantics

- No free-text search in v1 (deferred; goal counts are small and `title` is shown on the card).
- Status filter: single value from `{Active, Completed, All}`; default `Active`.
- Category filter: single value from the six categories or none. Combines AND with status.
- Sort: deadline ascending, nulls last, tiebreak `updatedAt` descending. `Completed` and `All` views sort `completed` goals after `active`/`abandoned` within each filter.
- All filtering and sorting happens client-side over the full Dexie cache.

## Offline and sync model

Reuses the established Dexie-first + `pending_writes` outbox pattern verbatim:

- Reads go through Dexie (`useLiveQuery` + Tanstack Query). Goal progress is computed in `src/client/goals/progress.ts` from the same Dexie reads the rest of the app uses (`session_set_logs`, `program_run_day_states`).
- Writes hit Dexie first; the same transaction appends a `pending_writes` row with `entity='goal'`. The flusher drains as for every other entity.
- Conflict handling: last-write-wins by `updatedAt`. Server accepts client-supplied IDs and timestamps; 409 on ID collision.
- Reconciliation pass on session finish (already triggered by workout-sessions for PR detection) calls a small `reconcileGoals()` helper that: (a) recomputes derived `currentValue` for active strength/cardio/program goals; (b) auto-flips `status` to `completed` and sets `completedAt` when `percent` first hits 1.0; (c) enqueues a single `update` outbox entry per affected goal. Manual categories transition on PATCH directly.

## Seed data strategy

No seed goals shipped. New deployments start with an empty `goals` table and a clean `/goals` empty state.

## Validation rules

- `category`: required, one of the six enum values.
- `title`: required, trimmed, length 1–120.
- `startValue`, `targetValue`: required per category table above; finite numbers; `targetValue !== startValue`.
- `unit`: required per category table above; trimmed, length 1–16.
- `direction`: required; `up` or `down`. Locked per category for everything except `other`.
- `linkedExerciseId`: required for `strength` and `cardio`; must reference an existing exercise at submit time (client-validated; server soft-validates).
- `linkedProgramRunId`: required for `program`; must reference an existing program run.
- `deadline`: optional; if present, must be `> createdAt`.
- `notes`: optional; sanity limit ~4000 chars.
- `status`: defaults `active`; transitions enforced server-side (`active ↔ completed`, `active ↔ abandoned`, `abandoned → active`, `completed → active`).
- `completedAt`: must be present iff `status='completed'`.
- All validation in `src/shared/goals.ts`, reused by client and server. Per-category required-field enforcement is implemented as a Zod `superRefine` on `GoalSchema` (the merge of `GoalBaseSchema` + per-category guards).

## Existing code to reference

- `specs/exercise-library/planning/spec.md` — page shell pattern (top bar, single horizontal-scrolling chip row, list/detail/edit page split, empty/loading states), Dexie + outbox + Tanstack Query convention. Reuse `pending_writes` table verbatim with `entity='goal'`.
- `specs/workout-sessions/planning/spec.md` — `session_set_logs` shape, the exported Epley helper, the post-finish reconcile hook (extend it to call `reconcileGoals()`).
- `specs/programs/planning/spec.md` — `program_runs` and `program_run_day_states` shape; reuse for `program` goal progress.
- `src/client/db/forge-db.ts` and `src/client/db/queries.ts` — add a `goals` Dexie store and matching query helpers following the `exercises.ts` / `equipment.ts` shape.
- Architectural context: `docs/PRD.md` §Goals + §Goal progress page; `docs/PRODUCT-PLAN.md`; `docs/decisions/0004-tech-stack.md`; `docs/decisions/0005-offline-strategy.md`.

## Visual assets

- `design/goals-list.png` + `design/goals-list.json` — list screen, two-segment chip row, dense card stack, oversized tabular numerics, amber progress bar, "X weeks left" badge. Authoritative for layout.
- `design/goal-form.png` + `design/goal-form.json` — form screen, segmented type control (six options across two rows), category-aware fields (linked exercise visible only for strength), large amber primary button. Authoritative for layout.

Visual insights:
- Dark mode (#0B0B0C bg, #17181A surfaces, #26272A borders), amber #F59E0B accent, Inter typography, 14px rounding.
- Progress bars are 4–6px tall, amber fill, tabular percent label right-aligned.
- "Weeks left" countdown is muted and right-aligned in the card top row.
- Form sections sit in distinct subtle cards (no hairline-separator-only blocks).
- No bottom tab bar; nav is the global drawer.

## Out of scope (explicit, v1)

- Per-goal history list, contribution charts, or trend lines on the detail surface.
- Body-metric / measurement log table and weight/waist trend charts.
- Auto-creation of goals from program runs.
- Reminders, notifications, or push.
- Sharing, public goals, social features.
- Multi-user / per-user isolation, auth UI.
- Bulk import, bulk endpoints, bulk export (export covered by the dedicated export spec).
- Free-text search on goals.
- Multi-category goals or sub-goals.
- Settings-driven units UI; v1 reads existing global units settings or uses the form-supplied `unit` string verbatim.

## Open items and deferred concerns

- **Default unit selection.** The form's unit dropdown defaults from global settings (`weightUnit`, `lengthUnit`) where they exist; otherwise `lb` for strength/weight and `in` for measurement. Pin down the exact settings keys when the settings spec lands.
- **Cardio goal shape.** "Run 5k under 25:00" combines a fixed distance and a target time; a "Row 30 min" goal combines a fixed duration and a target distance. v1 stores `startValue` / `targetValue` as the **primary metric** the user is improving and uses `unit` to disambiguate (`min:sec`, `mi`, `km`, `m`). The non-improving leg (the fixed distance for time-under, the fixed duration for distance-under-time) lives in `notes` for v1 and is formalized as a separate column once cardio logging matures.
- **Status transition UX.** `Mark complete` is exposed in the kebab; `Abandon` is too. Whether both are needed, or `Abandon` collapses into `Delete`, can be settled during UI build.
- **Reconcile fan-out.** The `reconcileGoals()` hook is invoked on session finish only in v1. If a user retro-edits an old session log, derived progress will refresh on next read but the stored `status` / `completedAt` won't auto-flip. Documented as a known limitation.
- **Linked-program-run lifecycle.** When the linked program run is deleted, the goal's `linkedProgramRunId` is preserved and `progress.percent` falls back to 0 with a muted "Linked program removed" line. Soft vs. hard handling can be revisited.
- **`other`-category direction default.** `up` by default; the toggle exposed in the form lets the user flip per-goal.
