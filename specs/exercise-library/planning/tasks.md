# Task Breakdown: Exercise Library

## Status (last updated 2026-05-05)

**Phases 1-10 complete. Up next: Phase 11 (manual verification).**

Status legend used below: `[x]` done, `[~]` partial, `[ ]` not started.

### Pickup notes for the next agent/session
- Server is Bun + Hono on port 8080 (`bun run dev`); SQLite at `./data/forge.db`. Migration committed; schema exports the three tables.
- Client is Vite + React 19 + React Router v7. Dexie (`forge-db.ts`) holds `exercises`, `equipment`, `pendingWrites`, `meta`. Outbox flusher + reconcile + 30s/online/visibility triggers are wired from `src/client/main.tsx`.
- Seed hydration enqueues `create` outbox entries alongside seed inserts so reconcile against an empty server does NOT delete them. Do not break this invariant in Phase 8.
- Dev helpers on `window.__forge` (DEV-only): `wipeAndRehydrate()`, `flushNow()`, `reconcileNow()`.
- UI quality is intentionally rough — user said "still looks like shit". A styling pass is deferred but expected; do not invest heavily in visuals during Phase 8 unless asked.
- Filter chips on the list are split into TWO ROWS (type wraps on top, muscle+equipment scrolls below) to fix mobile overflow. Don't collapse back into one row.
- Phase 8 form lives at `src/client/pages/exercises/form.tsx` with field components under `form-fields/`. `new.tsx` and `edit.tsx` wire it up; routes `/exercises/new` and `/exercises/:id/edit` are registered.
- Inline equipment add (Phase 8.4) opens a Radix dialog, runs case-insensitive uniqueness check against Dexie, calls `createEquipment` (Dexie + outbox), and auto-selects on success. Don't break this path in Phase 9.

### Phase status

- [x] Phase 1 — Shared Zod schemas + types
- [x] Phase 2 — Drizzle schema + migration
- [x] Phase 3 — Hono API routes (verified via curl)
- [x] Phase 4 — Dexie stores + outbox + flusher + reconcile + TanStack Query hooks
- [x] Phase 5 — Seed JSON (13 equipment, 40 exercises) + hydration + dev debug
- [x] Phase 6 — List page UI (search, two-row filter chips, sort/filter pipeline, empty states)
- [x] Phase 7 — Detail page UI (header, instructional card, instructions, history placeholder, kebab, delete dialog, not-found)
- [x] Phase 8 — Create/Edit form + inline equipment add
- [x] Phase 9 — Equipment management screen (`/equipment`)
- [x] Phase 10 — Polish (a11y, offline pill, error UX, contrast audit)
- [ ] Phase 11 — Manual verification against mockups

---

## Overview

The Exercise Library is Forge's pattern-setting feature. Task ordering is deliberate: foundational shared Zod schemas and types first, then the server (Drizzle schema + migration + Hono routes), then client storage (Dexie + generic outbox + flusher), then seed hydration, then the UI pages in order of read-then-write complexity (list -> detail -> create/edit -> equipment management), finishing with cross-cutting polish and a manual verification pass against the mockups.

Total Tasks: 54 (across 10 phases)

Visual references:
- `/home/mike/Development/Forge/design/exercise-list.png`
- `/home/mike/Development/Forge/design/exercise-detail.png`

Authoritative spec: `/home/mike/Development/Forge/specs/exercise-library/planning/spec.md`

---

## Phase 1: Shared (Zod schemas + derived types)

**Dependencies:** None. Every later phase imports from here.

### 1.1 [x] Define `MuscleEnum` and `ExerciseTypeEnum`
- Add `MuscleEnum = z.enum([...14 values])` and `ExerciseTypeEnum = z.enum(['strength','cardio','mixed'])` in `src/shared`.
- Export derived TS types.
- Done when: both enums exported from `src/shared` and importable by `src/server` and `src/client`.
- Files: `src/shared/enums.ts` (new), `src/shared/index.ts` (new or updated barrel).

