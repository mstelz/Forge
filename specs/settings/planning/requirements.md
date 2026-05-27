# Spec Requirements: Settings

## Overview

Settings is a singleton feature that lets the single Forge user configure app-wide preferences. The schema, DB table, Dexie store, and export-registry entry already exist; what is missing is the server route, client hook, and settings page UI. This spec covers the full slice from Hono route through React page so the feature is production-ready and consistent with all established Forge patterns.

## Goals

- Let the user view and change their unit preferences (weight and distance) from a dedicated settings page.
- Surface additional UI-controlled preferences visible in the mockup (height unit, timezone/locale, week start day, Show RPE toggle, Show cardio toggle, theme selector) without necessarily persisting every toggle server-side in v1 — scope is clarified in the data model section below.
- Wire unit preferences into every site that currently hard-codes `kg` or `km` so the display reflects the user's choice.
- Provide the navigation entry point (drawer link) and the export hook (already registered as `optional: true, singleton: true`).
- Follow the Drizzle + Zod shared + Hono + Dexie + `pending_writes` outbox pattern exactly as established by the exercise library.

## Non-goals (v1)

- Multi-user settings or per-device overrides.
- Auth or access control (single-user local app).
- Profile photo or avatar upload.
- Push notifications or reminder configuration.
- Automatic timezone detection that overrides the stored value.
- "Danger zone" / reset-all-data (shown in mockup — deferred; destructive operation with no recovery path in v1).
- Bodyweight / height tracking as a time-series (the profile card in the mockup shows static weight/height values; these fields are not in the existing schema and are out of scope unless added to the schema deliberately).
- Programmatic theme switching beyond a stored preference (actual CSS variable swap can be a stretch goal).

## User stories

- As the single user, I open Settings from the nav drawer and see my current preferences at a glance.
- As the user, I change my weight unit from kg to lb and immediately see all weight displays throughout the app (workout logger, session detail, workout history, goals) reflect that change without a page reload.
- As the user, I change my distance unit from km to mi and see distance values in session history update accordingly.
- As the user, I change my preferred height unit (cm/ft) so that any height-related display is consistent with my locale.
- As the user, I set my timezone so that session history groups workouts correctly by local date.
- As the user, I toggle week start (Mon/Sun) so that program and calendar views start on the correct day.
- As the user, I toggle Show RPE on or off to control whether RPE fields are visible in the workout logger.
- As the user, I toggle Show cardio on or off to control whether cardio metric fields appear in the logger.
- As the user, I select a theme (System / Light / Dark) so the app renders in my preferred color scheme.
- As the user, I navigate to the Export screen from within the Data Management section of Settings (the settings page surfaces a deep link; the export feature is handled by the existing export spec).
- As the user, I can edit settings while offline; my changes apply immediately to the local Dexie store and sync to the server when connectivity is restored.

## Data model

### What already exists

`src/shared/settings.ts` defines `SettingsSchema`:

```ts
{
  id: string (UUID),
  weightUnit: "kg" | "lb",        // default "kg"
  distanceUnit: "m" | "km" | "mi", // default "km"
  createdAt: number (ms epoch),
  updatedAt: number (ms epoch),
}
```

`src/db/schema.ts` has the `settings` SQLite table with these five columns.

`src/client/db/forge-db.ts` version 5 declares `settings: Table<Settings, string>` with index on `id`.

`src/shared/export/registry.ts` registers `settings` as `optional: true, singleton: true`.

### Fields visible in the mockup but absent from the existing schema

The `design/settings.png` mockup shows the following controls that have **no corresponding column** in the current schema:

| Mockup control | Proposed field name | Type | Default |
|---|---|---|---|
| Height unit (cm / ft) | `heightUnit` | `"cm" \| "ft"` | `"cm"` |
| Timezone | `timezone` | string (IANA tz) | `"America/Chicago"` (mockup value) |
| Week starts on (Mon / Sun) | `weekStartsOn` | `"mon" \| "sun"` | `"mon"` |
| Show RPE (toggle) | `showRpe` | boolean | `true` |
| Show cardio (toggle) | `showCardio` | boolean | `true` |
| Theme (System / Light / Dark) | `theme` | `"system" \| "light" \| "dark"` | `"system"` |

**Resolution for v1:** All six fields should be added to `SettingsSchema`, the Drizzle `settings` table, and the Dexie store schema (new version bump). This keeps the schema complete and avoids a second schema migration later. Fields not yet consumed by other features (timezone, weekStartsOn) are stored but dormant until those features land.

