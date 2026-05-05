# Task Breakdown: Export & API Surface

## Status (last updated 2026-05-04)

**Not started.** Greenfield: one new shared schema module (`src/shared/export.ts` + `src/shared/export/registry.ts`), one new Hono route (`src/server/routes/export.ts`), one client trigger module (`src/client/export/trigger.ts`), and a single nav-footer entry. No new tables, no new Dexie stores, no new outbox entities, no migrations.

Status legend: `[x]` done, `[~]` partial, `[ ]` not started.

### Phase status

- [ ] Phase 1 — Shared envelope schema + registry
- [ ] Phase 2 — Server `/api/v1/export` route
- [ ] Phase 3 — Client trigger + Dexie fallback
- [ ] Phase 4 — Sidebar / drawer footer entry
- [ ] Phase 5 — Public-docs cleanup (`WORKOUT_DASH_API_TOKEN` removal)
- [ ] Phase 6 — Manual verification

---

## Overview

The work is small and concentrated: a versioned envelope, a registry-driven exporter on both server and client, one nav entry, and one docs sweep. Cross-spec coupling is read-only via Zod schemas already exported by sibling slices.

Total tasks: ~22 across 6 phases.

Authoritative spec: `/home/mike/Development/Forge/specs/export/planning/spec.md`.

---

## Phase 1: Shared envelope schema + registry

### 1.1 [ ] Define `ExportEnvelopeSchema` in `src/shared/export.ts`
- Match spec Data Model exactly: `schemaVersion: 1` literal, `exportedAt`, `source`, `appVersion`, `entities`, optional `_warnings`.
- Optional keys: `entities.routineExercises`, `entities.settings` (use `.optional()`).
- Export derived `ExportEnvelope` type.

### 1.2 [ ] Define `EXPORT_REGISTRY` in `src/shared/export/registry.ts`
- One entry per table per spec; Drizzle table reference + Dexie store name + Zod schema.
- `optional: true` on `routineExercises` and `settings`; `singleton: true` on `settings`.
- Export `ExportEntityKey` union type.

### 1.3 [ ] Wire `appVersion` plumbing
- Read `version` from `package.json` at boot (server: import; client: vite define).
- Export a single `APP_VERSION` constant from `src/shared/version.ts` so both sides emit the same value.

---

## Phase 2: Server route

### 2.1 [ ] Scaffold `src/server/routes/export.ts`
- New Hono sub-router; mount under `/api/v1/export` from `src/server/routes/api.ts`.
- Method allowlist: `GET` only; everything else returns `405`.

### 2.2 [ ] Implement registry-driven dump in a single read transaction
- Wrap all reads in `db.transaction((tx) => ...)`.
- For each registry entry: `tx.select().from(entry.drizzleTable)`; for `singleton: true`, `tx.select().from(entry.drizzleTable).limit(1)`.
- Skip `optional: true` entries when the table has no rows AND the key is opt-in (settings: skip if singleton row absent; routineExercises: emit `[]` if the table exists but is empty — only skip if the table itself is missing).

### 2.3 [ ] Per-row Zod validation with `_warnings`
- Each row passed through its registry schema; failures dropped and a string appended to `_warnings`.
- Final envelope validated against `ExportEnvelopeSchema` before serialization.

### 2.4 [ ] Response wiring
- Pretty-print with 2-space indent.
- `Content-Disposition: attachment; filename="forge-export-YYYY-MM-DD.json"` (server local date).
- `Content-Type: application/json`.
- 500 on transaction or assembly failure with `{ error: 'export_failed', detail }`.

### 2.5 [ ] Smoke-test with curl
- `curl -O http://localhost:8080/api/v1/export` saves the file with the correct name; envelope parses; counts roughly match what the user expects.

---

## Phase 3: Client trigger + Dexie fallback

### 3.1 [ ] Implement `triggerExport()` in `src/client/export/trigger.ts`
- Online: `fetch('/api/v1/export')`, read as `Blob`, derive filename from `Content-Disposition` (or fallback), `<a>.click()`, revoke URL.
- Offline / non-200 / fetch throw: fall back to client path.
- No retry of the server path during the same tap.

