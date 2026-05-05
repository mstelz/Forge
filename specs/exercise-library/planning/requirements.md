# Spec Requirements: Exercise Library

## Overview

The Exercise Library is Forge's foundational feature and the first real slice of the product. Beyond its user-facing value (browsing, searching, and managing a private exercise catalog), this feature is responsible for establishing the patterns every subsequent feature will copy: Drizzle tables on the server, Zod schemas in the shared layer, Hono CRUD routes, a Dexie mirror on the client, a generic outbox-based offline write queue, and list/detail/create React pages driven by the design mockups.

Forge is a single-user, self-hosted, offline-first PWA. The exercise library must work fully offline, hydrate from bundled seed data on first run, and reconcile with the server opportunistically when online.

## Goals

- Let the user browse, search, filter, view, create, edit, and delete exercises.
- Establish a reusable equipment catalog as a sibling entity.
- Establish the Dexie-first + generic outbox pattern used by all later features.
- Ship with curated seed data so the library is useful immediately on first launch.
- Match the provided list/detail mockups in structure and density.

## Non-goals (v1)

- Workout-history-driven stats on the detail page (EST 1RM / BEST SET / TOTAL SESSIONS tiles and RECENT HISTORY list show empty states in v1 and will populate once the workout feature exists).
- "Add to routine" action from the exercise pages — routines are assembled inside the routine builder only.
- Bulk import or bulk endpoints.
- Image uploads or any local media storage; video is URL-only.
- Difficulty field.
- Free-form tags.
- Archive / soft-delete.
- Per-exercise default units (lives in global settings; sets capture units at log time).
- Advanced sort controls.
- Server-side filtering/search.
- Per-user isolation and auth beyond a single-user deployment.

## User stories

- As the single user, I open the app for the first time and immediately see a curated list of common exercises so I can start logging without setup.
- As the user, I search by exercise name or an alias (e.g., "bench", "squat") and see matching results instantly.
- As the user, I filter the list by type (strength/cardio/mixed), a primary muscle, and/or one or more pieces of equipment, combining filters as needed.
- As the user, I tap an exercise and see its details: name, type, muscles, equipment, aliases, description, instructions, and any linked video.
- As the user, I add a new exercise via a dedicated create page, fill in required fields, and see it appear in the list.
- As the user, I edit any exercise (seed or custom) to fix a name, add an alias, or change equipment.
- As the user, I delete an exercise when I no longer want it in my library.
- As the user, I do all of the above while offline; my changes show up immediately and reconcile to the server when I'm back online.
- As the user, I add a new piece of equipment to the catalog when a seeded option doesn't match what my gym has.

## Data model

Three entities are introduced or established by this feature. IDs are client-generated UUIDs; the server accepts client-supplied IDs on create.

### Exercise

- `id` — UUID, client-generated, primary key
- `name` — string, required, 1–100 chars
- `type` — enum, required: `strength` | `cardio` | `mixed`
- `primaryMuscles` — array of muscle enum values; may be empty
- `secondaryMuscles` — array of muscle enum values; may be empty
- `equipmentIds` — array of equipment IDs (FK into the equipment catalog); may be empty
- `aliases` — array of strings; trimmed, lowercased, and deduped before persistence; used for search matching
- `description` — long text, optional
- `instructions` — long text, optional, stored SEPARATELY from `description`
- `videoUrls` — array of validated URL strings; the v1 create/edit UI exposes a single input but the field is an array
- `notes` — optional free-form text
- `createdAt` — timestamp
- `updatedAt` — timestamp
- `lastUsedAt` — nullable timestamp; unused in v1 and derived later from workout history

No `difficulty`, no `tags`, no `isBuiltIn`, no `archivedAt`, no per-exercise default units.

#### Muscle enum

