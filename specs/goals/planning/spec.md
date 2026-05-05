# Specification: Goals

## Overview

Goals are user-defined training targets with a deadline, progress, and category — `strength | cardio | weight | measurement | program | other`. The slice ships a single new Drizzle table (`goals`), a Zod module at `src/shared/goals.ts`, a Hono CRUD sub-router at `/api/v1/goals`, a Dexie store + matching query helpers, four React routes (`/goals`, `/goals/new`, `/goals/:id`, `/goals/:id/edit`), and a small client-side `progress.ts` helper that derives live progress from existing data already owned by sibling specs (`session_set_logs`, `program_run_day_states`). It reuses the `pending_writes` outbox verbatim with a new `'goal'` discriminator. Visual references: `design/goals-list.png` and `design/goal-form.png` are authoritative.

## Goals

- Let the single user create, view, edit, complete, abandon, and delete goals across six categories, fully offline.
- Surface live progress for `strength`, `cardio`, and `program` goals derived from existing data — no aggregation columns, no migrations when source tables change shape.
- Surface user-entered progress for `weight`, `measurement`, and `other` goals via a single `currentValue` field on the goal row.
- Match the goals-list and goal-form mockups in card layout, dense typography, amber progress bars, "X weeks left" countdown, and category-aware form fields.
- Reuse the Dexie + outbox + Tanstack Query pattern from exercise-library verbatim.

## Non-goals (v1)

- Body-metric / measurement log table or trend charts (deferred).
- Goal-progress charts, contribution lists, or per-exercise drill-down on the detail surface.
- Reminders, push, notifications, or email digests.
- Sharing, public goals, social features.
- Multi-user / per-user isolation, auth UI, bearer-token gating on `/api/v1/goals` (consistent deferral with sibling slices).
- Bulk endpoints, bulk import (export covered by the export spec).
- Auto-creating goals from program runs.
- Cross-category goals or sub-goals.
- Free-text search on goals.

## User flows

1. **Empty state.** First open of `/goals` → empty state card with `+ New goal` CTA → tap `+` in top bar (or the CTA) → `/goals/new`.
2. **Create.** Pick a category in the segmented control → form mutates to the category's required fields → fill title, start, target, unit, linked exercise / program run as appropriate, deadline, notes → tap `CREATE GOAL` → Dexie write + outbox append in one transaction → navigate back to `/goals`, new card visible.
3. **Browse and find.** `/goals` renders cards from Dexie sorted by deadline ascending, nulls last. User taps a status chip (`Active` default → `Completed` / `All`) and/or a category chip; both filters AND together.
4. **View.** Tap a card → `/goals/:id`. Top progress card shows `currentValue / targetValue <unit>`, amber bar, "X weeks left" / "OVERDUE" / "COMPLETED on <date>". Below it the form fields render read-only.
5. **Edit.** From detail, kebab → Edit → `/goals/:id/edit`, form prefilled, same validation. Submit → Dexie update + outbox append. Cancel discards.
6. **Update current value (manual categories).** From detail's progress card, tap the `currentValue` numeric → inline editor → save → Dexie update + outbox append. If the new value crosses the target, status auto-flips to `completed` and `completedAt` is set in the same transaction.
7. **Mark complete / abandon.** From detail, kebab → Mark complete (sets `status='completed'`, `completedAt=now`) or Abandon (sets `status='abandoned'`); Mark active reverts. Each is a single PATCH; outbox enqueued.
8. **Delete.** From detail, kebab → Delete → confirm → Dexie delete + outbox enqueues delete → navigate to list.
9. **Session-finish reconcile.** When a session is finished (workout-sessions hook), `reconcileGoals()` recomputes derived progress for active strength/cardio goals; any that crossed 1.0 auto-flip to `completed`, with one outbox `update` entry per affected goal.
10. **Back online.** The existing outbox flusher drains pending writes against `/api/v1/goals` exactly as for every other entity.

## Data model

All IDs are client-generated UUIDv4. Client-supplied IDs accepted on create; server returns 409 on collision (consistent with sibling specs).

### Drizzle table (`src/db/schema.ts`, SQLite via `bun:sqlite`)