### 1.2 [x] Define `EquipmentSchema` + create/update inputs
- `EquipmentSchema`, `EquipmentCreateInput`, `EquipmentUpdateInput` per spec (uuid id, trimmed 1-100 name, timestamps).
- Done when: schemas parse and reject empty/oversize names; types exported.
- Files: `src/shared/equipment.ts` (new), `src/shared/index.ts`.
- Depends on: 1.1.

### 1.3 [x] Define `ExerciseSchema` + create/update inputs
- Full record with id, name, type, primary/secondary muscles, equipmentIds, aliases (with trim+lowercase+dedupe transform), description/instructions/notes with sanity caps, videoUrls (http/https), timestamps, lastUsedAt nullable.
- `ExerciseCreateInput` omits timestamps (or makes them optional); `ExerciseUpdateInput` is the full record (no patch).
- Done when: schemas parse seeded fixture data cleanly; alias transform verified (trim/lower/dedup/drop-empty).
- Files: `src/shared/exercise.ts` (new), `src/shared/index.ts`.
- Depends on: 1.1, 1.2.

### 1.4 [x] Define `PendingWriteSchema`
- `{ id, entity: 'exercise'|'equipment', op: 'create'|'update'|'delete', payload: unknown, createdAt, retries, lastError? }`.
- Done when: schema exported; payload is `z.unknown()` (validated per-entity at enqueue time, not here).
- Files: `src/shared/pending-write.ts` (new), `src/shared/index.ts`.
- Depends on: 1.1.

### 1.5 [x] Replace placeholder `src/shared/types.ts` with barrel re-exports
- Update `src/shared/types.ts` (or an `index.ts`) to re-export schemas and `z.infer` types for the rest of the app.
- Done when: `import { ExerciseSchema, type Exercise } from '@/shared'` works from client and server.
- Files: `src/shared/types.ts`, `src/shared/index.ts`.
- Depends on: 1.1-1.4.

**Acceptance Criteria (Phase 1):** All schemas parse valid inputs and reject invalid ones; types exported; no references to Dexie/Drizzle/Hono in `src/shared`.

---

## Phase 2: Database (Drizzle schema + migration)

**Dependencies:** Phase 1 (types are referenced in comments/JSDoc; runtime independent).

### 2.1 [x] Add `exercises` Drizzle table
- Columns and indexes per spec (text JSON for arrays, timestamp_ms, `idx_exercises_name`, `idx_exercises_type`, `idx_exercises_updated_at`).
- Done when: table compiles and is exported from `src/db/schema.ts`.
- Files: `src/db/schema.ts`.

### 2.2 [x] Add `equipment` Drizzle table
- Columns per spec; unique index on `lower(name)` (`idx_equipment_name_lower`).
- Done when: table compiles, unique index generated.
- Files: `src/db/schema.ts`.

### 2.3 [x] Add mirrored `pending_writes` Drizzle table
- Columns per spec; indexes `idx_pending_writes_created_at` and `idx_pending_writes_entity_op`.
- Note in JSDoc that this is a mirror for schema-review only; server routes never write to it in v1.
- Files: `src/db/schema.ts`.

### 2.4 [x] Generate and commit the Drizzle migration
- Run `bun run db:generate`; verify SQL in `src/db/migrations/` creates tables + indexes correctly (especially the `lower(name)` unique index).
- Done when: migration file committed and `bun run db:migrate` runs cleanly against a fresh `./data/forge.db`.
- Files: `src/db/migrations/<timestamp>_*.sql` (generated).
- Depends on: 2.1-2.3.

**Acceptance Criteria (Phase 2):** Fresh DB migrates without error; the three tables exist with the required indexes.

---

## Phase 3: API (Hono routes + Zod validation)

**Dependencies:** Phase 1, Phase 2.

### 3.1 [x] Scaffold `/api/v1` route registration
- Create `src/server/routes/exercises.ts` and `src/server/routes/equipment.ts` as Hono sub-routers; mount them from `src/server/routes/api.ts` under `/exercises` and `/equipment`.
- Done when: `GET /api/v1/exercises` returns a 200 with `{ exercises: [] }` against an empty DB.
- Files: `src/server/routes/api.ts`, `src/server/routes/exercises.ts` (new), `src/server/routes/equipment.ts` (new).

