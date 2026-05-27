# Specification: Settings

## Goal

Deliver a fully wired Settings feature: Hono routes for the singleton settings document, a `useSettings` hook backed by Dexie liveQuery, a `SettingsContext` for app-wide reactive consumption, the `/settings` page matching the dark-mode mockup, and replacement of every hard-coded `kg`/`km` display with a shared `src/client/lib/units.ts` utility. The schema, Dexie store, and export registry entry already exist; this spec fills the remaining slice from server route through React page.

## User Stories

- As the single user, I open Settings from the nav drawer and toggle my weight unit from kg to lb; all weight values throughout the app (logger, session detail, history list, goals) immediately reflect the new unit without a page reload.
- As the user, I change my distance unit and adjust locale preferences (timezone, week start, theme) from a single scrollable page that saves every change instantly with no Save button.

## Specific Requirements

**Singleton identity constant**
- Define `SETTINGS_ID = "00000000-0000-0000-0000-000000000001"` in `src/shared/settings.ts` and export it alongside `SettingsSchema`.
- Both client and server use this constant exclusively; never generate or accept a different id for the settings row.

**Extended Zod schema (`src/shared/settings.ts`)**
- Add six fields to `SettingsSchema`: `heightUnit: z.enum(["cm", "ft"]).default("cm")`, `timezone: z.string().min(1).default("America/Chicago")`, `weekStartsOn: z.enum(["mon", "sun"]).default("mon")`, `showRpe: z.boolean().default(true)`, `showCardio: z.boolean().default(true)`, `theme: z.enum(["system", "light", "dark"]).default("system")`.
- Export a `SettingsUpdateSchema` that omits `id` and `createdAt` and makes all remaining fields optional (`.partial()`), used by the PATCH route body.
- The v1 existing fields `weightUnit` and `distanceUnit` remain unchanged; no migration for these.

**Drizzle migration (new columns on `settings` table)**
- Add columns: `height_unit TEXT NOT NULL DEFAULT 'cm'`, `timezone TEXT NOT NULL DEFAULT 'America/Chicago'`, `week_starts_on TEXT NOT NULL DEFAULT 'mon'`, `show_rpe INTEGER NOT NULL DEFAULT 1`, `show_cardio INTEGER NOT NULL DEFAULT 1`, `theme TEXT NOT NULL DEFAULT 'system'`.
- Boolean columns use `integer` with `{ mode: "boolean" }` per existing Drizzle conventions.
- Update `src/db/schema.ts` `settings` table definition to match; write and apply a new Drizzle migration file.

**Dexie version 6 bump (`src/client/db/forge-db.ts`)**
- Add `version(6)` to `ForgeDB` that repeats all existing store definitions plus adds no new indexes for `settings` (the store declaration `"id"` is unchanged; the new fields are stored without indexing).
- Bump is required even without new indexes so that existing users' IndexedDB schema is recognized by Dexie 6 without an upgrade error.

**Server routes (`src/server/routes/settings.ts` + registration)**
- `GET /api/v1/settings`: query the `settings` table for `SETTINGS_ID`; if absent, insert a defaults row using `SETTINGS_ID` and return it. Response shape: full `SettingsSchema` object. Status 200.
- `PATCH /api/v1/settings`: parse body with `SettingsUpdateSchema`. Fetch existing row by `SETTINGS_ID`; 404 if somehow absent. Apply stale-update check (reject 409 if `incoming.updatedAt < existing.updatedAt`). Merge incoming fields over existing, re-validate merged object with `SettingsSchema`, set `updatedAt = Math.max(merged.updatedAt, Date.now())`, persist, and return the full updated object. No POST, no DELETE.
- Register as `api.route("/settings", settingsRoute)` in `src/server/routes/api.ts`.
- Follow the row↔domain mapper pattern from `src/server/routes/goals.ts` (`rowToSettings`, `settingsToRow`).

**`useSettings` hook and `SettingsContext` (`src/client/hooks/use-settings.ts`, `src/client/contexts/settings-context.tsx`)**
- `useSettings()` uses `liveQuery(() => forgeDB.settings.get(SETTINGS_ID))` to subscribe to Dexie, invalidating a `queryKeys.settings.singleton()` query key on each emission; the `useQuery` `queryFn` reads directly from `forgeDB.settings.get(SETTINGS_ID)`.
- `SettingsContext` is a React context that holds the current `Settings` object (falling back to default field values when undefined). A `SettingsProvider` wraps the app at the root in `src/client/main.tsx`, just inside `QueryClientProvider`.
- Bootstrap: on app startup (in `main.tsx` or a dedicated `useSettingsBootstrap` effect), if `forgeDB.settings` count is 0, fetch `GET /api/v1/settings` and upsert the result into Dexie; if offline and Dexie is empty, upsert a local defaults object keyed by `SETTINGS_ID`.
- Add `settings: { all: ["settings"] as const, singleton: () => ["settings", "singleton"] as const }` to `src/client/db/query-keys.ts`.