**`goals`**
- `id` — `text` primary key (UUID)
- `category` — `text` not null; one of `'strength' | 'cardio' | 'weight' | 'measurement' | 'program' | 'other'`
- `title` — `text` not null
- `direction` — `text` not null; `'up' | 'down'`
- `startValue` — `real` nullable
- `targetValue` — `real` nullable
- `currentValue` — `real` nullable (manual categories only; null for derived)
- `unit` — `text` nullable
- `linkedExerciseId` — `text` nullable, FK into `exercises(id)` (no cascade; soft-validated)
- `linkedProgramRunId` — `text` nullable, FK into `program_runs(id)` (no cascade)
- `deadline` — `integer` (timestamp_ms) nullable
- `notes` — `text` nullable
- `status` — `text` not null default `'active'`; one of `'active' | 'completed' | 'abandoned'`
- `completedAt` — `integer` (timestamp_ms) nullable
- `createdAt` — `integer` (timestamp_ms) not null
- `updatedAt` — `integer` (timestamp_ms) not null
- Indexes: `idx_goals_status` on `status`, `idx_goals_category` on `category`, `idx_goals_deadline` on `deadline`, `idx_goals_updated_at` on `updatedAt`, `idx_goals_linked_exercise` on `linkedExerciseId`, `idx_goals_linked_program_run` on `linkedProgramRunId`.

No new outbox table — reuse `pending_writes` with `entity='goal'`.

### Dexie store (`src/client/db/forge-db.ts`, IndexedDB)

`goals` store mirrors the Drizzle row shape 1:1. Indexes: `id` (primary), `status`, `category`, `deadline`, `updatedAt`, `linkedExerciseId`, `linkedProgramRunId`.

### Zod schemas (`src/shared/goals.ts`)

```ts
export const GoalCategoryEnum = z.enum([
  'strength', 'cardio', 'weight', 'measurement', 'program', 'other',
]);
export const GoalStatusEnum = z.enum(['active', 'completed', 'abandoned']);
export const GoalDirectionEnum = z.enum(['up', 'down']);

export const GoalBaseSchema = z.object({
  id: z.string().uuid(),
  category: GoalCategoryEnum,
  title: z.string().trim().min(1).max(120),
  direction: GoalDirectionEnum,
  startValue: z.number().finite().nullable(),
  targetValue: z.number().finite().nullable(),
  currentValue: z.number().finite().nullable(),
  unit: z.string().trim().min(1).max(16).nullable(),
  linkedExerciseId: z.string().uuid().nullable(),
  linkedProgramRunId: z.string().uuid().nullable(),
  deadline: z.number().int().nullable(),
  notes: z.string().max(4000).nullable(),
  status: GoalStatusEnum,
  completedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const GoalSchema = GoalBaseSchema.superRefine(enforceCategoryShape);
export const GoalCreateSchema = GoalSchema; // full record on create (client-supplied id + timestamps)
export const GoalUpdateSchema = GoalBaseSchema.partial().extend({ id: z.string().uuid() })
  .superRefine(enforceCategoryShapeAfterMerge);
```

`enforceCategoryShape` enforces the per-category required/forbidden field matrix:

| Category | Required | Forbidden |
|---|---|---|
| `strength` | startValue, targetValue, unit, linkedExerciseId, direction='up' | linkedProgramRunId |
| `cardio` | startValue, targetValue, unit, linkedExerciseId, direction='down' | linkedProgramRunId |
| `weight` | startValue, targetValue, unit, direction='down' | linkedExerciseId, linkedProgramRunId |
| `measurement` | startValue, targetValue, unit, direction='down' | linkedExerciseId, linkedProgramRunId |
| `program` | linkedProgramRunId, direction='up' | startValue, targetValue, unit, linkedExerciseId |
| `other` | startValue, targetValue, direction (any) | linkedExerciseId, linkedProgramRunId |

Plus: `targetValue !== startValue` when both present; `deadline > createdAt` when present; `completedAt` present iff `status='completed'`.

### Progress helper (`src/client/goals/progress.ts`)

```ts
export type GoalProgress = {
  currentValue: number | null;
  percent: number;       // clamped [0, 1]
  isComplete: boolean;   // percent >= 1 OR status === 'completed'
  hasInsufficientData: boolean;
};

export function computeGoalProgress(
  goal: Goal,
  ctx: { setLogs: SessionSetLog[]; programRun?: ProgramRun; programDayStates?: ProgramRunDayState[] }
): GoalProgress;
```