### Singleton semantics

There is exactly one settings row per deployment. It uses a fixed, hard-coded UUID constant (e.g., `SETTINGS_ID = "00000000-0000-0000-0000-000000000001"`) defined in the shared layer. Both client and server use this constant to key the upsert.

- **First run:** If no settings row exists, the server auto-seeds it with defaults on first GET. The client upserts defaults into Dexie on app startup if the store is empty.
- **No create endpoint:** Because the row is auto-seeded, the API surface is `GET /api/v1/settings` and `PATCH /api/v1/settings`. No POST, no DELETE.
- **Outbox discriminator:** `entity: "settings"` in `pending_writes`.

## API surface

All endpoints under `/api/v1/settings`.

### `GET /api/v1/settings`

Returns the singleton settings object. If no row exists in the DB, auto-inserts a row with defaults and returns it. Response shape matches `SettingsSchema`.

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "weightUnit": "kg",
  "distanceUnit": "km",
  "heightUnit": "cm",
  "timezone": "America/Chicago",
  "weekStartsOn": "mon",
  "showRpe": true,
  "showCardio": true,
  "theme": "system",
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000
}
```

### `PATCH /api/v1/settings`

Partial update. Accepts any subset of the mutable fields (all except `id`, `createdAt`). Applies a stale-update check identical to other routes: reject with 409 if incoming `updatedAt` is older than stored. Returns the full updated object.

No `POST /api/v1/settings` — the singleton is auto-seeded on first GET.
No `DELETE /api/v1/settings` — settings are permanent.
No sub-resource routes.

Request/response validation driven by Zod schemas in the shared layer.

## UI — Settings page

Route: `/settings`

Visual reference: `design/settings.png` (high-fidelity dark-mode mockup).

### Navigation entry point

Add a `{ to: "/settings", label: "Settings" }` entry to `NAV_ITEMS` in `src/client/layouts/app-shell.tsx`. Position: bottom of the nav list, just above the Export JSON button. The `/settings` route is registered in `src/client/app.tsx` alongside all other routes.

### Page structure

The page is a single scrollable column. Top bar: back arrow (or hamburger opening drawer) + "Settings" title. No action button in the top bar.

**PROFILE card** (top section)

Displays the user's name (static: "Mike Stelzer" in the mockup — no editable name field in v1 schema), birth date if available, and a compact row for Weight, Height, and Height unit. These values are for display/context; editable profile fields (name, DOB, weight, height) are out of scope for v1 and should render as static placeholder text or be omitted entirely. If omitted, the profile section may be dropped from the page until the schema supports it.

**UNITS & DISPLAY section**

Three toggle rows using a segmented toggle control (matching the amber-accent pill style visible in the mockup):

1. **Weight** — `kg` / `lb`. Maps to `weightUnit`.
2. **Distance** — `m` / `km` / `mi`. Maps to `distanceUnit`. Three-option toggle.
3. **Height** — `cm` / `ft`. Maps to `heightUnit`.

**TIMEZONE & LOCALE section**

1. **Timezone** — tappable row opening a native `<select>` or a scrollable list picker. Stores an IANA timezone string. Mockup shows `America/Chicago`.
2. **Week starts on** — `Mon` / `Sun` toggle. Maps to `weekStartsOn`.

**FEATURES section**

Two toggle rows (iOS-style switch):

1. **Show RPE** — boolean on/off. Maps to `showRpe`. When off, RPE fields are hidden in the workout logger.
2. **Show cardio** — boolean on/off. Maps to `showCardio`. When off, cardio metric fields (distance, duration for cardio exercises) are hidden in the logger.

**THEME section** (or embedded in UNITS & DISPLAY)

Three-option segmented control: `SYSTEM` / `LIGHT` / `DARK`. Maps to `theme`.

**DATA MANAGEMENT section**

1. **Export workout data** — tappable row with a chevron, deep-linking to the existing export trigger (`triggerExport()` or navigating to a dedicated export route if one exists). Shows secondary meta text: database path, last workout date, storage size (these are informational; sourcing them is a best-effort implementation detail).
2. **Report all data** — intentionally grayed out / disabled in v1 (shown in mockup under "DANGER ZONE"). Renders as a disabled destructive-red row with no action wired.

### Interaction model

- Every preference change saves immediately (optimistic) — no explicit "Save" button.
- Each toggle / segmented control writes to Dexie and enqueues a `pending_writes` entry (`entity: "settings"`, `op: "update"`) in the same transaction.
- The background flusher drains the outbox to `PATCH /api/v1/settings` as with all other entities.
- Unit changes propagate via a React context or a `useSettings()` hook that all display components subscribe to. Components do not re-read Dexie directly on each render; they consume the context value.

## Unit display propagation

The following surfaces currently hard-code `kg` or `km` and must be updated to read from settings:

| Surface | File | Current behavior | Required change |
|---|---|---|---|
| Workout logger inline editor | `src/client/pages/workout/active.tsx` | Label "Weight kg", increments 2.5 kg, displays raw `weightKg` | Read `weightUnit` from settings; show label "Weight lb" when lb; convert display value; store `weightKg` (canonical) and `enteredWeightUnit` (already on the log schema) |
| Workout logger set summary | `src/client/pages/workout/active.tsx` line ~256 | `${log.weightKg} kg` | Convert to preferred unit with suffix |
| Session detail page volume tile | `src/client/pages/workout/session-detail.tsx` line ~217 | `${formatVolume(volumeKg)} kg` | Convert and suffix |
| Session detail set rows | `src/client/pages/workout/session-detail.tsx` lines ~387,395 | `${log.weightKg} kg × ${log.reps}` | Convert and suffix |
| Session detail distance | `src/client/pages/workout/session-detail.tsx` `formatDistance()` | Converts m→km above 1000 m, hard-coded | Respect `distanceUnit`; convert to mi when mi |
| History list volume tile | `src/client/pages/history/list.tsx` | `${formatVolume(totalVolumeKg)} kg` | Convert and suffix |
| Goals form / detail | `src/client/pages/goals/form.tsx`, `goals/detail.tsx` | Unit labels reference goal's own `unit` field | Goals already store a unit per goal; ensure the default unit pre-fill matches `weightUnit`/`distanceUnit` from settings |

The canonical storage unit remains `weightKg` (kg) and `distanceM` (metres) — values are always stored canonically and converted on read. The `enteredWeight`/`enteredWeightUnit` and `enteredDistance`/`enteredDistanceUnit` fields on `session_set_logs` already capture what the user typed; these should be populated consistently using the active setting.

A shared utility module (e.g., `src/client/lib/units.ts`) should expose:
- `convertWeight(kg: number, unit: "kg" | "lb"): number`
- `formatWeight(kg: number, unit: "kg" | "lb"): string` — e.g., `"135 lb"`
- `convertDistance(m: number, unit: "m" | "km" | "mi"): number`
- `formatDistance(m: number, unit: "m" | "km" | "mi"): string` — e.g., `"3.1 mi"`

`src/client/goals/progress.ts` already has a `convertWeight()` function — that implementation should be consolidated into the shared utility rather than duplicated.

## Offline and sync model

Follows the same Dexie-first + outbox pattern as all other features.

- **Reads:** `useSettings()` hook queries Dexie (not the network) for the settings singleton. On app startup, if the Dexie `settings` store is empty, fetch `GET /api/v1/settings` and upsert the result into Dexie.
- **Writes:** Every preference change writes to Dexie immediately and enqueues `{ entity: "settings", op: "update", payload: <full settings object> }` into `pending_writes`.
- **Flush:** The background flusher sends `PATCH /api/v1/settings` with the full settings payload. Because the singleton is always the same ID and updates are idempotent last-write-wins, coalescing multiple pending entries for `entity: "settings"` is acceptable (keep only the most recent).
- **Conflict handling:** Last-write-wins by `updatedAt`, same as all other entities.
- **Export:** Already registered in `EXPORT_REGISTRY` as `optional: true, singleton: true`. The export feature serializes the settings singleton as a plain object (not an array) under `entities.settings`.

## Validation rules

- `weightUnit`: required, `"kg" | "lb"`.
- `distanceUnit`: required, `"m" | "km" | "mi"`.
- `heightUnit`: required, `"cm" | "ft"`.
- `timezone`: required string, non-empty. No runtime IANA validation in v1; accept any non-empty string.
- `weekStartsOn`: required, `"mon" | "sun"`.
- `showRpe`: required boolean.
- `showCardio`: required boolean.
- `theme`: required, `"system" | "light" | "dark"`.
- `createdAt`, `updatedAt`: non-negative integers (ms epoch).
- All validation expressed as Zod schemas in `src/shared/settings.ts`, reused on both client and server.

## Existing code to reference

### Server route pattern
- `src/server/routes/goals.ts` — closest analogue for a simple Hono route with row↔domain mappers, `idConflict`/`notFound`/`validationError`/`staleUpdate` helpers, and PATCH merge logic. Settings is simpler (no list, no delete) but follows the same shape.
- `src/server/routes/api.ts` — register the new `settingsRoute` here.

### Client hook pattern
- `src/client/hooks/use-goals.ts` — pattern for Dexie `liveQuery` subscription + TanStack Query invalidation. Settings uses the same pattern but for a single row rather than a list.

### Dexie store
- `src/client/db/forge-db.ts` — add a version 6 schema bump. The `settings` store is already declared in version 5 with `"id"` as the index; if new fields require new indexes (unlikely for settings), add them here.

### Navigation
- `src/client/layouts/app-shell.tsx` — add `/settings` to `NAV_ITEMS`.
- `src/client/app.tsx` — register the `/settings` route.

### Unit conversion utility
- `src/client/goals/progress.ts` already has `convertWeight(kg, unit)` — consolidate into a shared `src/client/lib/units.ts`.

### Query keys
- Add `settings` key group to `src/client/db/query-keys.ts` (or equivalent) following the pattern used for goals.

## Visual assets

### Files provided

- `design/settings.png` — high-fidelity dark-mode mockup of the full settings page.

### Visual insights

- Dark mode, amber (#F59E0B) accent for active state in segmented controls, `#0B0B0C` background, `#17181A` surfaces, `#26272A` section dividers. Consistent with all other screens.
- Layout is a standard settings list: section headers in small-caps muted text, rows with label on left and control on right.
- Segmented toggle controls (Weight: kg/lb, Distance: km/mi, Height: cm/ft) use pill-shaped tabs with amber fill on the active tab. These are the same visual pattern as type filter chips on the exercise list.
- Feature toggles (Show RPE, Show cardio) use a standard iOS-style switch in amber when on, gray when off.
- Theme selector is a three-tab segmented control: `SYSTEM` / `LIGHT` / `DARK`.
- The Profile card at the top shows an avatar placeholder, name, DOB, and a compact stats row (Weight / Height). The mockup values are static/illustrative; no editable name or DOB field is implied for v1.
- Data Management section contains an "Export workout data" row with a right-chevron and secondary meta text (database path, last workout, storage size).
- Danger Zone section has a single red destructive row ("Reset all data"). It is shown but should be disabled/inert in v1.
- The mockup does not show a Save button anywhere; inline-save on change is the intended pattern.
- Page fidelity: high-fidelity. Use the mockup as the authoritative layout and styling reference.

