# Specification: Exercise Library

## Overview

The Exercise Library is Forge's foundational feature — a private, offline-first catalog of exercises plus a sibling equipment catalog. It is also the pattern-setter for every subsequent feature: it establishes the Drizzle tables in `src/db`, Zod schemas in `src/shared`, Hono CRUD routes in `src/server`, a Dexie mirror + generic `pending_writes` outbox in `src/client`, and the split list/detail/create React page conventions. Reads come from Dexie (Tanstack Query-wrapped), writes go to Dexie first and append to the outbox, which a background flusher drains against `/api/v1`. The UI matches the provided `design/exercise-list.png` and `design/exercise-detail.png` mockups in structure and density.

## Goals

- Let the single user browse, search, filter, view, create, edit, and delete exercises, fully offline.
- Ship a user-extendable equipment catalog as a sibling entity.
- Establish the Dexie-first + generic outbox pattern reused by routines, workouts, programs, and goals later.
- Hydrate Dexie from bundled seed JSON on first launch so the library is useful with zero setup.
- Match the list and detail mockups in layout, information density, and dark-mode/amber styling.

## Non-goals (v1)

- Workout-history stats on the detail page (EST 1RM / BEST SET / TOTAL SESSIONS / RECENT HISTORY) — hidden until workouts land.
- "Add to routine" action from exercise pages.
- Bulk import/export or bulk API endpoints.
- Image uploads or local media; video is URL-only.
- Difficulty field, free-form tags, archive/soft-delete, per-exercise default units.
- Advanced sort controls, server-side filtering/search.
- Per-user isolation and auth UI beyond the single-user deployment.

## User flows

1. **First launch (empty Dexie).** App boots → hydration step checks `exercises` and `equipment` tables → if empty, loads bundled seed JSON into Dexie → if server is reachable, fetches `/api/v1/exercises` and `/api/v1/equipment` and reconciles (server wins on ID collision). User lands on `/exercises` already populated.
2. **Browse and find.** `/exercises` renders dense rows from Dexie. User types in the search field; results filter live by `name` + `aliases` substring. User taps a type chip, a muscle chip, and/or opens the Equipment multi-select; filters AND together with search.
3. **View.** Tap a row → `/exercises/:id`. Header shows name, type, muscles, equipment, aliases. Optional instructional card (video + description) and instructions block render only if populated. Stats and recent-history sections are hidden in v1.
4. **Create.** Tap `+` in top bar → `/exercises/new` → fill form → submit → Dexie write + outbox append happen in one transaction → navigate back to `/exercises` showing the new row immediately.
5. **Edit.** From detail, kebab → Edit → `/exercises/:id/edit` → same form, prefilled → submit writes to Dexie + enqueues update in outbox → navigate back to detail.
6. **Delete.** From detail, kebab → Delete → confirm → Dexie delete + outbox enqueues delete → navigate to list.
7. **Add equipment inline.** Inside the exercise create/edit form, the equipment picker exposes an "Add new equipment" affordance that opens a small inline sheet/dialog; submitting creates the equipment record (Dexie + outbox) and immediately selects it.
8. **Manage equipment.** User navigates to `/equipment` from the drawer → sees list → can create, rename, or delete equipment. Delete of referenced equipment shows a warning listing how many exercises reference it; on confirm the equipment record is deleted and the reference is removed from each referencing exercise's `equipmentIds` (each touched exercise updated locally and enqueued).
9. **Back online.** Outbox flusher drains pending writes to the API; successful entries are removed, failures are retained and retried with exponential backoff.

## Data model

All IDs are client-generated UUIDv4. Client-supplied IDs are accepted on create; server returns **409 Conflict** on ID collision (collisions are treated as errors, never as upserts).

### Drizzle tables (`src/db/schema.ts`, SQLite via `bun:sqlite`)