- **`strength`**: scan `ctx.setLogs` filtered to `exerciseId === goal.linkedExerciseId`, `status='logged'`, `setType IN ('normal','amrap','to_failure','drop_set','rest_pause')`, `reps > 0`, `weightKg > 0`, `loggedAt >= goal.createdAt`; compute Epley 1RM (re-export from workout-sessions: `epley(weightKg, reps)`); `currentValue` = max observed (converted to `goal.unit` via shared `convertWeight()` helper); `percent = clamp((current − start)/(target − start), 0, 1)`.
- **`cardio`**: scan `ctx.setLogs` for the linked exercise; pick the row that best satisfies the goal's primary metric (interpreted from `goal.unit`: `min:sec` → minimum durationSec; `mi`/`km`/`m` → max distance; `kcal` → max kcal). Conversion via shared helpers; `percent` computed per `direction`.
- **`program`**: from `ctx.programRun` and `ctx.programDayStates`, `currentValue` = count of `state='completed'` day states; `percent = currentValue / totalDayCount`. Goal's "Week N / Total" display is derived from the program's week count.
- **`weight` / `measurement` / `other`**: pass through `goal.currentValue`; `percent` per `direction`, `start`, `target`, `current`.
- `hasInsufficientData = true` when a derived category has no contributing data and `currentValue` falls back to `startValue`. UI renders 0% with a muted "No data yet" line.
- `isComplete = percent >= 1 OR goal.status === 'completed'`.

### Reconcile hook (`src/client/goals/reconcile.ts`)

Invoked on session finish (workout-sessions calls `reconcileGoals(finishedSessionId)`). For each `status='active'` goal in categories `strength | cardio | program`:

1. Recompute progress.
2. If `percent >= 1` and `status === 'active'`: set `status='completed'`, `completedAt=now`, persist to Dexie, append a single `pending_writes` entry per affected goal (`entity='goal'`, `op='update'`, full record payload).
3. No persistence side-effects when `percent < 1`.

Manual categories transition on the user's PATCH directly; no scheduled reconcile.

## API surface

All routes under `src/server/routes/goals.ts`, registered under `/api/v1/goals`. JSON in/out. No auth gate in v1.

- `GET /api/v1/goals` → `200 { goals: Goal[] }`. Returns the full list (filtering is client-side).
- `GET /api/v1/goals/:id` → `200 Goal` or `404 { error: 'not_found', id }`.
- `POST /api/v1/goals` — body validated by `GoalCreateSchema`. `201 Goal` on success; `409 { error: 'id_collision', id }` on existing id; `400 { error: 'validation', issues }` on schema fail.
- `PATCH /api/v1/goals/:id` — body validated by `GoalUpdateSchema`. Server merges over existing row, then re-validates the merged record against `GoalSchema` (catches category-aware required/forbidden fields). `200 Goal` on success; `404` if missing; `400` on validation; `409 { error: 'stale_update', currentUpdatedAt }` if the body's `updatedAt` is older than the stored row.
- `DELETE /api/v1/goals/:id` — `204` on success; `404` if missing. Hard delete.

Response body shape on errors: `{ error: string, issues?: ZodIssue[], id?: string, currentUpdatedAt?: number }` — same shape used elsewhere in the project.

POST/PATCH/DELETE on collection or unknown sub-paths return `405`.

## UI pages and behaviors

Routes:

- `/goals` — list (active by default).
- `/goals/new` — create.
- `/goals/:id` — detail.
- `/goals/:id/edit` — edit.

### `/goals` — list

Visual: `design/goals-list.png`.

Top-to-bottom layout:

1. Top bar: hamburger left, amber **GOALS** title, `+` action → `/goals/new`. Reuses the `/exercises` top-bar shell.
2. Single horizontal-scrolling chip row, two visual segments separated by a thin `#26272A` divider:
   - Status segment (single-select, default `Active`): `Active` (amber fill when active) · `Completed` · `All`.
   - Category segment (single-select, default none): `Strength` · `Cardio` · `Weight` · `Measurement` · `Program` · `Other`. Tapping the active chip clears it.
3. Stack of goal cards. Card composition:
   - Top row: muted category pill (`STRENGTH` / `CARDIO` / `WEIGHT` / `MEASUREMENT` / `PROGRAM` / `OTHER`); bold title (truncate with ellipsis at one line); right-aligned muted countdown.
   - Countdown logic: `'X weeks left'` when ≥14 days; `'X days left'` when 1–13 days; `'TODAY'` when 0 days; muted red `'OVERDUE'` when negative and `status='active'`; hidden when `deadline` is null; replaced by `'COMPLETED'` when `status='completed'`; `'ABANDONED'` muted when `status='abandoned'`.
   - Big tabular numerics line: `<currentValue> / <targetValue> <unit>` formatted per category (program: `Week <currentWeeks> / <totalWeeks>`; cardio time-under: `mm:ss / mm:ss`).
   - Amber progress bar (4–6px tall, full width, 999px-rounded ends) with right-aligned percent (`80%`); rendered grey hairline at 0%.
   - Muted footer: `Started <Mon DD> · Target <Mon DD>` (target hidden when `deadline` is null).
