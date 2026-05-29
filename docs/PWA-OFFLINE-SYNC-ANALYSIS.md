# PWA, Offline IndexedDB, and Sync — Architectural Analysis

_Last reviewed: 2026-05-29 against commit `35db7f2`._

Forge is an offline-first workout-tracking PWA. The local IndexedDB store is the source of truth for the user's UX (instant writes, no spinners); the server is a long-term backup and multi-device replica. This document maps the three intertwined layers — the **PWA shell**, the **offline IndexedDB store**, and the **sync engine** — describes what's in place, calls out strengths and gaps, and proposes a prioritized list of follow-ups.

---

## 1. PWA Shell

### What's in place
- **Plugin**: `vite-plugin-pwa@0.21.2` with Workbox, configured in `vite.config.ts:21-44`.
- **Manifest**: standalone, portrait, dark theme (`#0B0B0C`), 192/512 + maskable icons. Declared inline in `vite.config.ts`; generated to `dist/client/manifest.webmanifest`.
- **Precaching**: `globPatterns: ["**/*.{js,css,html,svg,png,woff2}"]`, plus `navigateFallback: "/index.html"` for SPA routing offline.
- **iOS support**: full set of `apple-*` meta tags + `viewport-fit=cover` in `src/client/index.html:5-12`; `apple-touch-icon.png` shipped.
- **Update model**: `registerType: "prompt"`; SW listens for `SKIP_WAITING` postMessage.

### Gaps
1. **No update UI consumer.** `registerType: "prompt"` produces a hook (`onNeedRefresh`), but no client code subscribes — users won't see a "new version available" banner; they need a hard reload to get updates.
2. **No `beforeinstallprompt` handling.** Android install relies on the silent browser default; no in-app A2HS CTA.
3. **No runtime caching rules for `/api/*`.** API requests bypass the SW entirely. That's reasonable given the IndexedDB-first model, but it means the SW provides zero value for sync resilience; all offline behavior depends on the Dexie layer.
4. **No advanced PWA APIs**: no Push, no Background Sync, no Periodic Background Sync. The sync engine reimplements parts of this with polling + visibility events (see §3).
5. **No `navigator.storage.persist()` request.** Without it, IndexedDB can be evicted under storage pressure (Safari is especially aggressive).
6. **No manifest `shortcuts` or `share_target`.** Low-hanging UX wins for an installed PWA (e.g. quick action: "Start today's workout").

---

## 2. Offline IndexedDB Store

### What's in place
- **Library**: Dexie 4.0.11 + `dexie-react-hooks` 1.1.7. Single DB defined in `src/client/db/forge-db.ts` with **9 schema versions** (additive only).
- **Entity coverage** (all stored offline): exercises, equipment, routines, programs, programDays, programRuns, programRunDayStates, sessions, sessionSetLogs, goals, settings, profiles, weightLogs — plus the `pendingWrites` outbox and a `meta` k/v table.
- **Indexes**: well-chosen compound indexes for hot paths, notably `[exerciseId+loggedAt]` on session logs and `[sessionId+performedExerciseId+order]`.
- **Reads**: components subscribe via Dexie `liveQuery` / `useLiveQuery` through hooks in `src/client/hooks/use-*`. Reactive by default; no manual cache invalidation.
- **Writes** (`src/client/db/mutations.ts`): every mutation runs in a single `transaction("rw", entityTable, pendingWrites)` that updates the entity *and* enqueues a pending-write atomically — no torn state possible.
- **Batch writes**: `logSetBatch()` collapses the set-logging hot path into one transaction (set log + session update + pending writes), keeping the lifting screen responsive.
- **IDs**: client-generated UUIDv4 (`src/client/lib/uuid.ts`) — server never reassigns, so offline-created rows are stable across sync.
- **Bootstrap**: `src/client/seed/hydrate.ts` bulk-loads exercises/equipment from JSON on first run **and enqueues "create" pending writes** so a fresh device populates the server when it comes online.
- **Domain invariants enforced client-side**: `SessionFinishedError`, `ProgramRunClosedError` block mutations on terminal-state entities (`src/client/db/mutations.ts:7-16`).

