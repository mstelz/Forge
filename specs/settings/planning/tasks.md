# Task Breakdown: Settings

## Overview

Settings is a singleton feature that completes a full vertical slice from shared schema through server route, Dexie client storage, React context, units utility, display callsite replacement, and the settings page UI. The schema table, Dexie store declaration (version 5), and export registry entry already exist; what is missing is the six new schema fields and their migration, the `SETTINGS_ID` constant, the Hono routes, the `useSettings` hook and `SettingsContext`, the `units.ts` utility, all hard-coded `kg`/`km` callsite replacements, the settings page itself, and the nav/router wiring.

Total Tasks: ~66 across 11 phases.

Visual reference:
- `/home/mike/Development/Forge/specs/settings/planning/visuals/settings.png` (authoritative layout and styling for the settings page)

Authoritative spec: `/home/mike/Development/Forge/specs/settings/planning/spec.md`

Status legend: `[x]` done, `[~]` partial, `[ ]` not started.

---

## Phase status

- [x] Phase 1 — Drizzle schema update + migration
- [x] Phase 2 — Shared Zod schema extension (`src/shared/settings.ts`)
- [x] Phase 3 — Hono server routes (`src/server/routes/settings.ts`)
- [x] Phase 4 — Dexie version bump + `updateSettings` mutation + flusher wiring
- [x] Phase 5 — `useSettings` hook + `SettingsContext` + bootstrap
- [x] Phase 6 — `src/client/lib/units.ts` utility + `progress.ts` consolidation
- [x] Phase 7 — Hard-coded unit display callsite replacement
- [x] Phase 8 — Settings page UI (`src/client/pages/settings/index.tsx`)
- [x] Phase 9 — Navigation + router registration
- [x] Phase 10 — Tests
- [x] Phase 11 — Manual verification

---

## Phase 1: Drizzle schema update + migration

**Dependencies:** None. Existing `src/db/schema.ts` has a `settings` table with five columns; this phase adds six new columns.

### 1.1 [x] Add six new columns to the `settings` Drizzle table in `src/db/schema.ts`
- Add to the existing `settings` table definition (around line 314):
  - `heightUnit: text("height_unit").notNull().default("cm")`
  - `timezone: text("timezone").notNull().default("America/Chicago")`
  - `weekStartsOn: text("week_starts_on").notNull().default("mon")`
  - `showRpe: integer("show_rpe", { mode: "boolean" }).notNull().default(true)`
  - `showCardio: integer("show_cardio", { mode: "boolean" }).notNull().default(true)`
  - `theme: text("theme").notNull().default("system")`
- Boolean columns use `integer` with `{ mode: "boolean" }` — this is the pattern used by existing boolean columns in the schema (verify with a quick `grep` of existing boolean fields).
- No new indexes needed; none of these fields are query filter targets.
- File: `src/db/schema.ts`

### 1.2 [x] Generate and apply the Drizzle migration
- Run `bun run db:generate` from the repo root; verify the generated SQL includes all six new `ALTER TABLE settings ADD COLUMN` statements with correct types and `DEFAULT` values.
- Run `bun run db:migrate` against the local DB (which already contains the five-column settings table from the prior migration) and confirm it succeeds without errors.
- File created: `src/db/migrations/<timestamp>_settings_new_columns.sql`

**Acceptance Criteria (Phase 1):** Migration runs cleanly on a DB with existing data; `bun run db:migrate` exits 0; the six columns exist in the `settings` table; existing rows receive their default values.

---

## Phase 2: Shared Zod schema extension (`src/shared/settings.ts`)

**Dependencies:** Phase 1 (conceptually; runtime-independent).

### 2.1 [x] Add `SETTINGS_ID` constant
- Add `export const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";` at the top of `src/shared/settings.ts`.
- Both the server route (Phase 3) and the client bootstrap (Phase 5) import and use this constant exclusively; no other code generates or accepts a different settings id.

### 2.2 [x] Extend `SettingsSchema` with the six new fields
- Add to the existing `z.object({...})` in `src/shared/settings.ts`:
  - `heightUnit: z.enum(["cm", "ft"]).default("cm")`
  - `timezone: z.string().min(1).default("America/Chicago")`
  - `weekStartsOn: z.enum(["mon", "sun"]).default("mon")`
  - `showRpe: z.boolean().default(true)`
  - `showCardio: z.boolean().default(true)`
  - `theme: z.enum(["system", "light", "dark"]).default("system")`