4. Empty states:
   - No goals at all: full-card empty state, copy "No goals yet — set a target to start tracking.", `+ New goal` CTA.
   - Filtered to zero: dim "No matching goals" line plus a `Clear filters` button that resets status to `Active` and clears the category chip.

Sort: `deadline` ASC nulls last, tiebreak `updatedAt` DESC. Within `All` and `Completed`, `completed` and `abandoned` rows render after `active` rows.

Tap a card → `/goals/:id`.

### `/goals/:id` — detail

1. Top bar: back arrow, muted `GOAL` label (smaller than title), kebab menu with **Edit**, **Mark complete** (or **Mark active** if already completed), **Abandon** (or **Reactivate** if abandoned), **Delete**. Destructive items confirm before firing.
2. Top progress card (large): oversized tabular numerics for `currentValue / targetValue <unit>`, amber progress bar with right-aligned percent, single muted line below combining countdown and started/target dates.
3. For manual categories (`weight`, `measurement`, `other`), the `currentValue` numeric is tappable; tapping inline-replaces it with a numeric input + Save button. Saving issues a PATCH (Dexie + outbox). Auto-completion triggers on save when the new value crosses the target.
4. Read-only render of every form field below the progress card: title, category, exercise/program link, start, target, deadline, notes, direction. Tap any row to navigate to `/goals/:id/edit`.
5. No charts, no contribution log in v1.

### `/goals/new` and `/goals/:id/edit` — form

Visual: `design/goal-form.png`. Single full-page form, scrollable, with each section in a subtle card.

Sections in order:

1. **Type** — segmented control with six options across two rows: `Strength` · `Cardio` · `Weight` · `Measurement` · `Program` · `Other`. Selected option uses amber fill. Required. Selecting a category resets non-shared fields and re-renders the form.
2. **Title** — text input, required, placeholder `"Squat 315 lb"`.
3. **Start / Target** (hidden for `program`) — two side-by-side numeric inputs (`Start`, `→ Target`) with a unit dropdown to the right. Helper text "Current: auto-filled from <exercise> PR" rendered when applicable.
   - For `cardio` time-under goals, inputs switch to a `mm:ss` mask with no unit dropdown; a separate distance line ("Reference: 5 km") is editable as part of the title in v1 (per `notes` open-item in requirements).
   - For `strength`, unit dropdown = `lb` / `kg`, default per global settings.
   - For `weight`, unit dropdown = `lb` / `kg`.
   - For `measurement`, unit dropdown = `in` / `cm`.
   - For `other`, unit input is free-text (16 char max).
4. **Linked exercise** (visible for `strength`, `cardio` only) — outlined picker button showing the selected exercise name + a chevron; tap opens a single-select sheet over Dexie `exercises` filtered to `type='strength'` (strength) or `type IN ('cardio','mixed')` (cardio). Required.
5. **Linked program run** (visible for `program` only) — outlined picker button; tap opens a single-select sheet over Dexie `program_runs`. Required.
6. **Deadline** — date field with calendar icon; opens the platform date picker. Optional. Constraint: must be after today.
7. **Notes** — multiline text area. Optional.
8. **Direction** (visible for `other` only) — two-option toggle `Higher is better` / `Lower is better`. Locked otherwise.
9. Bottom action: large amber primary button — `CREATE GOAL` for `/goals/new`, `SAVE` for `/goals/:id/edit`. Disabled until the per-category required fields validate.

On save: Dexie write + outbox append in one transaction; navigate back to the list (create) or detail (edit). Cancel (back arrow) discards changes; if the form is dirty, confirm.

### URL state

The list page reflects status and category filter selection in the URL: `/goals?status=active&category=strength`. Defaults are stripped. Back/forward and share preserve the exact view. Selection state is local; no URL state on detail/form pages.

### Empty / loading / error states

- Loading: skeleton cards (3 placeholders) on initial mount; subsequent navigations are instant from Dexie.
- Errors are surfaced via the existing toast system; outbox flush failures are silent (retried), surfaced only via a settings-page indicator (out of scope here).

## Search, filter, and sort semantics

- No free-text search in v1.
- Status filter: single value, default `Active`.
- Category filter: single value, default none. ANDed with status.
- Sort: `deadline` ASC nulls last, then `updatedAt` DESC. `completed`/`abandoned` rows render after `active` within `All`/`Completed`.
- All filtering and sorting client-side over the full Dexie cache.

