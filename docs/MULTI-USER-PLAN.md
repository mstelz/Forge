# Multi-User Plan

_Status: future · Last updated: 2026-06-01_

This document describes the design and implementation roadmap for making Forge an optional multi-user experience — supporting households, friend groups, and challenges while keeping the single-user default completely unchanged.

---

## Goals

- Self-hosted households can share a single Forge instance with isolated per-user data.
- Friend groups can see each other's activity and run challenges together.
- Single-user mode works exactly as today — no login screen, no forced auth, no migration pain.
- The feature is opt-in: the owner enables it from Settings.

## Non-goals

- SaaS / cloud hosting — still one self-hosted instance per deployment.
- Real-time collaboration or shared live sessions.
- Coaching marketplace or public sharing.
- Wearable integrations or push notifications (separate concerns).

---

## How Opt-In Works

Multi-user is activated by a `FORGE_MULTI_USER=true` environment variable **or** a toggle in the owner's Settings UI. When inactive:

- No login screen, no change to any existing workflow.
- All data is still owned by a hidden "owner" user behind the scenes (invisible to the current user).

When activated:

- JWT-based login is required for all `/api/v1/*` routes.
- The owner can create and invite additional users.
- Each user has fully isolated data: workouts, programs, goals, profile, and settings.
- Group and challenge features become available.

---

## Phase 1 — User Accounts

This is the largest chunk. Everything else builds on it.

### 1a. Schema: users table + userId columns

Add a `users` table as the new identity anchor:

```
users
  id           TEXT  PRIMARY KEY
  username     TEXT  NOT NULL UNIQUE
  display_name TEXT  NOT NULL
  password_hash TEXT            -- null = owner in no-auth single-user mode
  role         TEXT  NOT NULL   -- 'owner' | 'member'
  created_at   INTEGER NOT NULL
  updated_at   INTEGER NOT NULL
```

Add `user_id TEXT REFERENCES users(id)` to every existing data table:

| Table | Notes |
|---|---|
| `routines` | private to user |
| `programs` | private to user |
| `sessions` | private to user |
| `session_set_logs` | private to user |
| `exercises` | `user_id = NULL` → global/system exercise shared by all |
| `goals` | private to user |
| `profiles` | private to user |
| `weight_logs` | private to user |
| `settings` | singleton becomes per-user row |

**Migration on first boot after upgrade:** create a default `owner` user and back-fill all existing rows with that `user_id`. No data loss.

Critical files: `src/db/schema.ts`, `src/db/migrations/`

### 1b. Auth layer

- Password hashing: native `crypto.subtle` PBKDF2 (no new deps) or `bcryptjs`.
- Tokens: long-lived JWT stored in an `httpOnly` cookie (appropriate for household / LAN use; swap for access+refresh if internet-exposed).
- PIN accounts: owner can create password-less members identified by a short PIN for low-friction household onboarding.

New endpoints:

```
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Update `src/server/auth.ts`:

1. Check if multi-user mode is active (env var or DB `settings` row).
2. If yes: validate JWT from cookie, attach `userId` to request context.
3. If no: attach the default owner `userId` automatically — no login required, app behaves as today.

All 13 existing route handlers in `src/server/routes/` gain a `userId` from context and scope every query to that user.

### 1c. Client auth

- `UserContext` provider wrapping the app — exposes `currentUser`, `logout()`.
- Login page shown only when multi-user is enabled AND the user is not authenticated.
- Dexie (IndexedDB) partitioned per user: separate database named `forge-{userId}`. On logout, the partition is cleared and the user is redirected to login.
- On user switch: sync down the new user's data from the server.

### 1d. User management UI (owner only)

A "Users & Access" section in Settings, hidden in single-user mode.

Owner capabilities:
- Add a new user (display name + password or PIN).
- Generate a single-use invite link (no email sending — share it yourself).
- Change a user's role or reset their password.
- Remove a user (with a confirmation warning that deletes their data).

---

## Phase 2 — Groups

After Phase 1, users exist but are siloed. Groups connect them.

### Schema

```
groups
  id           TEXT  PRIMARY KEY
  name         TEXT  NOT NULL
  description  TEXT
  invite_code  TEXT  NOT NULL UNIQUE
  created_by   TEXT  REFERENCES users(id)
  created_at   INTEGER NOT NULL

