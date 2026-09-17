# 0005 — Offline strategy

**Status:** accepted · **Date:** 2026-04-23

## Context

Gyms frequently have poor connectivity (basements, thick walls, spotty wifi). The logger must work without a network — starting a workout, logging sets, finishing, viewing prior history — and reconcile when connectivity returns.

## Decision

Offline-first architecture. Dexie (IndexedDB) is the client's primary read/write store. Writes append to an outbox that flushes to `/api/v1` opportunistically. The server is the canonical store for multi-device scenarios later, but in v1 it's essentially a sync backup.

## Specifics

- **App shell** is cached by the service worker (vite-plugin-pwa + Workbox `generateSW` preset)
- **Reads** always come from Dexie. Background queries revalidate from server when online.
- **Writes** (log set, finish workout, edit routine) go to Dexie immediately and append an entry to an `outbox` table
- **Outbox flush** runs on network regain, app focus, and a periodic interval. Each entry has a monotonic sequence number and a retry count.
- **Conflict model**: in v1, client wins — single user, single device at a time. When we add multi-device, move to last-write-wins with server timestamps, with workout sessions being immutable once finished (so the conflict surface is small).
- **Service worker update flow**: new SW takes control on next navigation, no forced reload; a small "new version available" pill lets the user reload when convenient.

## Rationale

- Writing to IndexedDB first means sub-100ms perceived latency regardless of network
- An explicit outbox makes sync state inspectable and debuggable — not hidden inside a library
- Workout history is the most write-heavy surface and also the most tolerant of eventual consistency, which maps well to offline-first
- Immutable history (PRD requirement) eliminates most merge scenarios

## Consequences

- Two sources of truth (Dexie + SQLite) — need discipline on schemas matching
- Seed data (exercise library) must be shippable to Dexie on first load — bundle as static JSON and hydrate on app init
- Need a visible sync indicator for power users (probably in settings / debug, not main nav)
- Multi-device support is deferred — don't design out of our way for it in v1