## Offline and sync model

- **Dexie is the source of truth for the UI.** Reads via `useLiveQuery` + Tanstack Query, identical to exercise-library.
- **Writes Dexie-first.** Each create/update/delete writes the `goals` Dexie row and appends a `pending_writes` entry (`entity='goal'`, `op` ∈ {`'create'`, `'update'`, `'delete'`}, payload = full record on create/update, `{ id }` on delete) in one Dexie transaction.
- **Background flusher.** Existing flusher drains `pending_writes` against `/api/v1/goals/...`. Success removes the row; failure increments `retries` and applies exponential backoff with `lastError` populated for observability.
- **Conflict handling.** Last-write-wins by `updatedAt`. Client-supplied IDs and timestamps are accepted server-side. 409 on ID collision; 409 stale-update on PATCH if body `updatedAt` is older than stored.
- **Reads from server.** On app load and periodically the client may pull `GET /api/v1/goals` to reconcile. Merge: server records replace local copies unless an outbox entry exists for that ID, in which case local wins until the outbox drains.
- **Reconcile fan-out on session finish.** workout-sessions' existing post-finish hook calls `reconcileGoals(finishedSessionId)`. Limitation: retro-edits to old session logs do not re-trigger reconcile; documented and accepted.

## Seed data strategy

No seed goals shipped. Fresh installs land on the empty state.

## Validation rules

Captured in `src/shared/goals.ts`:

- `category`, `title`, `direction`, `status` per Data Model enums and length limits.
- Per-category required/forbidden field matrix enforced via `superRefine`.
- `targetValue !== startValue` when both present.
- `deadline > createdAt` when present.
- `completedAt` present iff `status='completed'`.
- `linkedExerciseId` and `linkedProgramRunId` validated as well-formed UUIDs at the Zod layer; existence soft-validated at write time on the client (warning UI; not blocking) and server (no-op in v1 per sibling-spec convention).
- Server PATCH re-validates the merged record against `GoalSchema` to catch invalid category transitions.

## Visual Design

Authoritative: `design/goals-list.png`, `design/goal-form.png`. Tokens (consistent with the rest of Forge):

- Background `#0B0B0C`, surfaces `#17181A`, borders `#26272A`, amber `#F59E0B`, Inter typography, 14px rounding on cards/buttons.
- Progress bar: `#26272A` track, `#F59E0B` fill, 4–6px tall, 999px rounded ends.
- Tabular numerics on the big numeric line and percent label.
- No bottom tab bar; nav via global drawer.
- Form sections sit in distinct cards (`#17181A` surface, 14px rounding, 1px `#26272A` border).

## Existing Code to Leverage

- `specs/exercise-library/planning/spec.md` — page shell, top-bar layout, single horizontal-scrolling chip row, list/detail/edit page split, Dexie + Tanstack Query + outbox pattern. Reuse `pending_writes` table verbatim with `entity='goal'`. Reuse the `{ error, issues?, id?, currentUpdatedAt? }` server error shape.
- `specs/workout-sessions/planning/spec.md` — `session_set_logs` shape and the exported `epley()` helper for strength progress; the post-finish reconcile hook (extend it to call `reconcileGoals()`).
- `specs/programs/planning/spec.md` — `program_runs` and `program_run_day_states` shape for `program` goal progress.
- `src/client/db/forge-db.ts` and `src/client/db/queries.ts` — add a `goals` Dexie store and matching query helpers following the `exercises.ts` / `equipment.ts` shape.
- `src/server/routes/api.ts` — register a new `src/server/routes/goals.ts` sub-router under `/api/v1/goals` following the `exercises.ts` / `sessions.ts` convention.
- Architectural references: `docs/PRD.md` §Goals + §Goal progress page; `docs/PRODUCT-PLAN.md`; `docs/decisions/0004-tech-stack.md`; `docs/decisions/0005-offline-strategy.md`.

## Out of Scope

- Body-metric / measurement log table, weight / waist trend charts.
- Goal-progress charts, contribution lists, drill-downs on the detail surface.
- Auto-creation of goals from program runs.
- Reminders, notifications, push, email digests.
- Sharing, public goals, social features.
- Multi-user / per-user isolation, auth UI, bearer-token auth on `/api/v1/goals`.
- Bulk endpoints, bulk import (export covered by the export spec).
- Free-text search; multi-category goals; sub-goals.
- Settings-driven units UI (deferred to settings spec).
- Server-side aggregation tables, materialized views, server-computed progress.