### 3.2 [x] Implement a shared error helper and Zod-issue formatter
- Small helper returning `{ error, issues?, id?, name? }` with proper status codes; used by all routes.
- Files: `src/server/lib/errors.ts` (new).

### 3.3 [x] Implement Exercises GET routes
- `GET /exercises` (full list, wrapped in `{ exercises }`) and `GET /exercises/:id` (404 with `{ error: 'not_found' }`).
- Done when: both endpoints return correctly serialized records (JSON-decode array columns before responding).
- Depends on: 3.1, 3.2.

### 3.4 [x] Implement `POST /exercises`
- Body validated with `ExerciseCreateInput`. Assign server-side timestamps if absent. On id collision return `409 { error: 'id_conflict', id }` (do not upsert). `400` on Zod failure with `issues`.
- Done when: duplicate POST with same id returns 409; valid create returns 201 with the stored record.
- Depends on: 3.3.

### 3.5 [x] Implement `PATCH /exercises/:id`
- Body validated with `ExerciseUpdateInput` (full record). 200 on success, 404 if missing, 400 on validation.
- Bump `updatedAt` server-side to `max(body.updatedAt, Date.now())` to keep server truth monotonic; do not reject on equipmentIds referencing missing equipment (log warning).
- Depends on: 3.4.

### 3.6 [x] Implement `DELETE /exercises/:id`
- 204 on success or if already gone (idempotent).
- Depends on: 3.3.

### 3.7 [x] Implement Equipment GET routes
- `GET /equipment` (wrapped in `{ equipment }`) and `GET /equipment/:id` (404).
- Depends on: 3.1, 3.2.

### 3.8 [x] Implement `POST /equipment`
- Validate with `EquipmentCreateInput`. Return 409 on id collision (`id_conflict`) and 409 on case-insensitive name collision (`name_conflict`).
- Done when: both 409 paths have tests or manual curl confirmation.
- Depends on: 3.7.

### 3.9 [x] Implement `PATCH /equipment/:id`
- Validate with `EquipmentUpdateInput`. 200/404/400; 409 `name_conflict` if rename clashes with another row's lowercased name.
- Depends on: 3.8.

### 3.10 [x] Implement `DELETE /equipment/:id`
- 204 on success or if already gone. Do NOT cascade; fanout is client's responsibility.
- Depends on: 3.7.

**Acceptance Criteria (Phase 3):** All endpoints return spec-conformant status codes and bodies; Zod validation is reused from `src/shared`; manual curl run against a local server exercises each route family.

---

## Phase 4: Client storage (Dexie stores + generic outbox + flusher)

**Dependencies:** Phase 1.

### 4.1 [x] Install Dexie schema for `exercises`, `equipment`, `pendingWrites`, `meta`
- Single `Dexie` subclass in `src/client/db/forge-db.ts` with version 1 stores + declared indexes per spec.
- Done when: opening the db in devtools shows the three object stores with expected indexes.
- Files: `src/client/db/forge-db.ts` (new).

### 4.2 [x] Implement transactional write helpers per entity
- `createExercise`, `updateExercise`, `deleteExercise`, `createEquipment`, `updateEquipment`, `deleteEquipment`. Each runs a single Dexie transaction that mutates the entity store AND appends a `pendingWrites` row (full record for create/update, `{ id }` for delete).
- Done when: a create call atomically produces both rows; rollback on either failure.
- Files: `src/client/db/mutations.ts` (new).
- Depends on: 4.1.

### 4.3 [x] Implement Dexie read helpers (query-shaped)
- `listExercises()`, `getExerciseById(id)`, `listEquipment()`, `getEquipmentById(id)`, plus `countExercisesReferencingEquipment(id)` for the equipment management screen.
- Wrap in query-key constants ready for Tanstack Query integration.
- Files: `src/client/db/queries.ts` (new), `src/client/db/query-keys.ts` (new).
- Depends on: 4.1.