## Functional requirements

### FR-1: Settings page and navigation
- The `/settings` route renders the settings page within the `AppShell`.
- The nav drawer includes a "Settings" link navigating to `/settings`.
- The page top bar shows the "Settings" title and a hamburger/back affordance.

### FR-2: Unit preferences
- The user can change `weightUnit` between `kg` and `lb` via a segmented control.
- The user can change `distanceUnit` among `m`, `km`, and `mi` via a segmented control.
- The user can change `heightUnit` between `cm` and `ft` via a segmented control.
- Changes take effect immediately without a save button.

### FR-3: Unit display propagation
- All weight values displayed in the workout logger, session detail, history list, and goals pages read `weightUnit` from the settings context and convert from canonical `kg` before display.
- All distance values read `distanceUnit` from settings and convert from canonical metres.
- No hard-coded `kg` or `km` suffixes remain in display code after this feature lands.

### FR-4: Locale preferences
- The user can set a timezone (stored as IANA string).
- The user can set week start day (`mon` or `sun`).
- These values are stored and synced but their behavioral impact on other features is deferred to those feature specs.

### FR-5: Feature toggles
- `showRpe` controls visibility of RPE input fields in the workout logger.
- `showCardio` controls visibility of cardio metric fields in the workout logger.
- The logger reads these from the settings context and hides/shows the relevant fields reactively.