**`updateSettings` mutation (`src/client/db/mutations.ts`)**
- `updateSettings(record: Settings): Promise<Settings>` writes to `forgeDB.settings` and enqueues `{ entity: "settings", op: "update", payload: record }` in a single `forgeDB.transaction("rw", forgeDB.settings, forgeDB.pendingWrites, ...)`.
- The flusher already handles `op: "update"` by PATCHing the server; because `entity: "settings"` always targets `PATCH /api/v1/settings` (not `/:id`), the flusher's entity routing must handle the settings case — emit `PATCH /api/v1/settings` with the payload directly (no id in the URL segment for this entity). Coalesce: if multiple `entity: "settings"` entries are queued, the flusher may drop all but the one with the highest `createdAt` before draining.

**`src/client/lib/units.ts` utility (new file)**
- `convertWeight(kg: number, unit: "kg" | "lb"): number` — `kg * 2.20462` when `unit === "lb"`, otherwise `kg`.
- `formatWeight(kg: number, unit: "kg" | "lb"): string` — e.g., `"135 lb"` or `"61.2 kg"`. Rounds to one decimal place, dropping `.0` suffix.
- `convertDistance(m: number, unit: "m" | "km" | "mi"): number` — `m / 1000` for km, `m / 1609.344` for mi, `m` for m.
- `formatDistance(m: number, unit: "m" | "km" | "mi"): string` — e.g., `"3.1 mi"`, `"1.5 km"`, `"400 m"`. Two decimal places for km/mi when non-integer; whole numbers for m.
- Consolidate the existing `convertWeight` in `src/client/goals/progress.ts` to import from this module instead of redefining it.

**Hard-coded unit replacement (display callsites)**
- `src/client/pages/workout/active.tsx` line ~256, ~273: replace `` `${log.weightKg} kg` `` with `formatWeight(log.weightKg, weightUnit)` read from `useContext(SettingsContext)`.
- `src/client/pages/workout/active.tsx` lines ~801–802: populate `enteredWeight` and `enteredWeightUnit` from the active `weightUnit` setting.
- `src/client/pages/workout/active.tsx` line ~914 ("Weight kg" label), ~919/930 (aria-labels): swap to unit-aware label.
- `src/client/pages/workout/active.tsx` line ~1009 (distance display): convert `distanceM` using `formatDistance` with active `distanceUnit`.
- `src/client/pages/workout/session-detail.tsx` line ~29–31 (`formatVolume`/`formatDistance` local functions): remove local functions; import from `units.ts`; pass `weightUnit`/`distanceUnit` from context to `formatWeight`/`formatDistance`.
- `src/client/pages/workout/session-detail.tsx` line ~217: replace `` `${formatVolume(volumeKg)} kg` `` with `formatWeight(volumeKg, weightUnit)`.
- `src/client/pages/workout/session-detail.tsx` lines ~387, ~395: replace `` `${log.weightKg} kg × ${log.reps}` `` with `formatWeight` variant.
- `src/client/pages/history/list.tsx` line ~144: replace `` `${formatVolume(totalVolumeKg)} kg` `` with `formatWeight`.
- All consuming components read `weightUnit` and `distanceUnit` from `useContext(SettingsContext)`, not from a fresh Dexie read.

**Settings page UI (`src/client/pages/settings/index.tsx`)**
- Route `/settings` registered in `src/client/app.tsx` as a child of `AppShell`.
- Nav drawer `NAV_ITEMS` in `src/client/layouts/app-shell.tsx` gains `{ to: "/settings", label: "Settings" }` positioned just above the `ExportButton`.
- Page is a single scrollable column inside the `AppShell` layout. Top bar: hamburger (drawer) + "Settings" title. No action button.
- Every preference control calls `updateSettings({ ...current, <field>: newValue, updatedAt: Date.now() })` on change; no Submit button anywhere.
- Profile card (top section): render static placeholder text for name, DOB, Weight, Height — no editable inputs; no network call. Omit the card entirely if deemed too noisy with placeholder values; the profile section is not functional in v1.
- See Visual Design section for section-by-section layout.

**`showRpe` and `showCardio` logger wiring**
- `src/client/pages/workout/active.tsx` reads `showRpe` and `showCardio` from `SettingsContext`.
- When `showRpe` is false, hide the RPE stepper/field in the inline log editor.
- When `showCardio` is false, hide the duration and distance fields in the inline log editor; the `showDurationDistance` local variable should additionally gate on `settings.showCardio`.