### 4.4 [x] Implement the generic outbox flusher
- Worker module that drains `pendingWrites` in `createdAt` FIFO order, sequentially per entity. Per-op handling:
  - create -> POST; 201 -> delete entry; 409 id_conflict -> log + delete entry.
  - update -> PATCH; 200 -> delete entry; 404 -> delete entry (treated as gone).
  - delete -> DELETE; 204 -> delete entry.
  - Transport/5xx -> increment `retries`, set `lastError`, back off (1s,2s,4s...cap 60s).
- Expose `flushNow()` and a subscription hook.
- Files: `src/client/sync/flusher.ts` (new).
- Depends on: 4.1, Phase 3.

### 4.5 [x] Wire flusher triggers
- Trigger `flushNow()` on: app load (post-hydration), `window` `online` event, `visibilitychange`/focus, and a 30s interval. Guard against concurrent runs with a mutex flag.
- Files: `src/client/sync/flusher.ts`, `src/client/sync/triggers.ts` (new).
- Depends on: 4.4.

### 4.6 [x] Implement reconciliation (pull) routine
- On app load and every 5 min while online, GET `/api/v1/exercises` and `/api/v1/equipment`; apply merge rule: if local id has a pending outbox entry -> keep local; otherwise server record replaces local; server records not in local -> add; local records not on server with no pending `create` -> remove.
- Files: `src/client/sync/reconcile.ts` (new).
- Depends on: 4.4.

### 4.7 [x] Install Tanstack Query provider and wrap Dexie reads
- Add `QueryClientProvider` in `src/client/main.tsx`; add hooks (`useExercises`, `useExercise`, `useEquipment`) that read from Dexie via the query-keys from 4.3 and subscribe to Dexie changes (via `dexie-react-hooks` `useLiveQuery` under the hood, exposed through Tanstack Query for consistent caching).
- Files: `src/client/main.tsx`, `src/client/hooks/use-exercises.ts` (new), `src/client/hooks/use-equipment.ts` (new).
- Depends on: 4.3.

**Acceptance Criteria (Phase 4):** A manual create in devtools console appears in Dexie + outbox; bringing the server up drains the outbox; reconciliation pulls new server rows without clobbering pending local writes.

---

## Phase 5: Seed data + hydration

**Dependencies:** Phase 1, Phase 4.

### 5.1 [x] Curate seed JSON
- Ship `src/client/seed/equipment.json` (~10-15 entries: barbell, dumbbells, cable, machine, squat rack, bench, pull-up bar, kettlebell, treadmill, rower, bike, bodyweight, none) and `src/client/seed/exercises.json` (~30-60 entries referencing those equipment ids, with sensible type/muscle tagging, aliases, short instructions where useful).
- All ids are stable UUIDv4 literals baked into the JSON (so seed is idempotent across reinstalls).
- Done when: both files parse cleanly through the shared Zod schemas.
- Files: `src/client/seed/equipment.json` (new), `src/client/seed/exercises.json` (new).

### 5.2 [x] Implement hydration step
- On app boot: if Dexie `equipment` is empty, bulk-insert seed equipment; same for `exercises`; write `seedHydratedAt` to `meta`. Then (if online) call the reconcile routine.
- Done when: fresh browser -> list page is populated without a server running.
- Files: `src/client/seed/hydrate.ts` (new), wired from `src/client/main.tsx`.
- Depends on: 4.1, 4.6, 5.1.

### 5.3 [x] Add dev debug action to wipe + re-hydrate Dexie
- Simple function exposed on `window.__forge` in dev builds (guarded by `import.meta.env.DEV`) that clears all Dexie stores and re-runs hydration. Optional keyboard shortcut wired from app shell.
- Files: `src/client/seed/debug.ts` (new), `src/client/main.tsx`.
- Depends on: 5.2.

**Acceptance Criteria (Phase 5):** First-launch hydration runs exactly once, records `seedHydratedAt`, and is idempotent on subsequent loads.

---

## Phase 6: UI - List page (`/exercises`)

**Dependencies:** Phase 4, Phase 5. Matches `design/exercise-list.png`.