### Gaps & risks
1. **No real migrations.** Schema bumps are pure adds (`.stores()` only); there's no `.upgrade()` logic. The day a field needs to be renamed or denormalized, the pattern has to be established under pressure.
2. **No `navigator.storage.persist()`** — paired with PWA gap #5 above, this means a user could lose months of offline data under storage pressure with no warning.
3. **No quota monitoring or UI.** If the DB ever hits the browser quota, writes silently fail; nothing surfaces it.
4. **No tombstones / soft-deletes.** A physical delete plus the merge-only reconciler (§3) means: if the server later rolls back a deleted row, the client won't re-acquire it. Probably fine for a single-user app, worth knowing.
5. **Unbounded growth of finished sessions / set logs.** No archival or rollup. After a year of heavy use this can be tens of thousands of rows; queries remain index-fast, but storage footprint grows.
6. **No cascade on the client.** Deleting a routine doesn't clean up references in historical sessions (server cascades). Mostly harmless because sessions snapshot exercise data, but worth confirming.

---

## 3. Sync Engine

### Architecture
- **Outbox**: `src/shared/pending-write.ts` defines a Zod-validated record `{id, entity, op, payload, createdAt, retries, lastError, lastAttemptAt}`.
- **Flusher** (`src/client/sync/flusher.ts`): drains the queue FIFO, one fetch per entry, per-entity REST endpoints. Treats 200/201/204 + 409 (id conflict) + 404 (update/delete missing) as success. Stops on first failure to preserve order. Backoff schedule `[1s, 2s, 4s, 8s, 16s, 32s, 60s]`, capped at 60s.
- **Triggers** (`src/client/sync/triggers.ts`): Dexie `pendingWrites.creating` hook fires a microtask flush on every mutation; plus `online`, `focus`, `visibilitychange→visible` events; plus 30s polling.
- **Coalescing**: settings and profile writes are deduped to keep only the newest by `createdAt` — important because those tables get spammed by UI toggles.
- **Pull / reconciler** (`src/client/sync/reconcile.ts`, every 5 min + on load): `fetchSafe()` GETs each entity collection independently — failure on one entity doesn't abort the others. Server rows are `put()` locally **only if no pending write blocks that id** (pending-wins). Server deletes are **ignored** (the "merge-only" property from commit `35db7f2`).
- **Domain reconciler** (`src/client/sync/program-run-reconciler.ts`): joins finished sessions back to program day-states, auto-completes runs when all non-rest days are resolved, nulls orphaned `sessionId`s.
- **Bootstrap snapshot**: `GET /api/v1/export` returns a single-transaction JSON envelope across all entities (now including profiles + weightLogs).
- **UX**: `FlusherTroubleBanner` shows after >3 retries with a "Retry now" CTA; `OfflinePill` reads `navigator.onLine`.

### Strengths
- The **pending-wins + merge-only** policy is the right call for a single-user offline-first app — it guarantees no local data loss from a stale server response, which is a common bug class in naive sync.
- Atomic transactions for mutation+outbox eliminate the classic "wrote locally but never enqueued" failure mode.
- Idempotent server semantics (409/404 treated as success) make retries safe.
- Per-entity isolation in the reconciler keeps a single broken endpoint from blocking sync of everything else.

### Gaps & risks
1. **No max retries / dead-letter.** A permanently broken payload (e.g. server rejects with 400 for schema mismatch) will retry forever. The banner surfaces it after 3 attempts but offers no "discard" path.
2. **400-class errors are not differentiated from 5xx.** A 400 is permanently broken; a 5xx is transient. Treating both the same wastes battery and clutters logs.
3. **No idempotency keys.** Idempotency is "best effort by (entity, id, op)". A partial-update retry that already succeeded on the server but failed to ack could re-apply stale fields. Low risk because most payloads carry full state, but worth tightening.
4. **401 is treated as a client error and the entry is dropped.** If `FORGE_TOKEN` is rotated, queued writes are lost — no re-auth flow, no "needs re-login" UX.
5. **No batch endpoint.** One fetch per pending write means N round-trips on a slow link after coming back online. A batched `POST /api/v1/sync` would reduce latency and let the server commit transactionally.
6. **Sync status is opaque.** No "last synced", no "X writes queued", no per-entity breakdown — only the trouble banner. Power users (and you, debugging) would benefit from a status sheet.
7. **No clock skew handling.** `updatedAt` comparisons (`stale_update` check in settings) trust client time. Not a hot bug, but if a user's clock is wrong, mysterious 409s.
8. **Reconcile interval is fixed at 5 min.** Could be smarter (skip if recently flushed; backoff on repeated failures).
9. **No catchup of *which* server rows changed.** Reconcile re-fetches whole entity collections every cycle. Fine while data is small; will get expensive as users accumulate history. A `?since=<updatedAt>` parameter would help.
10. **No structured logging / metrics.** All observability is `console.warn`. For a real bug report from a user, you have nothing.