group_members
  id           TEXT  PRIMARY KEY
  group_id     TEXT  REFERENCES groups(id) ON DELETE CASCADE
  user_id      TEXT  REFERENCES users(id)  ON DELETE CASCADE
  role         TEXT  NOT NULL  -- 'admin' | 'member'
  joined_at    INTEGER NOT NULL
```

### Features

- Any user can create a group and invite others via a shareable code or link.
- Group detail page: member roster + recent activity feed.
- Activity feed entries: member name, workout name, date, set/rep summary. Private weights are hidden unless the member opts in to sharing.
- Exercise and routine sharing within a group: **copy-on-use** (not live collaboration) — this preserves the principle that templates are personal.

---

## Phase 3 — Challenges (deferred, architecture sketch)

Do not build yet. Design the schema now so Phase 2 tables don't need retrofitting.

### Schema

```
challenges
  id           TEXT  PRIMARY KEY
  group_id     TEXT  REFERENCES groups(id)
  name         TEXT  NOT NULL
  type         TEXT  NOT NULL  -- see types below
  start_date   TEXT  NOT NULL
  end_date     TEXT  NOT NULL
  created_by   TEXT  REFERENCES users(id)
  status       TEXT  NOT NULL  -- 'active' | 'completed' | 'cancelled'
  created_at   INTEGER NOT NULL

challenge_participants
  id            TEXT  PRIMARY KEY
  challenge_id  TEXT  REFERENCES challenges(id)
  user_id       TEXT  REFERENCES users(id)
  joined_at     INTEGER NOT NULL
```

### Challenge types

| Type | Description |
|---|---|
| `consistency` | Most workouts logged or longest streak in the window |
| `volume` | Most total weight lifted (optionally normalised by bodyweight) |
| `pr_improvement` | Biggest % gain on a specified exercise |
| `custom` | Freeform description; winner declared manually by group admin |

Leaderboards are computed on-demand server-side from existing `sessions` and `session_set_logs` data — no denormalised score tables needed initially.

---

## Open Decisions

These need to be resolved before implementation starts:

| Decision | Options | Recommendation |
|---|---|---|
| Token lifetime | Long-lived JWT vs access+refresh pair | Long-lived for LAN/household; revisit if internet-exposed |
| Exercise visibility | Private vs group-shared vs global | User-created = private by default; can be shared to a group |
| Routine/program sharing in groups | Copy-on-use vs live collab | Copy-on-use — keeps templates personal |
| Dexie partitioning | Prefix on store keys vs separate DB per user | Separate DB (`forge-{userId}`) — cleaner, no cross-user leakage |

---

## Implementation Order

```
1.  Schema migration (users table, userId FK columns, owner back-fill)
2.  Auth middleware update (multi-user flag + JWT validation + owner auto-attach)
3.  Scope all 13 API route handlers by userId from context
4.  Login page + UserContext on client
5.  Dexie partitioned by userId
6.  User management UI in Settings (owner only)
7.  Multi-user toggle in Settings UI
8.  Groups schema + invite flow + activity feed
9.  [FUTURE] Challenges
```

---

## Relationship to Existing Decisions

- **ADR 0006** (auth deferred): This plan is the Phase 2 auth story that 0006 explicitly deferred. The `src/server/auth.ts` stub is the extension point.
- **PRD non-goals**: "Social feed, comments, likes" remain non-goals. This plan adds lightweight activity summaries, not a social network.
- **Pending writes / offline sync**: In single-user mode the offline-first Dexie architecture is unchanged. In multi-user mode the server becomes the source of truth; the offline sync story for multi-user needs a separate design pass before Phase 1 ships.