**`exercises`**
- `id` — `text` primary key (UUID)
- `name` — `text` not null
- `type` — `text` not null; stored as `'strength' | 'cardio' | 'mixed'`
- `primaryMuscles` — `text` not null, JSON-encoded string array of muscle enum values (default `'[]'`)
- `secondaryMuscles` — `text` not null, JSON-encoded string array (default `'[]'`)
- `equipmentIds` — `text` not null, JSON-encoded string array of equipment UUIDs (default `'[]'`)
- `aliases` — `text` not null, JSON-encoded string array, persisted trimmed + lowercased + deduped (default `'[]'`)
- `description` — `text` nullable
- `instructions` — `text` nullable (stored separately from `description`)
- `videoUrls` — `text` not null, JSON-encoded string array (default `'[]'`)
- `notes` — `text` nullable
- `createdAt` — `integer` (timestamp_ms) not null
- `updatedAt` — `integer` (timestamp_ms) not null
- `lastUsedAt` — `integer` (timestamp_ms) nullable; always null in v1, derived from workouts later
- Indexes: `idx_exercises_name` on `name`, `idx_exercises_type` on `type`, `idx_exercises_updated_at` on `updatedAt` (supports later reconciliation queries)

**`equipment`**
- `id` — `text` primary key (UUID)
- `name` — `text` not null
- `createdAt` — `integer` (timestamp_ms) not null
- `updatedAt` — `integer` (timestamp_ms) not null
- Indexes: `idx_equipment_name_lower` unique on `lower(name)` (case-insensitive uniqueness)

**`pending_writes`** (generic outbox — introduced here, reused by every later feature)
- `id` — `text` primary key (UUID)
- `entity` — `text` not null (discriminator: `'exercise' | 'equipment' | ...`)
- `op` — `text` not null (`'create' | 'update' | 'delete'`)
- `payload` — `text` not null, JSON-encoded. For `create` and `update` this is the **full record** (not a patch). For `delete` it is `{ id }`.
- `createdAt` — `integer` (timestamp_ms) not null
- `retries` — `integer` not null default 0
- `lastError` — `text` nullable (for observability)
- Indexes: `idx_pending_writes_created_at` on `createdAt` (flush in FIFO order), `idx_pending_writes_entity_op` on `(entity, op)`

Note: `pending_writes` is primarily a Dexie table on the client. A mirrored Drizzle table exists only to keep schema reviewable in one place and so any future server-initiated sync/debug surface can read it; it is not written to by server routes in v1.

### Dexie stores (`src/client`, IndexedDB)

- `exercises` — keyPath `id`; indexes on `name`, `type`, `updatedAt`
- `equipment` — keyPath `id`; index on `name`
- `pendingWrites` — keyPath `id`; indexes on `createdAt`, `entity`
- `meta` — reused from existing `src/db/schema.ts` meta pattern if needed for hydration flags (e.g., `seedHydratedAt`)

### Muscle enum (fixed, shared)

`chest`, `back`, `quadriceps`, `hamstrings`, `glutes`, `shoulders`, `biceps`, `triceps`, `forearms`, `core`, `calves`, `full_body`, `conditioning`, `other`.

Used for `primaryMuscles`, `secondaryMuscles`, and the muscle filter chips. The enum is the single source of truth.

## Zod schemas (`src/shared`)

All validation is expressed in Zod in the shared layer and imported by both client (forms, Dexie guards) and server (Hono route validation). Types are derived via `z.infer`.

- `MuscleEnum` — `z.enum([...14 values above])`
- `ExerciseTypeEnum` — `z.enum(['strength', 'cardio', 'mixed'])`
- `EquipmentSchema` — `{ id: uuid, name: string().trim().min(1).max(100), createdAt: number, updatedAt: number }`
- `EquipmentCreateInput` — `{ id: uuid, name: string().trim().min(1).max(100) }` (timestamps assigned server/client-side)
- `EquipmentUpdateInput` — `{ name: string().trim().min(1).max(100) }` (partial; only `name` is mutable in v1)
- `ExerciseSchema` — full record:
  - `id: uuid`
  - `name: string().trim().min(1).max(100)`
  - `type: ExerciseTypeEnum`
  - `primaryMuscles: MuscleEnum[]` (default `[]`)
  - `secondaryMuscles: MuscleEnum[]` (default `[]`)
  - `equipmentIds: uuid[]` (default `[]`)
  - `aliases: string[]` — each entry trimmed+lowercased; empty dropped; deduped (applied via Zod `.transform`)
  - `description: string().max(5000).nullable().optional()`
  - `instructions: string().max(10000).nullable().optional()`
  - `videoUrls: z.string().url()[]` (default `[]`)
  - `notes: string().max(2000).nullable().optional()`
  - `createdAt: number, updatedAt: number, lastUsedAt: number | null`