- Existing fields `id`, `weightUnit`, `distanceUnit`, `createdAt`, `updatedAt` remain unchanged.

### 2.3 [x] Export `SettingsUpdateSchema`
- Add: `export const SettingsUpdateSchema = SettingsSchema.omit({ id: true, createdAt: true }).partial();`
- This schema is used by the PATCH route body parser (Phase 3). Keeping it in `src/shared/settings.ts` ensures client and server share the same validation.

### 2.4 [x] Verify `src/shared/index.ts` re-exports `SETTINGS_ID` and `SettingsUpdateSchema`
- `src/shared/settings.ts` is already re-exported via `export * from "./settings"` in `src/shared/index.ts`; confirm the new exports flow through correctly after the additions above.

### 2.5 [x] Extend `PendingEntityEnum` with `"settings"`
- In `src/shared/pending-write.ts`, add `"settings"` to the `PendingEntityEnum` values alongside the existing entities (`"exercise"`, `"equipment"`, `"routine"`, `"session"`, `"session_log"`, `"program"`, `"program_run"`, `"goal"`).
- This enables `{ entity: "settings", op: "update" }` entries in `pendingWrites` to pass Zod validation.

**Acceptance Criteria (Phase 2):** `bun run typecheck` from repo root passes; `SETTINGS_ID`, `SettingsSchema` (extended), and `SettingsUpdateSchema` are all importable from `src/shared`; `PendingEntityEnum` includes `"settings"`.

---

## Phase 3: Hono server routes (`src/server/routes/settings.ts`)

**Dependencies:** Phase 1, Phase 2.

### 3.1 [x] Create `src/server/routes/settings.ts` with row↔domain mappers
- Define `type SettingsRow = typeof settings.$inferSelect` (importing `settings` from `../../db/schema`).
- Implement `rowToSettings(row: SettingsRow): Settings` — maps snake_case DB row fields to camelCase domain fields; `showRpe` and `showCardio` are stored as integers (0/1) by Drizzle's boolean mode but the mapper should produce correct booleans (Drizzle's `{ mode: "boolean" }` handles this automatically — verify that the inferred type is already `boolean` before adding manual coercion).
- Implement `settingsToRow(s: Settings): SettingsRow` — reverse map.
- Pattern reference: `src/server/routes/goals.ts` `rowToGoal`/`goalToRow` pair.

### 3.2 [x] Implement `GET /api/v1/settings`
- Query `db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get()`.
- If row is absent: build a defaults object with `id: SETTINGS_ID`, `createdAt: Date.now()`, `updatedAt: Date.now()`, and all field defaults from `SettingsSchema`; insert it; return status 200 with the full object.
- If row exists: return status 200 with `rowToSettings(row)`.
- No 404 path — the auto-seed guarantee means this endpoint always returns 200.
- Import `SETTINGS_ID` from `../../shared/settings`.

### 3.3 [x] Implement `PATCH /api/v1/settings`
- Parse request body with `SettingsUpdateSchema`; return 400 with `validationError` helper on parse failure.
- Fetch existing row by `SETTINGS_ID`; if absent return 404 with `notFound` helper (should not occur in practice given GET auto-seeds, but guard defensively).
- Stale-update check: if `incoming.updatedAt` is defined and `incoming.updatedAt < existing.updatedAt`, return 409 with `staleUpdate` helper.
- Merge: `const merged = { ...rowToSettings(existing), ...incoming }`.
- Re-validate merged object with `SettingsSchema.parse(merged)` to catch any invalid combinations.
- Set `merged.updatedAt = Math.max(merged.updatedAt, Date.now())`.
- Persist: `db.update(settings).set(settingsToRow(merged)).where(eq(settings.id, SETTINGS_ID)).run()`.
- Return status 200 with the full merged object.
- No POST, no DELETE routes.

### 3.4 [x] Register `settingsRoute` in `src/server/routes/api.ts`
- Add import: `import { settingsRoute } from "./settings";`
- Add registration: `api.route("/settings", settingsRoute);`
- File: `src/server/routes/api.ts`

**Acceptance Criteria (Phase 3):** `bun run typecheck` passes; `GET /api/v1/settings` auto-seeds and returns the full 11-field object; `PATCH /api/v1/settings` with a partial body merges correctly; stale-update check rejects with 409 when `incoming.updatedAt` is older than stored.

---

## Phase 4: Dexie version bump + `updateSettings` mutation + flusher wiring

**Dependencies:** Phase 2, Phase 3.

