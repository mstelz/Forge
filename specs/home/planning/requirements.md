# Spec Requirements: Today / Homepage

## Overview

The homepage at `/` is the app's landing surface and the consolidated answer to "what should I do today?". This slice collapses the PRD's previously-separate `Today` page into the homepage overview (per `docs/PRODUCT-PLAN.md` line 236), removes the duplicate secondary active-program card (line 234), and replaces calendar day-link navigation with an inline quick day-detail surface (line 235). It is strictly read-only: no new tables, no new API endpoints, no new outbox entities, no new mutations. Every action delegates to an existing route owned by sibling specs (`/sessions/new`, `/sessions/:id`, `/programs/:id`, `/goals/:id`, `/history`).

The page composes seven sections in a single scrollable column, dense and informational rather than feed-like, matching `design/home.png` exactly: top bar → date strip → primary today card → program strip → mini calendar (with day-detail surface) → goals → quick stats.

Visual references (authoritative): `design/home.png` and `design/home.json`. PRD: `docs/PRD.md` §Today and §Goal progress; PRODUCT-PLAN: lines 39–46, 195, 213, 234–236.

## Goals

- One landing surface that surfaces, in order: today's routine + resume/start CTA, active program progress, current-week calendar with inline day detail, top-priority goals, and a rolling weekly stats row.
- Single primary today / active-program card — no duplicate secondary card.
- Inline calendar day-detail surface (Radix Popover on desktop, slide-up sheet on mobile) so users can inspect any day's planned/completed workout without leaving `/`.
- Collapse the dedicated `/today` route into `/`; redirect `/today → /` to keep prior bookmarks working.
- Strictly read-only: zero new mutations or persistence.
- Match `design/home.png` in layout, density, dark-mode tokens, and amber accents.

## Non-goals (v1)

- Full month-grid calendar; only current week row.
- Any mutation surface (start/finish/edit/log writes live in workout-sessions; CRUD for programs/goals/routines lives in their respective routes).
- Notifications, reminders, or push.
- Charts, trend lines, or sparklines beyond the fixed three quick-stat tiles.
- Surfacing goals beyond the top two; full goal list lives at `/goals`.
- Surfacing more than one in-progress session (workout-sessions enforces a single concurrent in-progress session, and the homepage assumes that invariant).
- Onboarding / setup wizard for first-launch (the homepage renders an explicit empty-state copy, not a guided flow).
- Bearer-token auth or per-user isolation (consistent deferral with sibling slices).

## User stories

- As the single user, I open the app and see today's routine front and center with one large amber CTA — `Resume Workout` if a session is in progress, otherwise `Start Workout`.
- As the user mid-program, I see "Hypertrophy Block · Week 3 of 8" with a horizontal week dot strip showing completed days as filled amber, today as outlined amber pulsing, upcoming as muted, skipped with a slash.
- As the user, I tap a calendar day → inline popover (desktop) or slide-up sheet (mobile) → I see what was planned or logged that day, with a single "Open session" link to the session detail when applicable.
- As the user, I see my top two active goals with progress bars; tapping a card opens its detail at `/goals/:id`.
- As the user, I see three rolling weekly stats: this-week workouts, this-week volume (kg), and current weekly streak.
- As the user with no active program, the program strip is hidden; the primary card falls back to "Pick a routine to start" with a CTA to `/routines`.
- As the user on a planned rest day, the primary card shows "Rest day" with secondary text and a small "Log a workout anyway" link to `/sessions/new`.
- As the user opening `/today` (legacy bookmark), I am redirected to `/` and see the same content.
- As the user, every section reads from the local Dexie cache and works offline.

## Data model

No new entities. The page is a pure view layer over data already owned by sibling specs:

- `programs`, `program_days`, `program_runs`, `program_run_day_states` (programs spec) — active program detection, week strip, today's planned routine.
- `sessions` (workout-sessions) — most-recent in-progress session for the resume CTA; recently finished sessions for calendar day dots and weekly stats.
- `session_set_logs` (workout-sessions) — weekly volume / workout count / streak math. Reuse the existing aggregation rules and `epley()` helper exactly as workout-history does.
- `goals` (goals) — top-two active goals by deadline ASC nulls last, tiebreak `updatedAt` DESC.
- `routines` (routines) — fallback routine title and exercise preview list when active-program data is unavailable.