- `ExerciseCreateInput` — client-supplied full record minus timestamps (or with optional timestamps)
- `ExerciseUpdateInput` — full record (updates carry the full payload; no patch form in v1)
- `PendingWriteSchema` — `{ id, entity: 'exercise' | 'equipment', op: 'create' | 'update' | 'delete', payload: unknown, createdAt: number, retries: number, lastError?: string | null }`

Cross-field rule: `equipmentIds` entries must resolve to an existing equipment record. Enforced client-side on form submit; server-side the check is soft (logs warning, does not reject) to tolerate out-of-order outbox flushes where an equipment create lands after an exercise create that references it.

## API contract

All endpoints under `/api/v1`. JSON in/out. No auth gate in v1.

### Exercises

- `GET /api/v1/exercises` → `200 { exercises: Exercise[] }`. Returns the full list; filtering/sort is client-side.
- `GET /api/v1/exercises/:id` → `200 Exercise` | `404 { error: 'not_found' }`
- `POST /api/v1/exercises` — body: `ExerciseCreateInput` (with client `id`).
  - `201 Exercise` on success.
  - `400 { error: 'validation', issues }` on Zod failure.
  - **`409 { error: 'id_conflict', id }` if `id` already exists.** (Collisions are treated as errors.)
- `PATCH /api/v1/exercises/:id` — body: `ExerciseUpdateInput` (full record payload).
  - `200 Exercise` on success.
  - `404` if id not found.
  - `400` on validation failure.
- `DELETE /api/v1/exercises/:id` → `204` on success or if already gone (idempotent delete).

### Equipment

- `GET /api/v1/equipment` → `200 { equipment: Equipment[] }`
- `GET /api/v1/equipment/:id` → `200 Equipment` | `404`
- `POST /api/v1/equipment` — body: `EquipmentCreateInput`.
  - `201 Equipment`.
  - `400` on validation.
  - `409 { error: 'id_conflict', id }` on id collision.
  - `409 { error: 'name_conflict', name }` on case-insensitive name collision.
- `PATCH /api/v1/equipment/:id` — body: `EquipmentUpdateInput`. `200 Equipment` | `404` | `400` | `409 name_conflict`.
- `DELETE /api/v1/equipment/:id` → `204`. Server does **not** cascade-update exercises — the client performs the fanout (null-out references on each referencing exercise and enqueues those updates). Idempotent.

Error shape is consistent: `{ error: string, issues?: ZodIssue[], id?: string, name?: string }`.

## UI pages and states

Routes (React Router-style under `src/client`):

- `/exercises` — list
- `/exercises/new` — create form
- `/exercises/:id` — detail
- `/exercises/:id/edit` — edit form
- `/equipment` — equipment management (list + create + rename + delete)

### List page (`/exercises`) — ref `design/exercise-list.png`

- Top bar: hamburger (opens drawer nav), "Exercises" title centered/left, `+` action routing to `/exercises/new`.
- Full-width search input with search icon, placeholder `Search exercises or aliases`. Case-insensitive substring match over `name` + `aliases`; whitespace-trimmed.
- Single horizontal-scrolling filter chip row (no `Custom` chip — dropped):
  - **Type chips:** `All` (default, amber fill when active), `Strength`, `Cardio`, `Mixed`. Single-select; `All` resets.
  - **Muscle shortcut chips:** a curated subset of the muscle enum (e.g., Chest, Back, Legs). Single-select; re-tapping the active chip (or an explicit "All muscles" option in the overflow) resets.
  - **Equipment chip:** opens a multi-select sheet populated from the Dexie equipment catalog; shows a count badge when a selection is active.
- Row layout: small colored square tag with type initial (S amber, C teal, M purple; all muted per mockup), exercise name bold, secondary muted line `Primary muscle · equipment · first alias` (gracefully omits missing pieces and their separators), right-aligned muted `NEVER` / empty string for `lastUsedAt` in v1 (wiring `last used Nd` is preserved for when workouts land).
- Empty states:
  - No exercises at all: centered empty state with "No exercises yet" and a create CTA. (Should not normally occur after seed hydration.)
  - Filters/search return zero matches: inline "No matches" row with a "Clear filters" button.