### 4.1 [x] Add Dexie `version(6)` to `src/client/db/forge-db.ts`
- Add `this.version(6).stores({ ... })` repeating all existing store declarations from version 5 verbatim:
  ```
  exercises: "id, name, type, updatedAt",
  equipment: "id, name",
  pendingWrites: "id, createdAt, entity",
  meta: "key",
  routines: "id, name, updatedAt",
  sessions: "id, status, startedAt, sourceRoutineId",
  sessionSetLogs: "id, sessionId, [exerciseId+loggedAt], [sessionId+performedExerciseId+order], plannedSetId",
  programs: "id, name, updatedAt",
  programDays: "id, programId, weekIndex, dayIndex",
  programRuns: "id, programId, status, startedAt",
  programRunDayStates: "id, programRunId, weekIndex, dayIndex",
  goals: "id, status, category, deadline, updatedAt, linkedExerciseId, linkedProgramRunId",
  settings: "id",
  ```
- No new indexes for `settings`; the store declaration is unchanged (`"id"` only). The version bump is required so that existing users' IndexedDB schema is recognized by Dexie without an upgrade error when the new fields are written.
- File: `src/client/db/forge-db.ts`

### 4.2 [x] Implement `updateSettings` mutation in `src/client/db/mutations.ts`
- Add import for `Settings` from `../../shared` and `SETTINGS_ID` from `../../shared/settings`.
- Implement:
  ```ts
  export async function updateSettings(record: Settings): Promise<Settings> {
    await forgeDB.transaction("rw", forgeDB.settings, forgeDB.pendingWrites, async () => {
      await forgeDB.settings.put(record);
      await forgeDB.pendingWrites.add(enqueue("settings", "update", record));
    });
    return record;
  }
  ```
- The `enqueue` helper already exists in `mutations.ts`; reuse it directly.
- File: `src/client/db/mutations.ts`