### 6.1 [x] Install React Router and replace app shell
- Introduce `createBrowserRouter` in `src/client/main.tsx`; replace `app.tsx` scaffold with a layout component exposing top bar slot + drawer-nav stub + `<Outlet />`.
- Preserve existing mobile-first max-width container and CSS variables from `styles.css`.
- Files: `src/client/main.tsx`, `src/client/app.tsx`, `src/client/layouts/app-shell.tsx` (new).

### 6.2 [x] Build list page skeleton and routing
- Route `/exercises` renders `<ExerciseListPage />` with placeholder top bar (hamburger, "Exercises" title, `+` -> `/exercises/new`).
- Files: `src/client/pages/exercises/list.tsx` (new), router config.
- Depends on: 6.1.

### 6.3 [x] Dense exercise row component
- Colored S/C/M square tag (amber/teal/purple muted), bold name, muted secondary line `Primary muscle · equipment · first alias` (omits missing pieces and their separators), right-aligned muted `NEVER`/empty for `lastUsedAt`.
- Row is a single focusable `<Link>` with composed aria-label.
- Files: `src/client/pages/exercises/row.tsx` (new).
- Depends on: 6.2.

### 6.4 [x] Hook up Dexie read and render rows
- Use `useExercises()` hook; show skeleton rows on first load; render the dense list.
- Files: `src/client/pages/exercises/list.tsx`.
- Depends on: 6.3, 4.7.

### 6.5 [x] Search input
- Full-width input with search icon; placeholder `Search exercises or aliases`; case-insensitive substring over `name` + `aliases`; whitespace-trimmed; visually hidden label + `aria-label`.
- Files: `src/client/pages/exercises/search.tsx` (new), `list.tsx`.
- Depends on: 6.4.

### 6.6 [x] Filter chip row (toolbar)
- Single horizontal-scroll `role="toolbar"` with arrow-key navigation:
  - Type chips (`All`/`Strength`/`Cardio`/`Mixed`) with amber active fill.
  - Muscle shortcut chips (curated subset) + "All muscles" reset.
  - Equipment chip with count badge that opens a multi-select sheet.
- No `Custom` chip (dropped per spec).
- Files: `src/client/pages/exercises/filter-chips.tsx` (new), `src/client/pages/exercises/equipment-filter-sheet.tsx` (new).
- Depends on: 6.5.

### 6.7 [x] Client-side filter + sort pipeline
- Compose search + type + muscle (primary OR secondary, primary ranks higher) + equipment (OR within selection). Final sort: primary-match rank DESC -> `lastUsedAt` DESC nulls last -> `name` ASC (locale-aware). All in one memoized selector.
- Files: `src/client/pages/exercises/use-filtered-exercises.ts` (new).
- Depends on: 6.5, 6.6.

### 6.8 [x] Empty and zero-match states
- Full-empty: centered "No exercises yet" + create CTA (defensive; unreachable post-seed).
- Zero-match: inline "No matches" row with a "Clear filters" button that resets search + filters.
- Files: `src/client/pages/exercises/empty-states.tsx` (new).
- Depends on: 6.7.

**Acceptance Criteria (Phase 6):** List matches mockup density, filters AND together with search, and keyboard-navigates the chip toolbar correctly.

---

## Phase 7: UI - Detail page (`/exercises/:id`)

**Dependencies:** Phase 6. Matches `design/exercise-detail.png`.

### 7.1 [x] Route + skeleton
- `/exercises/:id` renders `<ExerciseDetailPage />`; back arrow (`aria-label="Back to exercises"`), muted "Exercise" label, kebab button.
- Files: `src/client/pages/exercises/detail.tsx` (new), router config.

### 7.2 [x] Header block
- Large bold name; amber-outlined type chip (STRENGTH/CARDIO/MIXED); muted inline `Primary muscles · Equipment`; muted `aka:` aliases line (entirely hidden if no aliases).
- Files: `src/client/pages/exercises/detail-header.tsx` (new).
- Depends on: 7.1.

### 7.3 [x] Instructional card (video + description)
- Render only when `videoUrls[0]` or `description` is present. Video thumbnail with play overlay is an external link (`rel="noopener noreferrer"`, target=_blank) with an accessible name like "Watch form guide on YouTube (opens in new tab)"; caption reads `Watch: <hostname>`. Description below as muted paragraph.
- Files: `src/client/pages/exercises/instructional-card.tsx` (new).
- Depends on: 7.1.