### FR-6: Theme selector
- Three-option control: `system` / `light` / `dark`.
- The stored value is applied to the document root class or a CSS custom-property selector on app startup and reactively when changed. Actual implementation (class on `<html>` or a React state context) is an implementation detail.

### FR-7: Data management links
- "Export workout data" row triggers `triggerExport()` or navigates to the export route.
- "Reset all data" row is rendered but visually disabled (grayed, no tap action) in v1.

### FR-8: Singleton bootstrap
- On app startup, if `forgeDB.settings` is empty, fetch `GET /api/v1/settings` and upsert the result into Dexie.
- If offline at startup and Dexie is empty, upsert a default settings object (using `SETTINGS_ID`) so the app has a settings row to read from.

### FR-9: Offline persistence
- All setting changes write to Dexie first and enqueue a `pending_writes` entry.
- The flusher syncs the singleton to the server when online; multiple queued settings updates may be coalesced (keep latest by `updatedAt`).

## Non-functional requirements

- **Offline-first:** Settings page is fully usable offline; changes are immediately reflected in the UI.
- **Reactive propagation:** Unit preference changes propagate to all consuming components without a page reload. A React context (`SettingsContext`) provided near the root is the recommended mechanism.
- **No Save button:** Inline auto-save is the UX pattern, matching the mockup.
- **Mobile-first:** Single-column layout, touch-friendly toggle targets (minimum 44 px tap area), dense but readable section rows.
- **Consistency:** Styling tokens, typography, and component patterns are identical to the exercise library and goals pages.
- **Type safety:** All settings fields are typed end-to-end through `SettingsSchema`; no `any` casts in the route or hook.