- Loading state: skeleton rows matching row density while the first Dexie read resolves.

### Detail page (`/exercises/:id`) — ref `design/exercise-detail.png`

- Top bar: back arrow, small muted "Exercise" label, kebab menu with **Edit** and **Delete** only (no "Add to routine").
- Header: large bold name, type chip (STRENGTH / CARDIO / MIXED) amber outlined, muted inline line of `Primary muscles · Equipment`, `aka:` muted line listing aliases (hidden entirely if no aliases).
- Instructional card: if `videoUrls[0]` present, render thumbnail with play overlay; tapping opens URL in a new tab/externally; caption line `Watch: <hostname>`. Below, render `description` as muted paragraph. The entire card is hidden if neither a video nor description exists.
- Instructions block: renders `instructions` when present; hidden when empty. Preserves line breaks.
- Stats row (EST 1RM / BEST SET / TOTAL SESSIONS): **hidden in v1** (wired when workouts exist — never render zero tiles).
- Recent history section: always shows a single empty state in v1 — "No history yet — log a workout to see progress here." The "View all" affordance is hidden until there is history.
- Delete confirmation: modal/dialog confirming destructive action; on confirm triggers Dexie delete + outbox enqueue and routes back to `/exercises`.
- 404 state: if the id is not in Dexie, show "Exercise not found" with a link back to the list.

### Create and edit pages (`/exercises/new`, `/exercises/:id/edit`)

Dedicated full-page forms (per the locked split list/create convention). Fields:

- **Name** (required, text)
- **Type** (required, segmented control: Strength / Cardio / Mixed)
- **Primary muscles** (multi-select from muscle enum, chip-style)
- **Secondary muscles** (multi-select from muscle enum)
- **Equipment** (multi-select from equipment catalog; inline "Add new equipment" affordance opens a small dialog that creates a new equipment record and auto-selects it)
- **Aliases** (chip/tag input; trimmed/lowercased/deduped on submit)
- **Description** (multiline, optional)
- **Instructions** (multiline, optional, separate from description)
- **Video URL** (single URL input in v1; persists to `videoUrls[0]`)
- **Notes** (multiline, optional)

Submit behavior: in a single transaction, write/update the Dexie record and append one `pendingWrites` entry (full-record payload for creates and updates, `{ id }` for deletes). Navigate back to the list (create) or detail (edit) without awaiting the server. Edit prefills from Dexie; Cancel discards changes and routes back.

### Equipment management (`/equipment`)

Minimal management screen accessible from drawer nav.

- Top bar: back/hamburger, "Equipment" title, `+` to create.
- List rows: equipment name (bold), muted count `<N> exercises` (computed client-side from Dexie), trailing overflow menu with **Rename** and **Delete**.
- Create: small inline form/dialog — name input with case-insensitive uniqueness check against Dexie before submit.
- Rename: inline edit with the same uniqueness check.
- Delete: if N > 0 references exist, confirmation reads "<N> exercises reference this equipment. Delete anyway? This will remove the reference from those exercises." On confirm: delete equipment (Dexie + outbox) AND for each referencing exercise, remove the id from its `equipmentIds`, bump `updatedAt`, and enqueue an exercise `update` outbox entry (one per referencing exercise).
- Empty state: "No equipment yet" with a create CTA (unreachable after seed).

## Search, filter, and sort semantics

- **Search:** case-insensitive substring match over `name` and any entry in `aliases`. Whitespace-trimmed. Applied before filters for predictable narrowing.
- **Type filter:** single value `strength | cardio | mixed`, or none (`All`).
- **Muscle filter:** single value from muscle enum, or none. Matches an exercise if the value appears in `primaryMuscles` **or** `secondaryMuscles`. Ranking: matches on `primaryMuscles` rank above matches on `secondaryMuscles` in the result order (before the `lastUsedAt`/alphabetical secondary sort).
- **Equipment filter:** multi-select. An exercise matches if `equipmentIds` contains **any** of the selected ids (OR within equipment).
- **Combination:** all active filters AND with each other and with the search string.
- **Sort:** primary-muscle-match rank (when muscle filter active) DESC → `lastUsedAt` DESC with nulls last → `name` ASC (case-insensitive, locale-aware). In v1 `lastUsedAt` is always null so this effectively collapses to rank + alphabetical.
- **All client-side**, over the full Dexie cache. No server-side filtering in v1.