### 4.3 [x] Wire `entity: "settings"` into the flusher (`src/client/sync/flusher.ts`)
- In `endpointFor`: add `if (entity === "settings") return \`${API_BASE}/settings\`;`
- In `send`: add a special case for `entity === "settings"` before the generic `op === "update"` path — settings always uses `PATCH /api/v1/settings` with no id in the URL segment:
  ```ts
  if (entry.entity === "settings") {
    return fetch(`${API_BASE}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.payload),
    });
  }
  ```
- Settings has no `create` or `delete` ops; the guard above covers the only used op.
- Coalescing: before the main drain loop, add a coalesce step that, for any run of multiple `entity === "settings"` pending writes, deletes all but the one with the highest `createdAt`. Implement as a small helper that queries `forgeDB.pendingWrites.where("entity").equals("settings").sortBy("createdAt")` and deletes all but the last entry if count > 1.
- File: `src/client/sync/flusher.ts`

### 4.4 [x] Add `settings` query key group to `src/client/db/query-keys.ts`
- Add to the `queryKeys` object:
  ```ts
  settings: {
    all: ["settings"] as const,
    singleton: () => ["settings", "singleton"] as const,
  },
  ```
- File: `src/client/db/query-keys.ts`

**Acceptance Criteria (Phase 4):** `bun run typecheck` passes; `updateSettings` can be called and writes to both `forgeDB.settings` and `forgeDB.pendingWrites` in a single transaction; the flusher routes `entity: "settings"` entries to `PATCH /api/v1/settings` without appending an id segment; coalescing drops duplicate settings entries keeping only the latest.

---

## Phase 5: `useSettings` hook + `SettingsContext` + bootstrap

**Dependencies:** Phase 4.

### 5.1 [x] Create `src/client/hooks/use-settings.ts`
- `useSettings()` subscribes to `liveQuery(() => forgeDB.settings.get(SETTINGS_ID))` in a `useEffect` (same pattern as `use-goals.ts`) and on each emission calls `qc.invalidateQueries({ queryKey: queryKeys.settings.all })`.
- The `useQuery` `queryFn` reads `forgeDB.settings.get(SETTINGS_ID)` directly (not via fetch).
- Query key: `queryKeys.settings.singleton()`.
- Returns the TanStack Query result; callers that need the value directly can use `data` from the result, but most components will consume `SettingsContext` instead.
- Import `SETTINGS_ID` from `../../shared/settings`.
- File: `src/client/hooks/use-settings.ts`

### 5.2 [x] Create `src/client/contexts/settings-context.tsx`
- Define a `Settings`-typed context with a sensible default (all fields at their `SettingsSchema` defaults, `id: SETTINGS_ID`):
  ```ts
  const defaultSettings: Settings = {
    id: SETTINGS_ID,
    weightUnit: "kg",
    distanceUnit: "km",
    heightUnit: "cm",
    timezone: "America/Chicago",
    weekStartsOn: "mon",
    showRpe: true,
    showCardio: true,
    theme: "system",
    createdAt: 0,
    updatedAt: 0,
  };
  export const SettingsContext = createContext<Settings>(defaultSettings);
  ```
- `SettingsProvider` component:
  - Calls `useSettings()` to subscribe to Dexie.
  - Provides `data ?? defaultSettings` to the context value.
  - On mount (and whenever `data?.theme` changes), calls `setTheme(data.theme)` from `src/client/lib/theme.ts` so that the Dexie-persisted theme overrides the `localStorage` value on startup.
- File: `src/client/contexts/settings-context.tsx`

### 5.3 [x] Add `SettingsProvider` to `src/client/main.tsx`
- Wrap `<App />` inside `<SettingsProvider>`, nested just inside `<QueryClientProvider>`:
  ```tsx
  <QueryClientProvider client={queryClient}>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </QueryClientProvider>
  ```
- File: `src/client/main.tsx`

### 5.4 [x] Implement settings bootstrap in `src/client/main.tsx` (or a dedicated `useSettingsBootstrap` hook)
- After `hydrateIfEmpty()` resolves (or in parallel, but after `forgeDB` is ready), check `forgeDB.settings.count()`:
  - If 0 and online: `fetch("/api/v1/settings")`, parse the response with `SettingsSchema.parse(...)`, and `forgeDB.settings.put(parsed)`.
  - If 0 and offline (fetch fails): build a local defaults object with `id: SETTINGS_ID`, `createdAt: Date.now()`, `updatedAt: Date.now()`, and all field defaults; `forgeDB.settings.put(defaults)`.
  - If count > 0: no-op; Dexie already has a settings row.
- This bootstrap must run before any component reads from `SettingsContext`, so place it in the same `void hydrateIfEmpty().finally(...)` chain or in a separate `void bootstrapSettings()` call at the same level.
- File: `src/client/main.tsx`

**Acceptance Criteria (Phase 5):** On a fresh app load with no Dexie settings row, the row is fetched from the server and upserted; on offline fresh load, a defaults row is upserted; `SettingsContext` is available to all components under `SettingsProvider`; theme from Dexie is applied on mount via `setTheme`.

---

## Phase 6: `src/client/lib/units.ts` utility + `progress.ts` consolidation

**Dependencies:** None (pure utility functions; no React or Dexie dependencies).

### 6.1 [x] Create `src/client/lib/units.ts`
- Implement the following exports:

  **`convertWeight(kg: number, unit: "kg" | "lb"): number`**
  - `return unit === "lb" ? kg * 2.20462 : kg;`

  **`formatWeight(kg: number, unit: "kg" | "lb"): string`**
  - Convert via `convertWeight`.
  - Round to one decimal place; drop the `.0` suffix if the result is a whole number.
  - Return e.g. `"135 lb"` or `"61.2 kg"`.
  - Helper: `const val = Math.round(converted * 10) / 10; const display = val % 1 === 0 ? String(val | 0) : val.toFixed(1);`

  **`convertDistance(m: number, unit: "m" | "km" | "mi"): number`**
  - `"km"`: `m / 1000`; `"mi"`: `m / 1609.344`; `"m"`: `m`.

  **`formatDistance(m: number, unit: "m" | "km" | "mi"): string`**
  - For `"m"`: whole numbers, e.g. `"400 m"`.
  - For `"km"` and `"mi"`: two decimal places when the converted value is non-integer; whole number when exact, e.g. `"3.10 mi"` → use `.toFixed(2)` unless `val % 1 === 0`. Spec examples: `"3.1 mi"`, `"1.5 km"`.
  - Return e.g. `"3.10 mi"` or `"1.50 km"` (two decimal places for km/mi per spec).
- File: `src/client/lib/units.ts`

### 6.2 [x] Consolidate `convertWeight` in `src/client/goals/progress.ts`
- Remove the local `convertWeight` function body (lines ~40–43).
- Replace with a re-export: `export { convertWeight } from "../lib/units";`
- All existing callers of `convertWeight` from `progress.ts` continue to work unchanged since the export contract is identical.
- File: `src/client/goals/progress.ts`

**Acceptance Criteria (Phase 6):** `bun run typecheck` passes; `convertWeight`, `formatWeight`, `convertDistance`, `formatDistance` are all importable from `src/client/lib/units`; `progress.ts` re-exports `convertWeight` without redefining it.

---

## Phase 7: Hard-coded unit display callsite replacement

**Dependencies:** Phase 5 (`SettingsContext` must exist), Phase 6 (`units.ts` must exist).

### 7.1 [x] Update `src/client/pages/workout/active.tsx` — weight display in set summary rows
- At line ~256 and ~273: replace `` `${log.weightKg} kg` `` with `formatWeight(log.weightKg, weightUnit)`.
- Read `weightUnit` from `useContext(SettingsContext)` at the top of the component (alongside other destructured context values).
- Import `formatWeight` from `../../lib/units` and `SettingsContext` from `../../contexts/settings-context`.

### 7.2 [x] Update `src/client/pages/workout/active.tsx` — `enteredWeight` / `enteredWeightUnit` pre-fill
- At line ~801–802: when opening the inline editor for a new set, pre-fill `enteredWeightUnit` from `settings.weightUnit` so the entered unit matches the user's preference.
- `enteredWeight` conversion: if pre-filling from a prior log that stored `weightKg`, convert to the active unit using `convertWeight(priorLog.weightKg, weightUnit)` before populating the stepper state.
- Import `convertWeight` from `../../lib/units`.

### 7.3 [x] Update `src/client/pages/workout/active.tsx` — inline editor weight label and aria-labels
- At line ~914: change the "Weight kg" label to dynamically read `"Weight \${weightUnit}"` using the active setting.
- At lines ~919 and ~930: update `aria-label` attributes on weight stepper buttons to include the active unit (e.g., `"Decrease weight in ${weightUnit}"`).

### 7.4 [x] Update `src/client/pages/workout/active.tsx` — distance display
- At line ~1009: replace the hard-coded distance display with `formatDistance(log.distanceM, distanceUnit)`.
- Read `distanceUnit` from `useContext(SettingsContext)`.
- Import `formatDistance` from `../../lib/units`.

### 7.5 [x] Update `src/client/pages/workout/active.tsx` — `showRpe` and `showCardio` wiring
- Read `showRpe` and `showCardio` from `useContext(SettingsContext)`.
- When `showRpe` is false: hide the RPE stepper/field in the inline log editor (wrap the RPE stepper JSX in `{showRpe && (...)}` or equivalent conditional).
- When `showCardio` is false: hide the duration and distance fields in the inline log editor. The local `showDurationDistance` variable (which gates based on exercise type) should be additionally gated: `const showDurationDistance = (isCardio || isMixed) && showCardio;`.

### 7.6 [x] Update `src/client/pages/workout/session-detail.tsx` — remove local format functions; import from `units.ts`
- At lines ~29–31: remove the local `formatVolume` and `formatDistance` function definitions.
- Import `formatWeight` and `formatDistance` from `../../lib/units`.
- Read `weightUnit` and `distanceUnit` from `useContext(SettingsContext)`.
- Import `SettingsContext` from `../../contexts/settings-context`.

### 7.7 [x] Update `src/client/pages/workout/session-detail.tsx` — volume tile and set rows
- At line ~217: replace `` `${formatVolume(volumeKg)} kg` `` with `formatWeight(volumeKg, weightUnit)`.
- At lines ~387 and ~395: replace `` `${log.weightKg} kg × ${log.reps}` `` with `` `${formatWeight(log.weightKg, weightUnit)} × ${log.reps}` `` (or equivalent).
- At any distance display callsite in this file: replace hard-coded distance formatting with `formatDistance(distanceM, distanceUnit)`.

### 7.8 [x] Update `src/client/pages/history/list.tsx` — volume display
- At line ~144: replace `` `${formatVolume(totalVolumeKg)} kg` `` with `formatWeight(totalVolumeKg, weightUnit)`.
- Read `weightUnit` from `useContext(SettingsContext)` at the component level.
- Import `SettingsContext` and `formatWeight`.

**Acceptance Criteria (Phase 7):** `bun run typecheck` passes with no `any` casts added; no literal string `" kg"` or `" km"` suffixes remain in the updated display files; all updated components read unit preference from `SettingsContext` rather than from a fresh Dexie call.

---

## Phase 8: Settings page UI (`src/client/pages/settings/index.tsx`)

**Dependencies:** Phase 5 (`useSettings`, `SettingsContext`, `updateSettings`), Phase 6 (`units.ts` if referenced).

Visual reference: `/home/mike/Development/Forge/specs/settings/planning/visuals/settings.png`

### 8.1 [x] Scaffold `src/client/pages/settings/index.tsx` with page shell
- Import `useContext` and `SettingsContext` from `../../contexts/settings-context`.
- Import `updateSettings` from `../../db/mutations`.
- Read current settings from context: `const settings = useContext(SettingsContext);`
- Render the `AppShell` top bar: hamburger (calls `openDrawer` from `useOutletContext<AppShellOutletContext>()`) + "Settings" title. No action button.
- Single scrollable column layout matching the dark-mode mockup background `#0B0B0C`.