### 7.4 [x] Instructions block
- Render when `instructions` is present; preserve line breaks (`whitespace-pre-wrap`). Hidden when empty.
- Files: `src/client/pages/exercises/instructions.tsx` (new).
- Depends on: 7.1.

### 7.5 [x] Stats row + recent history empty state
- Stats row tiles (EST 1RM / BEST SET / TOTAL SESSIONS) are HIDDEN in v1 (do not render zeroed tiles). Recent history always shows the empty-state paragraph "No history yet - log a workout to see progress here."; "View all" affordance not rendered.
- Files: `src/client/pages/exercises/history-placeholder.tsx` (new).
- Depends on: 7.1.

### 7.6 [x] Kebab menu (Radix DropdownMenu): Edit + Delete
- Edit navigates to `/exercises/:id/edit`; Delete opens a confirmation dialog.
- Files: `src/client/pages/exercises/detail-menu.tsx` (new).
- Depends on: 7.1.

### 7.7 [x] Delete confirmation + flow
- Radix Dialog confirming destructive action. On confirm call `deleteExercise(id)` (Dexie + outbox) and navigate back to `/exercises`.
- Files: `src/client/pages/exercises/delete-dialog.tsx` (new).
- Depends on: 4.2, 7.6.

### 7.8 [x] Not-found state
- If Dexie has no record for `:id`, render "Exercise not found" with a link back to the list.
- Files: `src/client/pages/exercises/detail.tsx`.
- Depends on: 7.1.

**Acceptance Criteria (Phase 7):** Detail page matches mockup sections; all optional sections hide gracefully when empty; delete round-trip works offline.

---

## Phase 8: UI - Create / Edit pages (`/exercises/new`, `/exercises/:id/edit`)

**Dependencies:** Phase 6, Phase 7.

### 8.1 [x] Shared exercise form component
- Single `<ExerciseForm />` component driving both create and edit. Controlled state, client-side Zod validation on submit using `ExerciseCreateInput` / `ExerciseUpdateInput`.
- Files: `src/client/pages/exercises/form.tsx` (new).

### 8.2 [x] Name + Type fields
- Name: required text input with visible label.
- Type: segmented control (`role="radiogroup"`) Strength / Cardio / Mixed.
- Files: `src/client/pages/exercises/form-fields/name.tsx` (new), `type.tsx` (new).
- Depends on: 8.1.

### 8.3 [x] Primary + Secondary muscles multi-select
- Chip-style multi-select bound to `MuscleEnum`. Dedupe on submit.
- Files: `src/client/pages/exercises/form-fields/muscles.tsx` (new).
- Depends on: 8.1.

### 8.4 [x] Equipment multi-select with inline "Add new equipment"
- Multi-select populated from Dexie equipment catalog; inline affordance opens a small Radix Dialog to create a new equipment record (Dexie + outbox) and auto-selects it on submit. Case-insensitive uniqueness checked against Dexie before submit.
- Files: `src/client/pages/exercises/form-fields/equipment.tsx` (new), `add-equipment-dialog.tsx` (new).
- Depends on: 4.2, 8.1.

### 8.5 [x] Aliases chip/tag input
- Enter/Comma adds; Backspace on empty input removes last; Delete key on a focused chip removes it. Transform on submit per Zod (trim/lowercase/dedupe/drop-empty).
- Files: `src/client/pages/exercises/form-fields/aliases.tsx` (new).
- Depends on: 8.1.

### 8.6 [x] Description + Instructions + Notes + Video URL inputs
- Multiline textareas for description/instructions/notes with sanity caps matching Zod (5000/10000/2000). Single URL input persisting to `videoUrls[0]`; validate http/https.
- Files: `src/client/pages/exercises/form-fields/long-text.tsx` (new), `video-url.tsx` (new).
- Depends on: 8.1.