---

## Cross-Cutting Themes

- **The service worker is doing the bare minimum** (precache + SPA fallback). All the *real* offline intelligence lives in IndexedDB + the sync engine. That's an intentional and reasonable choice, but it means there's no resilience for things the SW would normally help with — e.g. caching the last-good `/api/v1/export` response, retrying failed flushes via the Background Sync API.
- **Pending-wins reconciler is the keystone invariant.** Anything that breaks it (e.g. a future multi-device editing or live-collaboration feature) will require revisiting both the outbox and the reconciler together.
- **No version negotiation between client and server.** A deployed schema change on the server can break older offline clients silently. Worth at least surfacing `X-App-Version` mismatches in the trouble banner.

---

## Recommendations (Prioritized)

### Tier 1 — Low effort, high value
1. **Wire the update prompt UI** (`vite-plugin-pwa`'s `useRegisterSW` → toast with "Reload to update"). Users currently miss bugfixes until manual refresh.
2. **Call `navigator.storage.persist()` on first successful login.** One line; prevents catastrophic data loss on Safari/iOS.
3. **Distinguish 4xx from 5xx in the flusher.** On 400/422, mark the entry as poisoned (don't retry forever); surface in the trouble banner with a "discard" action.
4. **Add a Sync Status sheet** (last sync, queued count by entity, recent errors). Mostly UI over data already in the DB.

### Tier 2 — Medium effort, infrastructure investments
5. **Batched sync endpoint** (`POST /api/v1/sync` accepting an array of pending writes, server commits transactionally). Big latency win after offline windows.
6. **Incremental reconcile** with `?since=<updatedAt>`. Avoids re-downloading full collections.
7. **Tombstones for deletes.** Replace physical deletes with a `deletedAt` field; reconcile can then trust server delete signals safely.
8. **App-version handshake** (`X-App-Version` request header, server returns expected min version). Surface mismatches in UI.

### Tier 3 — Larger or speculative
9. **Background Sync API** as a fallback trigger for the flusher when the app is closed.
10. **Real Dexie migrations** (`.upgrade()`) — establish the pattern before it's needed under pressure.
11. **Structured client logging** sent server-side on trouble-banner events, for support.
12. **Archival strategy** for old finished sessions (cold IndexedDB store, or server-only after N months).

---

## File Reference

- PWA config: `vite.config.ts:21-44`
- iOS meta tags: `src/client/index.html:5-12`
- Dexie schema (9 versions): `src/client/db/forge-db.ts:30-142`
- Mutations + outbox enqueue: `src/client/db/mutations.ts`
- Reactive read hooks: `src/client/hooks/use-*`, `src/client/db/queries.ts`
- Outbox schema: `src/shared/pending-write.ts:9-19`
- Flusher: `src/client/sync/flusher.ts`
- Triggers: `src/client/sync/triggers.ts`
- Pull reconciler (merge-only): `src/client/sync/reconcile.ts`
- Program-run reconciler: `src/client/sync/program-run-reconciler.ts`
- Bootstrap snapshot endpoint: `src/server/routes/export.ts`
- Export registry: `src/shared/export/registry.ts`
- Initial hydration: `src/client/seed/hydrate.ts`
- Trouble banner UI: `src/client/sync/flusher-banner.tsx`
- Auth middleware: `src/server/auth.ts`