## Scope boundaries

**In scope:**

- `GET /api/v1/settings` and `PATCH /api/v1/settings` Hono routes.
- `SettingsSchema` update to include the six new fields.
- Drizzle `settings` table migration to add the six new columns.
- Dexie version bump to expose new fields on the `settings` store.
- `useSettings()` React hook (Dexie liveQuery + TanStack Query).
- `SettingsContext` React context for app-wide reactive consumption.
- `/settings` page with all sections shown in the mockup (profile card as static/placeholder, data management as link + disabled danger zone).
- Unit conversion utility (`src/client/lib/units.ts`) consolidating existing `convertWeight`.
- Updating all hard-coded `kg`/`km` display sites to read from settings context.
- Nav drawer link to `/settings`.
- Route registration in `app.tsx`.
- `showRpe` and `showCardio` wired into the workout logger hide/show logic.
- Theme preference stored and applied on startup.

**Out of scope (v1):**

- Editable profile name, DOB, body weight, body height fields (no schema support).
- "Reset all data" / danger zone action.
- Timezone behavioral impact on history grouping (stored only).
- Week start day behavioral impact on program calendar (stored only).
- Per-exercise unit overrides.
- Notification or reminder settings.
- Auto timezone detection.
- Multiple settings rows or per-device overrides.
- Server-side theme rendering / SSR.

## Open items and deferred concerns

- **Profile card fields:** The mockup shows Weight (188 lb), Height (5'11"), and DOB fields. None of these exist in `SettingsSchema`. Either add `profileWeight`, `profileHeight`, `dateOfBirth` fields to the schema (with appropriate units), or render the profile section as a static placeholder in v1. The spec writer should pick one option and document it.

- **Height unit behavioral scope:** `heightUnit` is being added for completeness but no feature currently displays height. Clarify whether it should be added as a dormant field only or skipped entirely if the profile section is deferred.

- **Timezone picker UX:** A full IANA timezone list has ~600 entries. A native `<select>` is the simplest implementation; a searchable dropdown is better UX. Pick one approach during UI build and document.

- **Theme CSS mechanism:** Three options exist: (a) a `data-theme` attribute on `<html>` toggled by a context effect, (b) a `class` on `<html>` (`dark`, `light`), or (c) a CSS custom-property override block. The existing design tokens appear to be defined as CSS variables on `:root`. Spec writer should confirm the right injection point before implementation.

- **Settings outbox coalescing:** Because settings is a singleton, multiple queued `pending_writes` entries with `entity: "settings"` carry the same destination. The flusher may coalesce them (send only the latest) to avoid redundant PATCHes. Whether this coalescing lives in the flusher or is documented as acceptable redundancy should be decided during implementation.

- **`routineExercises` registry entry:** `src/shared/export/registry.ts` references `drizzleTableName: "routine_exercises"` and `dexieStore: "routineExercises"` with `schema: z.unknown()` and `optional: true`. No such table exists in `src/db/schema.ts` or `forge-db.ts`. This appears to be a legacy stub. The settings spec writer should note this inconsistency but not attempt to resolve it — flag it for cleanup in a separate task.