### 8.7 [x] Create page wiring
- `/exercises/new` renders `<ExerciseForm mode="create" />`. On submit: validate, assign new UUID + timestamps, call `createExercise` (Dexie + outbox in one transaction), navigate back to `/exercises`.
- Files: `src/client/pages/exercises/new.tsx` (new), router config.
- Depends on: 4.2, 8.1-8.6.

### 8.8 [x] Edit page wiring
- `/exercises/:id/edit` prefills the form from Dexie. Submit calls `updateExercise` with the full updated record (bump `updatedAt`), navigate back to detail. Cancel discards and routes back.
- Files: `src/client/pages/exercises/edit.tsx` (new), router config.
- Depends on: 4.2, 8.1-8.6, 7.1.

### 8.9 [x] Form error display and a11y
- Per-field error text with `aria-describedby` linkage; form-level `aria-live="polite"` region for submission failures. Equipment uniqueness / video URL / alias dedupe errors all surface here.
- Files: `src/client/pages/exercises/form.tsx`, `form-error.tsx` (new).
- Depends on: 8.7, 8.8.

**Acceptance Criteria (Phase 8):** Create and edit persist offline, reflect immediately in the list/detail, and validate every spec rule client-side.

---

## Phase 9: UI - Equipment management (`/equipment`)

**Dependencies:** Phase 4, Phase 6 (shell + drawer).

### 9.1 [x] Route + drawer entry + page skeleton
- Drawer nav item "Equipment" routes to `/equipment`. Page has back/hamburger, "Equipment" title, `+` action.
- Files: `src/client/pages/equipment/list.tsx` (new), drawer component, router config.

### 9.2 [x] Equipment list rows with reference counts
- Each row: bold name, muted `<N> exercises` computed client-side from Dexie (use `countExercisesReferencingEquipment`), trailing overflow menu (Rename / Delete).
- Files: `src/client/pages/equipment/row.tsx` (new).
- Depends on: 9.1, 4.3.

### 9.3 [x] Create equipment dialog
- Inline dialog with name input, case-insensitive uniqueness check against Dexie before submit, then `createEquipment` (Dexie + outbox).
- Files: `src/client/pages/equipment/create-dialog.tsx` (new).
- Depends on: 4.2.

### 9.4 [x] Rename inline flow
- Inline-edit row name with same uniqueness check. On save, `updateEquipment`.
- Files: `src/client/pages/equipment/rename.tsx` (new).
- Depends on: 4.2.

### 9.5 [x] Delete with reference fanout
- If N > 0, confirmation reads "<N> exercises reference this equipment. Delete anyway? This will remove the reference from those exercises." On confirm, in a single Dexie transaction: delete equipment row + enqueue equipment delete; for each referencing exercise, remove the id from `equipmentIds`, bump `updatedAt`, update Dexie row, enqueue one exercise `update` entry per referencing exercise.
- Files: `src/client/pages/equipment/delete-dialog.tsx` (new), `src/client/db/mutations.ts` (extend with `deleteEquipmentWithFanout`).
- Depends on: 4.2, 9.2.

### 9.6 [x] Empty state
- "No equipment yet" + create CTA (defensive; unreachable post-seed).
- Files: `src/client/pages/equipment/list.tsx`.
- Depends on: 9.1.

**Acceptance Criteria (Phase 9):** Renaming is uniqueness-enforced; deleting referenced equipment correctly fans out across exercises and enqueues the right number of outbox entries.

---

## Phase 10: Polish (a11y, error handling, empty states, offline signal)

**Dependencies:** Phases 6-9.

### 10.1 [x] Accessibility sweep
- Verify: toolbar arrow-key navigation on filter chips; `aria-pressed` on chips; 44x44 tap targets on rows; form error wiring via `aria-describedby` + `aria-live`; kebab menus have proper `aria-haspopup`/`aria-expanded`; video link has descriptive aria-label + `rel="noopener noreferrer"`; no motion (no auto-play).
- Files: any components missing a11y.

### 10.2 [x] Loading and error UX across Tanstack Query hooks
- Skeleton rows on list first-load; graceful fallback paragraphs for failed reads (Dexie should not fail in practice but guard anyway); global toast/banner when the flusher has `retries > 3` on any entry to surface outbox trouble.
- Files: `src/client/pages/exercises/list.tsx`, `src/client/sync/flusher-banner.tsx` (new).

