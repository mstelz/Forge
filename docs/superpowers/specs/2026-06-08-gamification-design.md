# Gamification — Phase 1: Milestones & Badges

## Overview

Add an optional badge/milestone system to Forge that rewards training effort quietly and contextually. The design principle is **pride + momentum**: acknowledge what the user has already done, create gentle pull toward the next session, never interrupt the core logging flow.

Phase 1 covers badges only. Challenges (auto-rotating weekly/monthly targets) are deferred to Phase 2.

---

## Toggle

Gamification is **opt-out by default** (enabled for all users). A single toggle in Settings — "Achievements & Badges" — disables all gamification surfaces when turned off: the Achievements page redirects to home, the post-workout modal never fires, the home page nudge disappears.

Badge earning is computed regardless of the toggle so that retroactively turning it back on shows the full earned history rather than a blank slate.

---

## Badge Catalog (~22 badges)

Badges are defined in a static catalog in code. The database only stores earned timestamps.

### Consistency
| Badge | Criteria |
|-------|----------|
| First Rep | Log first ever finished session |
| 10 Sessions | 10 finished sessions lifetime |
| 50 Sessions | 50 finished sessions lifetime |
| 100 Sessions | 100 finished sessions lifetime |
| 250 Sessions | 250 finished sessions lifetime |
| 3 Week Streak | 3 consecutive weeks with ≥1 session |
| 5 Week Streak | 5 consecutive weeks with ≥1 session |
| 10 Week Streak | 10 consecutive weeks with ≥1 session |
| Early Bird | Start a session before 06:00 local time |

### Strength
| Badge | Criteria |
|-------|----------|
| First PR | Beat previous best weight on any exercise |
| 5 PRs | Set a PR on 5 distinct exercises (ever) |
| 10 PRs | Set a PR on 10 distinct exercises (ever) |
| 25 PRs | Set a PR on 25 distinct exercises (ever) |
| Century Club | Log a set at ≥100 kg (respects user's weight unit setting: ≥225 lb if set to lb) |
| Night Owl | Finish a session after 22:00 local time |

### Volume
| Badge | Criteria |
|-------|----------|
| Big Session | 10,000 kg total volume in a single session |
| 100k Club | 100,000 kg cumulative lifetime volume |
| 500k Club | 500,000 kg cumulative lifetime volume |
| 1M Club | 1,000,000 kg cumulative lifetime volume |

### Variety
| Badge | Criteria |
|-------|----------|
| 10 Exercises | Perform 10 distinct exercises (logged sets) |
| 25 Exercises | Perform 25 distinct exercises |
| 50 Exercises | Perform 50 distinct exercises |
| Full Body | Train all 5 major muscle groups (chest, back, legs, shoulders, core) |

### Programs
| Badge | Criteria |
|-------|----------|
| Committed | Complete 1 program run |
| Veteran | Complete 3 program runs |

---

## PR Definition

A PR is a set where `weightKg > the user's previous best weightKg` for that exercise across all prior logged sets. Simple max-weight comparison, not Epley 1RM — avoids false positives from high-rep light sets.

---

## Post-Workout Modal

When a session is finished and one or more badges were earned, a modal appears automatically over the post-workout screen. It shows:
- Badge icon (large)
- "Badge Unlocked" label
- Badge name and description
- "Nice!" dismiss button

If multiple badges were earned in one session, they queue and show sequentially. The modal does not appear if no badges were earned.

---

## Achievements Page (`/achievements`)

A dedicated page accessible from the main nav drawer, positioned between Goals and History.

Layout: **detailed list** grouped by category. Each badge row shows:
- Icon + name + description
- **Earned**: amber left border + earned date (e.g. "Mar 2")
- **Unearned**: dimmed + progress bar with current/target value (e.g. "23 / 50 sessions")

Series badges (e.g. 10/50/100/250 Sessions) display as a group with the next unearned one showing progress. Already-passed tiers are shown as earned; future tiers remain dimmed.

Page header shows total earned count ("12 / 22 earned") with a progress bar.

If `gamificationEnabled` is false, navigating to `/achievements` redirects to `/`.

---

## Home Page Nudge

A single line below the weekly stats strip on the home page showing the badge the user is closest to earning:

> *"2 weeks toward 3 Week Streak →"*

Tappable — links to the Achievements page. Hidden if `gamificationEnabled` is false or if no badge is in progress.

---

## Data Model

### New DB tables

**`earned_badges`**
```
id          text PK
badge_id    text NOT NULL (unique — one row per badge ever, no duplicates)
earned_at   integer NOT NULL (unix ms)
updated_at  integer NOT NULL
```

### Settings addition
`gamification_enabled boolean DEFAULT true` added to the singleton `settings` table.

---

## Reconciliation

Badge detection runs as a post-session hook, mirroring the existing `reconcileGoals` pattern in `src/client/goals/reconcile.ts`.

```
reconcileBadges(sessionId) → EarnedBadge[]  // returns newly earned only
```

Algorithm:
1. Load earned badge IDs from `earnedBadges` table → Set (idempotency guard)
2. Load all sessions, set logs, program runs in one pass
3. For each unearned badge, run its `check(ctx)` function
4. Write newly earned badges to `earnedBadges` + `pendingWrites` outbox in one transaction
5. Return newly earned array to caller (for modal)

Called from the three `finishSession` sites in `src/client/pages/workout/active.tsx` (lines ~2073, ~2104, ~2300), after the existing `reconcileGoals` call.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `src/shared/settings.ts` | Add `gamificationEnabled: z.boolean().default(true)` |
| `src/shared/gamification.ts` | New — `EarnedBadge` type |
| `src/db/schema.ts` | Add `earnedBadges` table + settings column |
| `src/db/migrations/0013_gamification.sql` | New migration |
| `src/client/db/forge-db.ts` | Dexie version 13 with `earnedBadges` table |
| `src/client/gamification/badges.ts` | New — static badge catalog + check functions |
| `src/client/gamification/pr-detector.ts` | New — max-weight PR detection |
| `src/client/gamification/reconcile.ts` | New — badge reconciler |
| `src/client/gamification/badge-modal.tsx` | New — post-workout earned badge modal |
| `src/client/hooks/use-earned-badges.ts` | New — liveQuery on earnedBadges |
| `src/client/hooks/use-achievements.ts` | New — merges catalog with earned data |
| `src/client/pages/achievements/index.tsx` | New — Achievements page |
| `src/client/pages/workout/active.tsx` | Wire reconciler at 3 finishSession sites |
| `src/client/layouts/app-shell.tsx` | Add Achievements nav item + modal mount |
| `src/client/pages/settings/index.tsx` | Add gamification toggle section |
| `src/client/app.tsx` | Add `/achievements` route |
| `src/client/pages/home/index.tsx` | Add "up next" nudge below weekly stats |

---

## Phase 2 (deferred)

Auto-rotating weekly and monthly challenges. A deterministic weekly pool selects 3 challenges per week (e.g. "Log 4 workouts", "Hit a PR", "Train 3 muscle groups"). Progress tracked in a `challenge_progress` table keyed by `(challenge_id, period_key)`.

---

## Verification

1. Complete a first-ever session → "First Rep" badge earned → modal appears → `/achievements` shows it with earned date
2. Log a set heavier than any previous → "First PR" earned
3. Complete a session under 10k kg total → "Big Session" badge not earned; complete one over 10k → earned
4. Toggle gamification OFF → home nudge disappears, `/achievements` redirects to `/`, post-workout modal never fires
5. Turn gamification back ON → all previously earned badges still show (retroactive)
6. Earn 2 badges in one session → modal shows them sequentially