### 3.2 [ ] Implement client-side Dexie dump
- Iterate `EXPORT_REGISTRY`; for each entry, read the matching Dexie store (`db[entry.dexieStore].toArray()` or `.limit(1).first()` for singleton).
- Skip `optional` entries when the store is missing in `db.tables`.
- Per-row Zod validation with the same `_warnings` shape; assemble envelope with `source: 'client'`, `appVersion = APP_VERSION`, `exportedAt = Date.now()`.
- Pretty-print; trigger blob download with the same filename rule.

### 3.3 [ ] Total-failure path
- Catch any thrown error from both branches; surface a toast `Export failed — try again` with `error.message`.

---

## Phase 4: Sidebar / drawer footer entry

### 4.1 [ ] Add `Export JSON` item to desktop sidebar footer
- New nav-item below all sections; hairline `#26272A` divider above; `download` lucide glyph; on click → `triggerExport()`.

### 4.2 [ ] Add identical entry to mobile drawer footer
- Same component / shape; bottom of the slide-out drawer.

### 4.3 [ ] Style + a11y
- Inherits existing nav-item typography and dark-mode tokens.
- `<button type="button">` with accessible `aria-label="Export JSON"`; keyboard reachable; focus ring per existing nav primitive.

---

## Phase 5: Public-docs cleanup (`WORKOUT_DASH_API_TOKEN`)

### 5.1 [ ] Repo-wide grep for `WORKOUT_DASH_API_TOKEN`
- `rg -n WORKOUT_DASH_API_TOKEN docs/ src/ README.md package.json` — catalog every occurrence.

### 5.2 [ ] Remove from public-facing docs
- Strip references from `docs/PRD.md`, `docs/PRODUCT-PLAN.md`, `README.md`, and any `docs/decisions/*` entries that aren't load-bearing for archival context.

### 5.3 [ ] Decide code-side disposition
- If the variable is wired up in code, replace its check with a no-op + comment pointing to deferred auth work, OR delete outright if no code path remains.
- Document the decision in a one-line entry under `docs/decisions/` (new ADR) so the deferred work is discoverable.

### 5.4 [ ] Mark the PRODUCT-PLAN line resolved
- Strike through / remove `docs/PRODUCT-PLAN.md` line 239 ("remove "writes respect WORKOUT_DASH_API_TOKEN when configured" from public-facing docs / API docs plan") with a note pointing to this slice's commit.

---

## Phase 6: Manual verification

### 6.1 [ ] Online happy path
- Click footer link → file downloads with correct name → envelope opens, schema parses, every expected entity key present, counts match.

### 6.2 [ ] Offline fallback
- Toggle network off → click footer link → file downloads with `source: 'client'`; pending outbox entries are reflected in the entity arrays.

### 6.3 [ ] Empty install
- Wipe Dexie / reset SQLite to empty → click → download succeeds with all `[]` arrays and no `_warnings`.

### 6.4 [ ] Validation warnings
- Manually corrupt one row in SQLite (`UPDATE goals SET title='' WHERE rowid=1`) → re-export → envelope contains `_warnings: ["goals[i]: title required"]` and that row is excluded from `entities.goals`.

### 6.5 [ ] Total failure UX
- Stop the server while offline mode is also disabled → click → toast `Export failed — try again`; no file written.

### 6.6 [ ] Docs cleanup verification
- `rg WORKOUT_DASH_API_TOKEN` returns zero hits in public docs (any remaining hits live only in code with a deferred-auth comment, or in a single ADR documenting the decision).

---

## Notes / pickup hints

- The registry is the single point of churn for future entities; resist scattering knowledge of "which tables are user-owned" anywhere else.
- `pending_writes` is intentionally absent from the export — it is in-flight outbox state, not user-owned data.
- Pretty-printing is deliberate in v1; revisit only if real user data inflates exports beyond a few MB.
- Server's `appVersion` and client's `appVersion` must agree on shape (string from `package.json`); mismatches indicate a build pipeline bug, not a versioning gap.
- Settings inclusion is conditional on the settings spec landing; the registry's `optional: true` flag handles this without a code change here.
- Do NOT add an import endpoint, even as a stub — out of scope, and a stub creates a contract surface we'd then need to maintain.