### 10.3 [x] Offline indicator + online-event wiring
- Small pill in the top bar showing "Offline" when `navigator.onLine === false`; hidden otherwise. On `online` event, trigger `flushNow()` (already wired in 4.5; verify).
- Files: `src/client/layouts/app-shell.tsx`, `src/client/components/offline-pill.tsx` (new).

### 10.4 [x] Contrast + dark-mode token audit
- Confirm amber-on-dark and muted secondary text meet WCAG AA against `#17181A` surface and `#0B0B0C` background. Adjust tokens in `src/client/styles.css` only if a specific pairing fails.
- Files: `src/client/styles.css` (if needed).

### 10.5 [x] Empty-state copy audit
- Ensure every empty surface matches spec copy (list zero-matches "No matches" + Clear filters; detail recent history; equipment empty). No dangling separators when optional fields are missing.
- Files: various.

**Acceptance Criteria (Phase 10):** Keyboard-only navigation works end-to-end; offline signal is honest; no empty zero-valued stat tiles anywhere.

---

## Phase 11: Manual verification against mockups

**Dependencies:** All prior phases.

### 11.1 [ ] Manual test script
Run `bun run dev` and step through every flow below with the design mockups open side-by-side (`design/exercise-list.png`, `design/exercise-detail.png`):

- [ ] First launch with empty Dexie and NO server running: list page populates from seed JSON; `seedHydratedAt` appears in `meta`.
- [ ] Start the server; observe reconcile pulls run and outbox remains empty.
- [ ] Search "bench" -> matches by name and aliases, case-insensitive, substring.
- [ ] Apply Strength type chip + a muscle chip + an equipment multi-select (two items): results are the AND of all filters.
- [ ] Muscle filter ranks primary-muscle matches above secondary-muscle matches within the result list.
- [ ] Zero-match scenario shows the "No matches" row with a working "Clear filters" button.
- [ ] Row layout visually matches mockup density; S/C/M tag colors present; right-side shows `NEVER`/empty.
- [ ] Tap a row -> detail page matches mockup: header, optional instructional card (hidden when neither video nor description), instructions block, no stat tiles, "No history yet" placeholder.
- [ ] Video thumbnail opens externally with correct `rel` + new tab.
- [ ] Tap `+` -> create form. Submit a new exercise including a brand-new piece of equipment via the inline add dialog. Row appears in list immediately.
- [ ] Go offline (devtools -> Offline). Edit an exercise; change reflects immediately; outbox has exactly one `update` entry. Go online; entry drains.
- [ ] Delete an exercise from the detail kebab -> confirm dialog -> returns to list, row gone, outbox contains `delete`.
- [ ] Navigate to `/equipment`. Create, rename, and delete equipment. Delete an equipment that is referenced by 3 exercises: confirmation shows "3 exercises reference this equipment", on confirm exercises' `equipmentIds` are updated and there are exactly 4 new outbox entries (1 equipment delete + 3 exercise updates).
- [ ] Keyboard-only: tab through list page, activate chips with Enter/Space, arrow keys move focus within chip toolbar.
- [ ] Refresh the page mid-outbox (with server down): pending entries persist and flush after the server returns.
- [ ] Call `window.__forge.resetAndReseed()` in dev -> Dexie wipes and re-hydrates; list is fresh.

**Acceptance Criteria (Phase 11):** Every checklist item above passes; screens visually match the provided mockups in structure, density, and styling.

---

## Execution Order (recommended)

1. Shared schemas (Phase 1)
2. Drizzle schema + migration (Phase 2)
3. Hono routes (Phase 3)
4. Dexie + generic outbox + flusher + Tanstack Query hooks (Phase 4)
5. Seed JSON + hydration (Phase 5)
6. List page (Phase 6)
7. Detail page (Phase 7)
8. Create / Edit forms (Phase 8)
9. Equipment management (Phase 9)
10. Polish pass (Phase 10)
11. Manual verification against mockups (Phase 11)