### 8.2 [x] Implement `SegmentedControl` component (inline or extracted)
- Pill-shaped segmented control matching the amber-filled active-tab style visible in the mockup.
- Props: `options: { value: string; label: string }[]`, `value: string`, `onChange: (value: string) => void`.
- Active tab: amber fill `bg-[#F59E0B]` with dark label text. Inactive tab: transparent background with muted text.
- This is the same visual pattern as the exercise type filter chips — reuse existing chip/tab CSS patterns if they exist; otherwise define inline.
- Used by: Weight (kg/lb), Distance (m/km/mi), Height (cm/ft), Week starts on (Mon/Sun), Theme (System/Light/Dark).

### 8.3 [x] Implement `ToggleSwitch` component (inline or extracted)
- iOS-style switch: amber `#F59E0B` when on, gray when off. Min tap target 44px.
- Props: `checked: boolean`, `onChange: (checked: boolean) => void`, `label?: string`.
- Used by: Show RPE, Show cardio.

### 8.4 [x] Render UNITS & DISPLAY section
- Section header: small-caps muted text "UNITS & DISPLAY".
- Row 1 — **Weight**: `SegmentedControl` with options `[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]`; current value `settings.weightUnit`; `onChange` calls `updateSettings({ ...settings, weightUnit: v, updatedAt: Date.now() })`.
- Row 2 — **Distance**: three-option `SegmentedControl` with `m / km / mi`; maps to `settings.distanceUnit`.
- Row 3 — **Height**: two-option `SegmentedControl` with `cm / ft`; maps to `settings.heightUnit`.
- Row 4 — **Theme**: three-option `SegmentedControl` with `SYSTEM / LIGHT / DARK`; maps to `settings.theme`; on change also calls `setTheme(newTheme)` from `src/client/lib/theme.ts` so the CSS takes effect immediately in addition to being persisted.