### Derivations (computed on read)

- **`activeProgramRun`**: the single `program_runs` row with `status='active'` (programs spec invariant: one active run at a time). Null when none.
- **`todayPlannedDay`**: derived from `activeProgramRun`'s scheduling mode. For sequential mode = the next day-state with `state='pending'`; for flexible mode = the user's manually-anchored "next" day (programs spec defines the rule). Null when no active program.
- **`todayRoutine`**: the `routines` row referenced by `todayPlannedDay.routineId`; null when `todayPlannedDay` is null or marks a rest day.
- **`inProgressSession`**: the `sessions` row with `status='in_progress'`, scoped to the current calendar day's window (`startedAt >= startOfDay AND startedAt < endOfDay`); null when none. (Workout-sessions enforces ≤1 in-progress session globally.)
- **`weekStartLocal`**: Monday 00:00 of the user's local time zone for "this week".
- **`weeklyStats`**: { workouts: sessions finished `endedAt >= weekStart`; volume: sum `weightKg * reps` over `session_set_logs` for those sessions per workout-history aggregation rules; streak: count of consecutive prior weeks (week-of-Monday) with ≥1 finished session, ending at the current week if it has ≥1 already, otherwise at the previous week }.
- **`weekDots`**: 7-day strip Monday–Sunday. Each dot's state ∈ {`done` (≥1 finished session), `today_active` (today + has in-progress), `today_idle` (today + no session), `planned` (program plans a routine for this day), `rest` (program plans a rest day), `skipped` (program planned a routine but the day passed with no session), `empty` (no program / no session)}.
- **`topGoals`**: max two `goals` rows with `status='active'`, sorted by `deadline` ASC nulls last, tiebreak `updatedAt` DESC.

### Day-detail surface payload

Computed lazily on tap of a calendar day:

- The day's `program_run_day_states` row if any (planned routine ref, week index, day index, state).
- The day's finished or in-progress `sessions` rows (max one expected).
- The matching `routines` row for the planned routine.
- The matching `session_set_logs` exercise count and set count for any logged session.

All read from Dexie, no API call.

## API surface

**No new endpoints.** Every read is satisfied by Dexie via existing query helpers. If, post-launch, the page needs server-side derivations for cold-start performance, the work is deferred and out of scope here.

The page renders correctly even when `/api/v1` is unreachable; outbox entries from elsewhere in the app are unaffected.

## UI page and behaviors

Routes:

- `/` — the homepage.
- `/today` — redirects to `/` (preserve legacy bookmarks; HTTP-level redirect on the server route, plus a client-router `<Navigate to="/" replace />` for SPA navigation).

### Page composition (top to bottom)

Visual: `design/home.png`. All numeric values use tabular numerics. Spacing/tokens match the rest of Forge (dark mode `#0B0B0C` bg, `#17181A` surfaces, `#26272A` borders, amber `#F59E0B` accent, Inter, 14px rounding).

1. **Top bar** — hamburger drawer icon left, `FORGE` wordmark center, circular avatar with the user's initials right (placeholder `MS`-style; pulled from settings if/when settings spec lands).
2. **Daily briefing strip** — small muted day name + date (`Wednesday, April 23`), then a 7-cell mini week row directly under, dim `S M T W T F S` headers above small numeric day cells; today's cell amber-outlined (the latest in `home.json` deletes a duplicate variant and keeps one).
3. **Primary today card** — large card with a 4px amber left edge accent. Contents per state:
   - **Active program day with planned routine**: routine title (large bold), `~Xh Ym` estimated duration (when computable from routine prescription), 3–6 exercise preview rows showing exercise name + planned sets `x` reps in muted text, large amber `START WORKOUT` (or `RESUME WORKOUT` when an in-progress session matches today). Tap → `/sessions/new` (start) or `/sessions/:id` (resume).
   - **Active program day = rest day**: title `Rest day`, muted explanation `Recover and come back tomorrow`, secondary text-link `Log a workout anyway` → `/sessions/new`.
   - **No active program**: title `No program active`, muted body `Pick a routine to start a freeform workout.`, primary amber `BROWSE ROUTINES` → `/routines`.
   - **Active program but no plan today (off-rotation)**: same as "rest day" but copy reads `Off-day` and the secondary link is the only CTA.