Fixed enum shipped with the app, with an `other` escape hatch. Proposed values (curator's choice, adjustable during build):

`chest`, `back`, `quadriceps`, `hamstrings`, `glutes`, `shoulders`, `biceps`, `triceps`, `forearms`, `core`, `calves`, `full_body`, `conditioning`, `other`.

The enum is the source of truth for both primary and secondary muscles and for the muscle filter chips.

### Equipment

A full sibling entity — a user-extendable catalog, not an enum.

- `id` — UUID, client-generated, primary key
- `name` — string, required, 1–100 chars, case-insensitively unique within the catalog
- `createdAt` — timestamp
- `updatedAt` — timestamp

Seeded with common items: barbell, dumbbells, cable, machine, squat rack, bench, pull-up bar, kettlebell, treadmill, rower, bike, bodyweight, none (final list to be curated during implementation). The user can create additional entries; in v1 this may happen inline during exercise create/edit or via a simple list screen — either is acceptable and can be settled during the UI build.

Exercises reference equipment by id. Deleting an equipment entry that is still referenced should either be blocked or should detach the reference from affected exercises; pick one behavior during spec writing and apply consistently.

### pending_writes (generic outbox)

Introduced by this feature but deliberately designed to serve every future feature.

- `id` — UUID, primary key
- `entity` — string discriminator (e.g., `exercise`, `equipment`, later `routine`, `workout`, etc.)
- `op` — enum: `create` | `update` | `delete`
- `payload` — JSON blob; for `update` it may be a full record or a patch, to be decided in the spec
- `createdAt` — timestamp
- `retries` — integer, optional; increments on failed flush attempts

The exercise library is the first consumer of this table; routines and workouts will reuse it unchanged.

## API surface

All endpoints live under `/api/v1`. In v1 there is no auth gate beyond whatever the deployment chooses.

### Exercises

- `GET /api/v1/exercises` — returns the full list. Filtering, searching, and sorting are performed client-side in v1.
- `GET /api/v1/exercises/:id` — single exercise.
- `POST /api/v1/exercises` — create. Accepts a client-supplied `id`. Idempotent on conflicting ID (behavior to be pinned down: reject vs upsert; spec writer to decide and document).
- `PATCH /api/v1/exercises/:id` — partial update.
- `DELETE /api/v1/exercises/:id` — hard delete.

### Equipment

- `GET /api/v1/equipment`
- `GET /api/v1/equipment/:id`
- `POST /api/v1/equipment` — accepts client-supplied id.
- `PATCH /api/v1/equipment/:id`
- `DELETE /api/v1/equipment/:id`

No bulk endpoints in v1.

Request/response validation is driven by Zod schemas in the shared layer so the client and server agree.

## UI pages and behaviors

Routes:

- `/exercises` — list
- `/exercises/new` — create
- `/exercises/:id` — detail
- `/exercises/:id/edit` — edit

### List page (`/exercises`)

Visual reference: `design/exercise-list.png` + `design/exercise-list.json`.

Structure, top-to-bottom:

1. Top bar: hamburger (drawer nav), "Exercises" title, "+" action that routes to `/exercises/new`.
2. Full-width search field with a search icon, placeholder "Search exercises or aliases". Matches `name` and `aliases` case-insensitively by substring.
3. Single horizontal scrolling row of filter chips:
   - Type chips: `All` (default, amber fill when active), `Strength`, `Cardio`, `Mixed`. Single-select; `All` resets.
   - Muscle shortcut chips: a small curated subset of the muscle enum (e.g., Chest, Back, Legs). Single-select; selecting "All muscles" (or re-tapping the active chip) resets.
   - `Equipment` chip: opens a multi-select picker populated from the equipment catalog.
   - `Custom` chip: see Open items — this chip's definition is unresolved and may be dropped.
4. List of exercise rows, each showing:
   - A colored square tag with the type initial (S / C / M) — no images.
   - Exercise name (bold).
   - Secondary muted line: `Primary muscle · equipment · first alias` (abbreviated — exact composition flexible, matching mockup density).
   - Right side: a muted `last used Nd` / `NEW` / `NEVER` indicator driven by `lastUsedAt` (always `NEVER`/empty in v1 because no workouts exist yet — graceful empty handling required).

Empty state: when no exercises exist at all (shouldn't happen after seed hydration, but defensively), show a clear "No exercises yet" empty state with a create CTA.

### Detail page (`/exercises/:id`)

Visual reference: `design/exercise-detail.png` + `design/exercise-detail.json`.

Structure:

1. Top bar: back arrow, small muted "Exercise" label, kebab menu with **Edit** and **Delete** only. No "Add to routine".
2. Header: large bold name, a type chip (STRENGTH / CARDIO / MIXED), a muted inline list of primary muscles and equipment, and a muted `aka:` line listing aliases.
3. Instructional card: if a video URL is present, render a thumbnail with a play overlay that opens the URL externally; caption line references the source. Below, render the `description` text. Hide the card entirely if there is no video and no description.
4. Instructions block: renders the `instructions` field when present. Hidden when empty.
5. Stats row (three tiles: EST 1RM / BEST SET / TOTAL SESSIONS): hidden in v1 because there is no workout history. Wired in when workouts land.
6. Recent history section: in v1 always shows an empty state — "No history yet — log a workout to see progress here." The "View all" affordance is hidden until there is history.

All optional fields must render gracefully when empty: no broken layout, no dangling separators, no zero-value stat tiles.

### Create and edit pages (`/exercises/new`, `/exercises/:id/edit`)

Dedicated full-page forms (per the product plan's split list/create convention).

Fields exposed:

- Name (required)
- Type (required; segmented control or select)
- Primary muscles (multi-select from the muscle enum)
- Secondary muscles (multi-select from the muscle enum)
- Equipment (multi-select from the equipment catalog, with an affordance to add a new equipment entry inline)
- Aliases (chip/tag input; trimmed, lowercased, deduped on submit)
- Description (multiline)
- Instructions (multiline, separate from description)
- Video URL (single input in v1; writes to `videoUrls[0]`)
- Notes (multiline, optional)

Submitting writes to Dexie immediately and enqueues a `pending_writes` entry. The UI navigates back to the list or detail page and reflects the change without waiting for the server.

Edit reuses the same form, prefilled. Cancel discards changes.

## Search, filter, and sort semantics

- Search: case-insensitive substring match against `name` and any entry in `aliases`. Whitespace-trimmed.
- Type filter: single value from {strength, cardio, mixed} or none.
- Muscle filter: single value from the muscle enum or none. Matches an exercise if the value appears in either `primaryMuscles` or `secondaryMuscles` (primary-only vs both is an implementation choice; default to both, narrowed to primary if it proves too loose).
- Equipment filter: multi-select; an exercise matches if it references **any** of the selected equipment IDs (OR within equipment).
- Custom filter: see Open items.
- Filter combination: all active filters AND together, combined with the search string.
- Sort order: `lastUsedAt` descending with nulls last, then alphabetical by `name`. In v1 this effectively collapses to alphabetical because `lastUsedAt` is always null.
- All filtering, searching, and sorting happen client-side over the full Dexie cache.

## Offline and sync model

This feature establishes the project-wide pattern.

- **Dexie is the source of truth for the UI.** All reads go through Dexie. Tanstack Query wraps Dexie queries for caching, revalidation, and component-level subscriptions.
- **Every write goes to Dexie first.** Creates, updates, and deletes are applied to Dexie synchronously, and an entry is appended to the generic `pending_writes` outbox in the same transaction.
- **Background flusher.** A lightweight worker drains `pending_writes` when the app is online, posting each entry to the corresponding API endpoint. On success the entry is removed. On failure the entry is retained and retried with exponential backoff; `retries` may be incremented for observability.
- **Conflict handling (v1).** Last-write-wins by `updatedAt`; server accepts client-supplied IDs and timestamps. Formal conflict resolution is deferred.
- **Reads from server.** Periodically (and on app load) the client may pull `GET /api/v1/exercises` and `GET /api/v1/equipment` to reconcile Dexie with server state. Merge strategy: server records replace local copies unless there is a pending outbox entry for that ID, in which case the local copy wins until the outbox drains.
- **IDs.** Client-generated UUIDs everywhere; no server-assigned IDs.

## Seed data strategy

- A bundled JSON file ships with the client containing:
  - The curated equipment catalog (~10–15 entries).
  - ~30–60 curated common exercises spanning strength, cardio, and mixed, with sensible muscle/equipment tagging, aliases, and short instructions where useful. Curation source is unconstrained.
- On first app load, if the Dexie `equipment` and `exercises` stores are empty, hydrate them from the bundled JSON.
- If the server is reachable at hydration time, also fetch the server lists and merge (server wins on ID collision). If the server is unreachable, proceed with the local seed only; later reconciliation will merge server state when available.
- Seed records are treated as ordinary records: fully editable, fully deletable, no special protection.
- During development, seed aggressively (reset Dexie and re-hydrate on demand) to keep test data fresh.

## Validation rules

- `name`: required, trimmed, length 1–100.
- `type`: required, must be one of `strength` | `cardio` | `mixed`.
- `primaryMuscles[]`, `secondaryMuscles[]`: each entry must be a valid muscle enum value.
- `equipmentIds[]`: each entry must reference an existing equipment record at submit time (client-validated; server may soft-validate).
- `aliases[]`: each entry trimmed, lowercased, deduped; empty strings dropped.
- `videoUrls[]`: each entry validated as a URL (http/https).
- `description`, `instructions`, `notes`: optional; no length cap in v1 beyond a reasonable sanity limit.
- Equipment `name`: required, trimmed, 1–100, case-insensitively unique.
- All validation expressed as Zod schemas in the shared layer and reused on both client and server.

## Existing code to reference

No similar existing features in the Forge codebase — `src/` is a scaffold, and this feature is explicitly the pattern-setter. The design mockups under `design/` are the primary reference:

- `design/exercise-list.png` + `design/exercise-list.json` — list page (authoritative for layout).
- `design/exercise-detail.png` + `design/exercise-detail.json` — detail page (authoritative for layout).
- Other screens in `design/` (home, nav-drawer, settings, routine-builder, logger, etc.) provide styling/language cues (dark mode, amber accent, Tailwind v4 tokens) that this feature should stay consistent with.

Architectural context: `docs/PRD.md`, `docs/PRODUCT-PLAN.md`, `docs/decisions/0004-tech-stack.md`, `docs/decisions/0005-offline-strategy.md`.

## Visual assets

Files provided (authoritative for layout, high-fidelity):

- `design/exercise-list.png` — list screen with search, filter chip row, and dense exercise rows with type-initial tags and "last used" indicators.
- `design/exercise-detail.png` — detail screen with header, instructional card with video thumbnail, three stat tiles (EST 1RM / BEST SET / TOTAL SESSIONS), and a recent-history list.
- Matching `.json` files document the source prompts and styling tokens.

Visual insights:

- Dark mode, amber (#F59E0B) accent, #0B0B0C background, #17181A surfaces, #26272A borders, Inter typography.
- Type is communicated visually via colored S/C/M letter tags — no exercise images.
- Stats on the detail page use oversized tabular numerics; they must be hidden (not zeroed) when no history exists.
- No bottom tab bar; global nav is a drawer.
- Both screens are dense and scan-oriented — the requirements above preserve that density.

## Out of scope (explicit, v1)

- Workout-history stats on the detail page (EST 1RM, BEST SET, TOTAL SESSIONS, RECENT HISTORY content).
- "Add to routine" action from the exercise pages.
- Bulk import, export, or bulk API endpoints.
- Image uploads, local media storage, or media proxying; only external video URLs.
- Difficulty field.
- Free-form tags.
- Archive / soft-delete.
- Per-exercise default units.
- Advanced sort controls (column pickers, direction toggles, custom sort keys).
- Server-side filtering or search.
- Per-user isolation, auth UI, or multi-user accounts.

## Open items and deferred concerns

- **"Custom" filter chip ambiguity.** The mockup includes a `Custom` chip, but the schema no longer tracks a built-in/user-created distinction (`isBuiltIn` was explicitly dropped). Two acceptable resolutions, to be picked during UI build:
  1. **Drop the `Custom` chip** from the filter row.
  2. **Add a minimal `isSeed: boolean` flag** (true for seed-hydrated records, false for user-created) used **only** to power this filter chip. It must not be used for delete protection, fork-on-edit, or any other behavior.
- **Archive vs. history snapshotting.** V1 uses hard delete because no workout history exists to protect. When workouts land, one of the following must be chosen and implemented: introduce soft-delete/archive for exercises, or have workouts snapshot exercise name/metadata at log time so deletes don't corrupt history. Flagged for the workout-feature spec.
- **POST idempotency with client-supplied IDs.** Server behavior on ID collision (reject 409 vs upsert) needs to be pinned down in the spec.
- **Equipment deletion with references.** Decide whether deleting equipment referenced by exercises is blocked or detaches references; apply consistently.
- **Muscle filter scope.** Whether muscle filtering matches primary-only or primary+secondary. Default assumed to be both; revisit if results feel too loose in use.
- **Inline equipment creation vs. dedicated equipment management screen.** Either works for v1; pick during UI build.
- **Outbox payload shape for updates.** Full record vs. patch — decide in the spec, apply consistently across features.