### 8.5 [x] Render TIMEZONE & LOCALE section
- Section header: "TIMEZONE & LOCALE".
- Row 1 — **Timezone**: label on left, current `settings.timezone` value right-aligned as muted secondary text; a native `<select>` (or a tappable row that expands to a `<select>`) lists IANA timezone options. For v1, a `<select>` dropdown is sufficient — populate with a static array of the most common IANA timezones (e.g., all `America/*`, `Europe/*`, `Asia/*`, `Pacific/*` entries — a hardcoded list of ~50–100 entries is acceptable); `onChange` calls `updateSettings({ ...settings, timezone: e.target.value, updatedAt: Date.now() })`.
- Row 2 — **Week starts on**: `SegmentedControl` with `Mon / Sun`; maps to `settings.weekStartsOn`.

### 8.6 [x] Render FEATURES section
- Section header: "FEATURES".
- Row 1 — **Show RPE**: label on left, `ToggleSwitch` on right; maps to `settings.showRpe`; `onChange` calls `updateSettings({ ...settings, showRpe: v, updatedAt: Date.now() })`.
- Row 2 — **Show cardio**: label on left, `ToggleSwitch` on right; maps to `settings.showCardio`.

### 8.7 [x] Render DATA MANAGEMENT section
- Section header: "DATA MANAGEMENT".
- Row 1 — **Export workout data**: tappable row with label on left, right-chevron icon (Lucide `ChevronRight`) on right; `onClick` calls `triggerExport()` imported from `../../export/trigger`. Secondary muted text below the label: "Export as JSON" (or show meta like database path / last workout if easily sourced; best-effort).
- Row 2 — **Reset all data**: render with destructive red text `text-red-500`; `opacity-50` and `pointer-events-none` (visually disabled, no `onClick`); label "Reset all data". No action wired in v1.