4. **Program strip** — single horizontal pill below the primary card: `<Program name> · Week <n> of <total>` with a compact 7-day dot row. Each dot = one day in the **current program week** (not calendar week — programs are 7-day weeks anchored to the run's start). Dot states: `done` (filled amber), `today_active` (outlined amber, pulsing animation), `today_idle` (outlined amber, no pulse), `planned` (muted gray fill), `rest` (smaller faded gray dot), `skipped` (gray with diagonal slash). Whole strip tappable → `/programs/<activeProgramId>`. Hidden when no active program.
5. **Mini calendar** — 7-cell current-calendar-week row Monday–Sunday with day numbers; small under-cell dot when ≥1 finished session that day; today's cell amber-outlined; tappable to open the day-detail surface.
6. **Goals** — section header `PRIORITY OBJECTIVES`; up to two stacked goal cards. Each card mirrors the goals-list card shape (category pill, title, big numeric current/target with unit, amber progress bar with percent, "X weeks left" / `OVERDUE` / `COMPLETED`). Tap → `/goals/:id`. When zero active goals, hide the section. When 1 active goal, render only that card (no placeholder slot).
7. **Quick stats row** — three tiles in a single horizontal grid, each `#17181A` surface with 14px rounding and 1px `#26272A` border. Tiles in declared order: `THIS WEEK · <n> workouts`, `VOLUME · <n> kg`, `STREAK · <n> wk`. Oversized tabular numerics with small uppercase muted label below. Section is always visible (zero values render naturally).

No bottom tab bar. No Pro Member pill. No floating Export JSON button (Export lives in the drawer/sidebar footer per the export spec).

### Day-detail surface (mini calendar tap)

- Trigger: tap a day in the mini calendar.
- Implementation: Radix `Popover` anchored to the day cell on `min-width: 768px`; a slide-up sheet covering the bottom 60% of the viewport on smaller widths. Both share the same content component.
- Content: day name + date header; primary content varies by state:
  - **Day with finished session**: routine title, `<exCount> exercises · <setCount> sets · <durationMin> min`, "Open session" link → `/sessions/:id`.
  - **Day with in-progress session**: same as finished but with an amber `In progress` pill and CTA `RESUME WORKOUT` → `/sessions/:id`.
  - **Future planned program day**: routine title + planned exercises preview; no CTA.
  - **Past planned program day with no session**: routine title + "Skipped" muted line.
  - **Rest day**: title `Rest day`, muted body.
  - **Empty day (no plan, no session)**: muted body `Nothing scheduled.`, optional link `Log a freeform workout` → `/sessions/new?date=YYYY-MM-DD` (the date param is informational; the session itself uses `Date.now()` for `startedAt` per workout-sessions, which keeps lifecycle invariants intact).
- Dismiss: outside-click on desktop; backdrop tap or swipe-down on mobile.

### Loading / empty / error states

- **Loading**: skeleton boxes for primary card, program strip, goals row, stats tiles on initial mount; subsequent navigations are instant from Dexie.
- **Fully empty install** (no programs, no routines, no sessions, no goals): primary card shows the "No program active" variant with `BROWSE ROUTINES` CTA; program strip and goals section hidden; mini calendar still renders (all dots empty); stats tiles render zeros.
- **Errors**: the homepage never blocks on errors. Failed Dexie reads (theoretical; the local DB is reliable) surface a single muted line `Couldn't load latest data — try refreshing.` at the top of the page; sub-sections degrade independently.

## Search, filter, sort semantics

None. The homepage is a curated view; no user-facing filtering or sort controls.

## Offline and sync model

- Pure read; no Dexie writes, no outbox entries.
- All sections render from Dexie immediately on mount; if the outbox flusher is mid-drain, the page reflects local Dexie state (a superset of server state until the outbox clears) — same invariant as the rest of the app.
- The legacy `/today` redirect operates client-side first (React Router `<Navigate>`); the server's static handler also returns a 302 → `/` for non-SPA loads.

## Validation rules

No persisted writes; no validation. Read-side derivations clamp gracefully:

- `weeklyStats.streak` is a non-negative integer.
- `topGoals` is `[]` when no active goals exist; rendered as a hidden section.
- `weekDots` always emits exactly 7 dots regardless of program/session state.
- `inProgressSession` is at most one row (workout-sessions invariant); the homepage tolerates >1 by picking `MAX(updatedAt)`.

## Existing code to reference

- `specs/programs/planning/spec.md` — `programs`, `program_days`, `program_runs`, `program_run_day_states` shapes and the active-run invariant; reuse the existing Dexie helpers for "next pending day" derivation.
- `specs/workout-sessions/planning/spec.md` — `sessions`, `session_set_logs` shapes; the in-progress-session invariant; the exported `epley()` helper (reused indirectly via the weekly volume aggregation).
- `specs/workout-history/planning/spec.md` — weekly aggregation rules (volume, set count, exercise count, duration filter conditions). Reuse the same predicates so the homepage stats and the history page totals never disagree.
- `specs/routines/planning/spec.md` — routine prescription model used to render exercise preview rows on the primary card.
- `specs/goals/planning/spec.md` — goal card shape and `computeGoalProgress` helper for the homepage's two-card render.
- `src/client/db/forge-db.ts` and `src/client/db/queries.ts` — Dexie + Tanstack Query patterns; this slice adds a `useHomepageState()` hook that composes existing per-entity hooks.
- `docs/PRODUCT-PLAN.md` lines 39–46, 213, 234–236 — explicit guidance for this slice.
- `docs/PRD.md` §Today, §Goal progress page — original PRD references.

## Visual assets

- `design/home.png` + `design/home.json` — authoritative for layout. Note `home.json.lastEdit` (line 6) explicitly removes the bottom tab bar and Pro Member pill; both must stay removed.

Visual insights:

- Dark mode (`#0B0B0C` bg, `#17181A` surfaces, `#26272A` borders), amber `#F59E0B` accent, Inter typography, 14px rounding, 1px borders, no heavy shadows.
- Oversized tabular numerics on the stats tiles and goal cards.
- Amber left-edge accent (4px) on the primary card.
- Today's mini-calendar cell amber-outlined; today's program-strip dot pulses (subtle 1.5s ease-in-out).
- No bottom tab bar; nav is the global drawer (consistent with the rest of Forge).

## Out of scope (explicit, v1)

- Full month-grid calendar; multi-week scrolling calendar; year heatmap.
- Any mutation surface on the homepage.
- Notifications, reminders, push, email digests.
- Charts, trends, sparklines beyond the fixed three quick-stat tiles.
- Surfacing more than two goals.
- Onboarding / setup wizards; first-launch tutorials.
- Bearer-token auth, per-user isolation, settings-driven units (defer to the settings spec for unit selection; v1 hardcodes `kg` for stat tile volume to match workout-history).
- Server-side homepage state endpoint (everything reads from Dexie).

## Open items and deferred concerns

- **Unit display.** Quick-stats `VOLUME` tile renders kg in v1 to match workout-history's hardcoded display. When the settings spec lands a `weightUnit` preference, the homepage and history both read from it; this is a future-coupled read, not an outbox write.
- **Streak window edge cases.** "Current weekly streak" counts consecutive prior weeks ending at the current week if it has ≥1 finished session, otherwise at the previous week. Acceptable simplification; a user with a workout late Sunday and a workout early Monday spans two weeks per ISO Monday-week. Documented; not fixed in v1.
- **In-progress session visual cue.** Pulse animation on today's dot is acceptable but optional; a static amber outline is acceptable if the animation harms accessibility / battery.
- **Day-detail link target for past empty days.** Linking to `/sessions/new?date=YYYY-MM-DD` carries an informational date hint only; the session itself is `Date.now()`-anchored. Document the limitation.
- **Avatar / initials source.** v1 hardcodes `MS` (matching `home.json.lastEdit`) until settings spec ships a profile source. Documented placeholder.
- **`/today` redirect mechanism.** SPA-side `<Navigate>` is sufficient in v1; if the deployment serves the index page with a static handler that doesn't 302, that's acceptable since `/today` will hit the SPA shell and the client redirect kicks in. Document the behavior.