## Offline and sync flow

This feature establishes the project-wide pattern. Every later feature reuses `pendingWrites` unchanged.

- **Reads:** UI reads always go through Dexie, wrapped in Tanstack Query (`useLiveQuery`-style subscription or a query-key tied to Dexie) for caching and revalidation. Server is never read directly by components.
- **Writes:** every create/update/delete performs a single Dexie transaction that (a) mutates the entity table and (b) appends a `pendingWrites` row. UI updates immediately.
- **Outbox entry lifecycle:**
  1. `op='create'`: payload is the full new record. Flusher POSTs to `/api/v1/<entity>`. On `201` the entry is deleted. On `409 id_conflict` (shouldn't happen with UUIDs, but if it does) the entry is deleted after logging — Dexie already has a record and the server already has a record; they will reconcile on next pull.
  2. `op='update'`: payload is the full record. Flusher PATCHes. On `200` the entry is deleted. On `404` the entry is deleted (treated as already-gone — the record was deleted server-side before our update landed).
  3. `op='delete'`: payload is `{ id }`. Flusher DELETEs. On `204` the entry is deleted (idempotent on already-gone).
- **Flusher triggers:** app load (after Dexie hydration), network online event, app focus, and a periodic interval (e.g., 30s). Processes entries in `createdAt` FIFO order, sequentially per entity to avoid out-of-order applies.
- **Retry:** on transport or `5xx` failure, increment `retries`, store `lastError`, and back off (e.g., capped exponential: 1s, 2s, 4s, … max 60s). Entries remain in the outbox until success or explicit purge.
- **Reconciliation (pull):** on app load and periodically (e.g., every 5 minutes while online), the client pulls `GET /api/v1/exercises` and `GET /api/v1/equipment`. Merge rule: for each server record, if there is a pending outbox entry for that id, the **local** copy wins until the outbox drains; otherwise the server record replaces the local copy. Server records not present locally are added. Local records not present on the server are kept only if they have a pending `create` entry; otherwise they are removed (covers deletes performed on another device later; in v1 this rarely fires).
- **Conflict model:** last-write-wins by `updatedAt` in v1. Formal conflict resolution is deferred.
- **IDs:** client-generated UUIDv4 everywhere; the server never assigns ids.

## Seed data strategy

- A bundled JSON file ships with the client (static import from `src/client`) containing:
  - ~10–15 equipment entries: barbell, dumbbells, cable, machine, squat rack, bench, pull-up bar, kettlebell, treadmill, rower, bike, bodyweight, none. (Final list curated during build.)
  - ~30–60 curated exercises spanning strength, cardio, and mixed, with sensible `type`, `primaryMuscles`, `secondaryMuscles`, `equipmentIds` (referencing seed equipment ids), short `aliases`, and brief `instructions` where useful.
- Hydration step runs once on app boot:
  1. If Dexie `equipment` is empty, insert all seed equipment.
  2. If Dexie `exercises` is empty, insert all seed exercises.
  3. If online, fetch `/api/v1/equipment` and `/api/v1/exercises` and apply the reconciliation merge rule (server wins except for ids with pending outbox entries — none on first run).
  4. Record hydration completion in the `meta` table (`seedHydratedAt`).
- Seed records are ordinary records: fully editable, fully deletable, no `isBuiltIn` / `isSeed` flag.
- Dev utility: a debug action (settings or keyboard shortcut) to wipe Dexie and re-hydrate from seed for testing.

## Validation rules

- `name` (exercise, equipment): required, trimmed, 1–100 chars.
- `type`: required; one of `strength | cardio | mixed`.
- `primaryMuscles[]`, `secondaryMuscles[]`: each entry must be a valid muscle enum value. Both arrays deduped.
- `equipmentIds[]`: each entry must reference an existing equipment id at client submit time; server accepts and logs-only if the referenced equipment is missing (tolerates outbox reordering).
- `aliases[]`: trimmed, lowercased, empty entries dropped, deduped; applied via Zod `.transform` so inputs and outputs are consistent.
- `videoUrls[]`: each entry must be a valid `http`/`https` URL.
- `description`, `instructions`, `notes`: optional; sanity caps (description 5000, instructions 10000, notes 2000 chars).
- Equipment `name`: required, trimmed, 1–100, **case-insensitively unique** across the catalog. Checked in Dexie on create/rename and enforced server-side (`409 name_conflict`).
- All rules live in Zod schemas in `src/shared` and are reused on client and server.

## Accessibility notes

- **List page:** search input has an explicit `<label>` (visually hidden) and `aria-label="Search exercises or aliases"`. Filter chips are `role="button"` with `aria-pressed` reflecting active state; the chip row is a `role="toolbar"` with keyboard arrow navigation. Each exercise row is a single focusable link (target size ≥ 44×44px) with an accessible name combining exercise name + type + primary muscle (e.g., "Barbell Back Squat, strength, quadriceps"). Color is never the sole signal — the S/C/M letter tag carries the type semantically too.
- **Detail page:** back button has `aria-label="Back to exercises"`. Kebab menu is a Radix menu with proper `aria-haspopup`/`aria-expanded`. Video thumbnail is a link with an accessible name like "Watch form guide on YouTube (opens in new tab)" and `rel="noopener noreferrer"`. Empty-state copy is a real paragraph, not just an icon.
- **Forms:** every field has a visible label; errors announced via `aria-live="polite"` and associated with inputs via `aria-describedby`. Segmented controls use `role="radiogroup"`. Chip/tag inputs support keyboard add (Enter/Comma) and remove (Backspace on empty, Delete on focused chip).
- **Contrast:** amber accent on dark background meets WCAG AA at the font weights used; muted secondary text on `#17181A` is tested against AA.
- **Motion:** no auto-playing video; thumbnails are static until activated.

## Existing code to leverage

**`src/db/schema.ts` meta table and Drizzle conventions**
- The existing `meta` table (`key`, `value`, `updated_at`) can back the `seedHydratedAt` flag.
- Establishes the `sqliteTable` + `integer("...", { mode: "timestamp_ms" })` pattern to follow for new tables.

**`src/server/routes/api.ts` Hono scaffold**
- Extend this module (or add sibling route files under `src/server/routes/`) to register `/exercises` and `/equipment` sub-routers. Keeps `/health` as the existing pattern for a simple GET.

**`src/client/lib/theme.ts` + `src/client/styles.css` design tokens**
- Use the existing CSS variables (`--bg`, `--surface`, `--border`, `--accent`, `--accent-fg`, `--text`, `--text-muted`, `--text-subtle`, `--radius-card`) for all new components. Amber accent and dark-surface styling are already themed.

**`src/client/app.tsx` shell**
- Replace the scaffold content with a real router, but preserve the max-width mobile-first container pattern and the existing header layout for the drawer/top-bar motif.

**`src/shared/types.ts` placeholder**
- Already marked as the home for Zod-derived shared types — all new Zod schemas land here, and types are re-exported via `z.infer`.

## Future work

- **Archive vs. snapshot (forward-looking).** V1 uses hard delete because no workout history exists to protect. When workout logging lands, exercise deletion must either be softened to archive (add `archivedAt` + filter it out of library queries) or each logged set must snapshot `name`, `primaryMuscles`, and `type` at log time. **Preferred direction: snapshot at log time.** It keeps the exercise-library surface clean (no archived rows polluting queries, no `isArchived` flag branching throughout the UI) and makes historical records self-contained. The workout-logging spec owns this decision and must implement it before shipping logging.
- **Muscle filter scope re-evaluation.** If primary+secondary matching feels too loose in real use, tighten to primary-only (keep the ranking behavior either way).
- **Outbox observability.** A future settings/debug panel to view pending writes, retry counts, and last errors — the schema already supports it.

## Out of scope (v1)

- Workout-history-driven stats (EST 1RM, BEST SET, TOTAL SESSIONS) and the RECENT HISTORY list content.
- "Add to routine" action from exercise pages.
- Bulk import/export and bulk API endpoints.
- Image uploads, local media storage, media proxying.
- Difficulty field, free-form tags.
- Archive / soft-delete for exercises or equipment.
- Per-exercise default units.
- Advanced sort controls (column pickers, direction toggles).
- Server-side filtering or search.
- Per-user isolation, auth UI, multi-user accounts.
- The `Custom` filter chip (explicitly dropped).
- `isBuiltIn` / `isSeed` flags of any kind.