### 8.8 [x] Render PROFILE card (static placeholder)
- Render a simple static card at the top of the page with an avatar circle placeholder (initials or icon), the label "Profile" or user name placeholder text, and a note that profile editing is not available in v1.
- If the card feels noisy with placeholder text, omit it entirely — the spec explicitly allows omission in v1. If omitted, skip directly to the UNITS & DISPLAY section. Document the decision as a comment in the component.

### 8.9 [x] Render FORGE MKI / RESET decorative footer
- A small centered muted text label "FORGE MKI" at the bottom of the scroll area — decorative only, no action.

**Acceptance Criteria (Phase 8):** The settings page renders all sections from the mockup; every control calls `updateSettings` with the correct partial update on change; no Save button exists; `SegmentedControl` shows amber fill on the active option; `ToggleSwitch` shows amber when on; the Export row triggers export; the Reset row is visually disabled.

---

## Phase 9: Navigation + router registration

**Dependencies:** Phase 8.

### 9.1 [x] Add `/settings` route to `src/client/app.tsx`
- Add import: `import { SettingsPage } from "./pages/settings/index";`
- Add route inside the `AppShell` children array: `{ path: "/settings", element: <SettingsPage /> }`.
- Position it before the catch-all `{ path: "*", ... }` route.
- File: `src/client/app.tsx`

### 9.2 [x] Add Settings nav item to `src/client/layouts/app-shell.tsx`
- In the `NAV_ITEMS` array, add `{ to: "/settings", label: "Settings" }` positioned just above the `ExportButton` in the drawer. Because `ExportButton` is rendered separately after the `NAV_ITEMS` loop, adding `{ to: "/settings", label: "Settings" }` as the last entry of `NAV_ITEMS` naturally places it directly above the Export button.
- The existing `NavLink` render loop handles the new entry with no other changes.
- File: `src/client/layouts/app-shell.tsx`

**Acceptance Criteria (Phase 9):** Navigating to `/settings` renders the settings page within the AppShell; the nav drawer displays "Settings" as a link; clicking it navigates to `/settings` and closes the drawer.

---

## Phase 10: Tests

**Dependencies:** Phases 6–9.

### 10.1 [x] Write focused unit tests for `src/client/lib/units.ts`
- Create `src/client/lib/__tests__/units.test.ts`.
- Write 6–8 focused tests:
  1. `convertWeight(100, "kg")` returns `100`.
  2. `convertWeight(100, "lb")` returns approximately `220.462`.
  3. `formatWeight(61, "kg")` returns `"61 kg"` (drops `.0` suffix).
  4. `formatWeight(61.23, "kg")` returns `"61.2 kg"` (rounds to one decimal).
  5. `formatWeight(100, "lb")` returns `"220.5 lb"` (check rounding).
  6. `convertDistance(1000, "km")` returns `1`.
  7. `convertDistance(1609.344, "mi")` returns approximately `1`.
  8. `formatDistance(400, "m")` returns `"400 m"` (whole number, no decimal).
- Run: `bun run test src/client/lib/__tests__/units.test.ts` and confirm all 6–8 pass.

### 10.2 [x] Write focused integration tests for `updateSettings` mutation
- Create or add to `src/client/db/__tests__/settings-mutations.test.ts`.
- Write 3–4 focused tests:
  1. `updateSettings(record)` writes the record to `forgeDB.settings` and the record is retrievable by `SETTINGS_ID`.
  2. `updateSettings(record)` enqueues a `pendingWrites` entry with `entity: "settings"` and `op: "update"`.
  3. Calling `updateSettings` twice with different `updatedAt` values results in two `pendingWrites` entries (coalescing happens in the flusher, not the mutation).
  4. After `updateSettings`, `forgeDB.settings.get(SETTINGS_ID)` returns the updated value (not the prior value).
- Run: `bun run test src/client/db/__tests__/settings-mutations.test.ts` and confirm all pass.

### 10.3 [x] Verify typecheck is clean across all modified files
- Run `bun run typecheck` from the repo root.
- Resolve any type errors introduced by the new `Settings` fields (e.g., components that destructure `Settings` and now need the six new fields).
- Pay particular attention to: `active.tsx`, `session-detail.tsx`, `history/list.tsx`, `goals/progress.ts`, `mutations.ts`, `flusher.ts`, `settings-context.tsx`, `use-settings.ts`.

### 10.4 [x] Run the full client test suite and confirm no regressions
- Run `bun run test` from `src/client` (or the repo root, whichever runs all existing tests).
- Expected baseline: 52+ tests passing (per HANDOFF.md).
- Investigate and fix any failures introduced by this spec's changes before proceeding to Phase 11.