**Theme wiring**
- On settings change to `theme`, call the existing `setTheme(theme)` from `src/client/lib/theme.ts` in addition to persisting to Dexie.
- On `SettingsProvider` mount (and on settings load from Dexie), call `applyTheme(settings.theme)` so the persisted theme is applied from Dexie rather than exclusively from `localStorage`. The existing `initTheme()` in `main.tsx` reads `localStorage`; if a settings row exists in Dexie at mount, its `theme` value takes precedence and overwrites `localStorage`.

## Visual Design

**`planning/visuals/settings.png`**
- Dark background `#0B0B0C`; surfaces `#17181A`; section dividers `#26272A`; amber accent `#F59E0B` for active toggle pill.
- PROFILE section at top: avatar circle placeholder, name bold ("Mike Stelzer"), DOB muted ("Born: May 4, 1988"), compact stats row with "Weight 188" and "Height 5'11"" tiles. Render as static placeholder or omit in v1.
- UNITS & DISPLAY section: section header in small-caps muted text. Three rows — Weight (kg/lb two-tab segmented), Distance (km/mi two-tab), Height (cm/ft two-tab). Active tab has amber filled pill; inactive tab is transparent with muted text. These controls are the pill/chip segmented style matching the type filter chips on the exercise list.
- TIMEZONE & LOCALE section: "Timezone" row shows current IANA value as secondary text right-aligned ("America/Chicago..."); tapping opens a native `<select>` dropdown in v1. "Week starts on" row has Mon/Sun two-tab segmented control.
- FEATURES section: "Show RPE" and "Show cardio" rows each have an iOS-style switch on the right — amber when on, gray when off.
- Theme control: three-tab segmented row labeled "Theme" with SYSTEM / LIGHT / DARK tabs; sits in the UNITS & DISPLAY section or as its own THEME row.
- DATA MANAGEMENT section: "Export workout data" row with a right-chevron icon and three muted secondary lines (Database path, Last workout date, Storage size); tapping calls `triggerExport()` or navigates to an export route.
- DANGER ZONE section (bottom): single row "Reset all data" in destructive red text; rendered but visually disabled (opacity-50, no `onClick`) in v1. No action wired.
- No Save button anywhere on the page; changes commit on control interaction.
- FORGE MKI / RESET footer text at bottom — decorative label, no action.

## Existing Code to Leverage

**`src/server/routes/goals.ts` — Hono singleton route pattern**
- The row↔domain mapper pair (`rowToGoal`/`goalToRow`), `idConflict`/`notFound`/`validationError`/`staleUpdate` error helpers, and the PATCH merge-then-revalidate loop are the exact pattern to replicate for `settingsRoute`. Settings is simpler: no POST, no DELETE, no list route; the GET auto-seeds instead of returning 404.

**`src/client/hooks/use-goals.ts` — Dexie liveQuery + TanStack Query pattern**
- The `liveQuery(() => forgeDB.goals.count()).subscribe({ next: () => qc.invalidateQueries(...) })` pattern with `useEffect` cleanup is the direct template for `useSettings()`, substituting `forgeDB.settings.get(SETTINGS_ID)` as the live query expression and `queryKeys.settings.singleton()` as the invalidation target.

**`src/client/layouts/app-shell.tsx` — `NAV_ITEMS` array and drawer structure**
- Append `{ to: "/settings", label: "Settings" }` to `NAV_ITEMS` before the `ExportButton` in the `Drawer` component. The existing `NavLink` render loop handles it with no other changes.

**`src/client/lib/theme.ts` — theme application**
- `setTheme(theme)` writes to `localStorage` and calls `applyTheme(theme)` which sets `data-theme` on `document.documentElement`. Reuse `setTheme` directly from the settings page toggle; no new theme infrastructure needed.

**`src/client/goals/progress.ts` — `convertWeight` function**
- Lines 40–43 define `convertWeight(kg, unit)`. Move this implementation into `src/client/lib/units.ts` and replace the definition in `progress.ts` with a re-export: `export { convertWeight } from "../lib/units"`.

## Out of Scope

- Editable profile fields (name, DOB, body weight, body height) — no schema columns exist in v1.
- "Reset all data" / danger zone action — rendered disabled only.
- Timezone behavioral effect on history date grouping — field stored and synced, impact deferred.
- Week start day behavioral effect on program calendar — field stored and synced, impact deferred.
- Per-exercise unit overrides.
- Notification or reminder settings.
- Automatic timezone detection overriding the stored value.
- Multiple settings rows or per-device overrides.
- Server-side or SSR theme rendering.
- A searchable timezone picker — native `<select>` is sufficient for v1.
- Bodyweight / height time-series tracking.
- `routineExercises` registry stub cleanup — flag it as a separate task; do not resolve it here.