**Acceptance Criteria (Phase 10):** All 6–8 units tests pass; all 3–4 mutation tests pass; `bun run typecheck` exits 0; the full test suite shows no new failures compared to the pre-settings baseline.

---

## Phase 11: Manual verification

**Dependencies:** All prior phases. App running locally via `bun run dev`.

### 11.1 [x] Verify settings bootstrap on fresh IndexedDB
- Open the app in a browser with a cleared IndexedDB (`Application → Storage → Clear site data` in DevTools).
- Confirm that on first load, `GET /api/v1/settings` is called and the settings row appears in the Dexie `settings` table (inspect via Dexie DevTools or `forgeDB.settings.toArray()` in the console).
- Confirm the nav drawer shows a "Settings" link.

### 11.2 [x] Verify the settings page renders all sections
- Navigate to `/settings` from the nav drawer.
- Confirm each section is present: UNITS & DISPLAY (Weight, Distance, Height, Theme), TIMEZONE & LOCALE (Timezone, Week starts on), FEATURES (Show RPE, Show cardio), DATA MANAGEMENT (Export row, disabled Reset row).
- Compare layout against `planning/visuals/settings.png`: amber active-tab fill, muted section headers, iOS-style switches for boolean toggles.

### 11.3 [x] Verify weight unit toggle propagates instantly across the app
- On the settings page, switch weight unit from kg to lb.
- Without reloading, navigate to `/history`, `/workout/sessions/:id` (post-finish detail), and the workout logger (`/workout/active` if a session is in progress).
- Confirm all weight displays show lb values (e.g., a 100 kg lift appears as "220.5 lb").
- Switch back to kg; confirm all displays revert.

### 11.4 [x] Verify distance unit toggle propagates
- Switch distance unit from km to mi; verify distance values in session detail and history update to miles.

### 11.5 [x] Verify Show RPE toggle hides/shows the RPE field in the logger
- Navigate to the workout logger with an active session.
- Open settings, toggle Show RPE off; return to the logger — RPE stepper should be hidden.
- Toggle Show RPE back on; RPE stepper reappears.

### 11.6 [x] Verify Show cardio toggle hides/shows duration and distance in the logger
- With a cardio or mixed exercise in the active session, toggle Show cardio off; duration and distance fields should disappear from the inline editor.

### 11.7 [x] Verify theme selector applies immediately
- Switch theme to Light; app should switch to light mode without a page reload.
- Switch to Dark; dark mode applies.
- Switch to System; follow system preference.

### 11.8 [x] Verify outbox sync — settings PATCH reaches the server
- Make a settings change while online; open Network DevTools and confirm `PATCH /api/v1/settings` is sent with the full settings payload; server returns 200.

### 11.9 [x] Verify offline settings change syncs on reconnect
- In DevTools, set network to Offline.
- Change the weight unit on the settings page; confirm the UI updates immediately (Dexie write succeeds).
- Re-enable network; confirm the flusher drains and `PATCH /api/v1/settings` is sent.

### 11.10 [x] Verify Export button in DATA MANAGEMENT section works
- Tap "Export workout data" on the settings page; confirm a JSON download is triggered (same as the existing drawer export button).

**Acceptance Criteria (Phase 11):** All 10 manual verification steps pass; the settings page matches the mockup; unit preferences propagate reactively across all surfaces without a page reload; offline changes sync correctly on reconnect.

---

## Execution order

Recommended implementation sequence (each phase unlocks the next):

1. **Phase 1** — DB migration (enables Drizzle schema to match the new fields)
2. **Phase 2** — Shared Zod schema extension (unlocks type-safe use across server and client)
3. **Phase 3** — Hono server routes (API layer complete)
4. **Phase 4** — Dexie version bump + mutation + flusher wiring (client storage layer complete)
5. **Phase 5** — `useSettings` hook + `SettingsContext` + bootstrap (React layer complete)
6. **Phase 6** — `units.ts` utility + `progress.ts` consolidation (pure utility; can be done in parallel with Phase 5)
7. **Phase 7** — Hard-coded callsite replacement (requires Phases 5 and 6)
8. **Phase 8** — Settings page UI (requires Phase 5; Phase 6 optional dependency)
9. **Phase 9** — Navigation + router registration (requires Phase 8)
10. **Phase 10** — Tests (runs against all completed phases)
11. **Phase 11** — Manual verification (requires app running end-to-end)

Phases 5 and 6 can be worked in parallel by two engineers since `units.ts` has no React or Dexie dependencies.
