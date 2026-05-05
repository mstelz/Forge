# Specification: Today / Homepage

## Overview

The homepage at `/` is the consolidated landing surface — a single, dense, read-only dashboard composed of seven sections matching `design/home.png`: top bar → daily briefing strip → primary today card → program strip → mini calendar with day-detail surface → top-two goals → quick-stats row. This slice collapses the legacy `/today` route into `/` (with a redirect for prior bookmarks), removes the duplicate secondary active-program card, and replaces calendar day-link navigation with an inline Radix Popover (desktop) or slide-up sheet (mobile). It is strictly read-only: no new tables, no API endpoints, no outbox entities, no mutations. Every action delegates to existing routes owned by sibling specs.

## Goals

- One landing surface that surfaces today's routine + resume/start CTA, active program progress, current-week calendar with inline day detail, top-priority goals, and rolling weekly stats.
- Single primary today / active-program card; the duplicate secondary card is gone.
- Inline calendar day-detail surface (Radix Popover desktop, slide-up sheet mobile).
- `/today` redirects to `/` so prior bookmarks keep working.
- Read-only: zero new mutations, zero new persistence.
- Match `design/home.png` in layout, density, dark-mode tokens, and amber accents.

## Non-goals (v1)

- Full month-grid calendar; multi-week scrolling calendar; year heatmap.
- Any mutation surface on the homepage.
- Notifications, reminders, push, email digests.
- Charts, trends, or sparklines beyond the three fixed quick-stat tiles.
- Surfacing more than two goals.
- Onboarding / setup wizards.
- Bearer-token auth or per-user isolation (deferred consistently).
- Server-side homepage state endpoint.
- Settings-driven unit display; v1 hardcodes `kg` to match workout-history.

## User flows

1. **Active program, in-progress session today.** User opens `/` → primary card shows `RESUME WORKOUT` (amber) → tap → `/sessions/:id`.
2. **Active program, no session yet today.** Primary card shows today's planned routine + exercise preview + estimated duration + `START WORKOUT` → tap → `/sessions/new` (workout-sessions hydrates the session from the routine).
3. **Active program rest day.** Primary card shows `Rest day` + secondary text-link `Log a workout anyway` → tap → `/sessions/new`.
4. **Active program off-rotation day** (program plans nothing for today, e.g., flexible-mode skip). Primary card shows `Off-day` + secondary link.
5. **No active program.** Primary card shows `No program active` + amber CTA `BROWSE ROUTINES` → tap → `/routines`. Program strip hidden.
6. **User taps any mini-calendar day.** Day-detail surface opens inline (popover or sheet) showing planned/finished/in-progress/empty content. Outside-click / backdrop / swipe-down dismisses.
7. **User taps a goal card.** Navigates to `/goals/:id`. Top-two goals are derived by `status='active'`, sorted by `deadline ASC nulls last`, tiebreak `updatedAt DESC`.
8. **Legacy `/today` URL.** SPA router redirects via `<Navigate to="/" replace />`; static server handler returns 302 → `/` for non-SPA loads.

## Data model

No new entities. Reads via existing Dexie stores:

- `programs`, `program_days`, `program_runs`, `program_run_day_states` (programs spec).
- `sessions`, `session_set_logs` (workout-sessions).
- `goals` (goals).
- `routines` (routines).

### Read-side derivations

A single hook composes the page state.

```ts
// src/client/home/state.ts
export type HomepageState = {
  todayLocal: { y: number; m: number; d: number; weekday: number };
  weekStart: number; // unix ms, Monday 00:00 local
  activeProgramRun: ProgramRun | null;
  todayPlannedDay: ProgramRunDayState | null;
  todayRoutine: Routine | null;
  inProgressSession: Session | null;
  weekDots: HomepageWeekDot[];        // 7 entries, programmatic-week aligned (program strip)
  calendarDots: HomepageCalendarDot[]; // 7 entries, calendar-week aligned (mini calendar)
  weeklyStats: { workouts: number; volumeKg: number; streakWeeks: number };
  topGoals: Goal[];                   // ≤2
};

export function useHomepageState(): { data: HomepageState | undefined; isLoading: boolean };
```

Derivation rules (all client-side, no server calls):

- **`activeProgramRun`** = first `program_runs` row with `status='active'` from Dexie. Programs spec invariant: ≤1 active run.
- **`todayPlannedDay`** = the `program_run_day_states` row for the active run + today's program-week index + today's day-in-week index per the run's scheduling mode (sequential = next `state='pending'`; flexible = the user's manually-anchored next day per programs spec). Null when no active program or program has no plan for today.
- **`todayRoutine`** = `routines` row referenced by `todayPlannedDay.routineId`; null if `todayPlannedDay` is null or marks a rest day.
- **`inProgressSession`** = `sessions` row with `status='in_progress'`. Workout-sessions invariant: ≤1 globally; homepage tolerates >1 by picking `MAX(updatedAt)`.
- **`weekStart`** = Monday 00:00 of the user's local time zone for "this week".
- **`weeklyStats.workouts`** = count of `sessions` with `status='finished'` and `endedAt >= weekStart`.
- **`weeklyStats.volumeKg`** = sum of `weightKg * reps` over `session_set_logs` joined to those sessions, restricted to `status='logged'`, `setType IN ('normal','amrap','to_failure','drop_set','rest_pause')`, `reps > 0`, `weightKg > 0`. **Identical predicate to workout-history**; the math must never disagree.
- **`weeklyStats.streakWeeks`** = consecutive prior Monday-weeks (ending at this week if it has ≥1 finished session, otherwise at the previous week) with ≥1 finished session each.
- **`weekDots`** (program strip, 7 entries) = day states across the **active run's current program week**, mapped to dot states `done | today_active | today_idle | planned | rest | skipped | empty` per requirements.
- **`calendarDots`** (mini calendar, 7 entries) = current calendar-week Monday–Sunday, with `hasFinishedSession` boolean for the under-cell dot and `isToday` flag.
- **`topGoals`** = max two `goals` rows with `status='active'`, sorted by `deadline ASC nulls last`, tiebreak `updatedAt DESC`.

### Day-detail surface payload

Computed lazily on tap.

```ts
type DayDetail = {
  date: { y: number; m: number; d: number };
  plannedRoutine: Routine | null;
  plannedDayState: ProgramRunDayState | null;
  session: Session | null;          // finished or in-progress, ≤1
  sessionStats: { exerciseCount: number; setCount: number; durationMs: number } | null;
  isRestDay: boolean;
  isFutureDay: boolean;
};
```

Helper: `getDayDetail(date: { y; m; d })` reads from the same Dexie stores; no API call.

## API surface

**No new endpoints.** Reads are entirely Dexie-backed. The page renders correctly when `/api/v1` is unreachable.

`GET /today` (server-side, non-SPA fallback): returns `302 Location: /` so direct hits redirect to the homepage.

## UI page and behaviors

Routes:

- `/` — homepage (this spec).
- `/today` — redirects to `/` (SPA `<Navigate to="/" replace />` + server 302).

### Page composition (top to bottom)

Tokens (consistent with the rest of Forge): bg `#0B0B0C`, surfaces `#17181A`, borders `#26272A`, amber `#F59E0B`, Inter, 14px rounding, tabular numerics.

1. **Top bar.**
   - Hamburger drawer icon left.
   - `FORGE` wordmark center.
   - Right: circular avatar with initials (`MS` placeholder; pulled from settings if/when settings ships).
   - No bottom tab bar. No Pro Member pill.

2. **Daily briefing strip.**
   - Small muted day name + date line: `Wednesday, April 23` (locale via `Intl.DateTimeFormat`).
   - Below: 7-cell mini calendar — `S M T W T F S` headers (dim) over numeric day cells. Today's cell amber-outlined.

3. **Primary today card** (single card; replaces the duplicate secondary card).
   - 4px amber left edge accent.
   - Variants:
     - **Active program day with planned routine** (default for an active mid-program day): routine title (large bold), `~Xh Ym` estimated duration when computable from routine prescription (else hidden), 3–6 exercise preview rows showing `<exerciseName>` + planned `Sx R` (reps or rep mode) muted, large amber CTA `START WORKOUT` (or `RESUME WORKOUT` if `inProgressSession != null` and started today). CTA link: `/sessions/:id` (resume) or `/sessions/new` (start).
     - **Rest day**: title `Rest day`, muted body `Recover and come back tomorrow.`, secondary text-link `Log a workout anyway` → `/sessions/new`.
     - **Off-day** (active program, no plan today): title `Off-day`, muted body `Nothing scheduled.`, secondary text-link `Log a freeform workout` → `/sessions/new`.
     - **No active program**: title `No program active`, muted body `Pick a routine to start a freeform workout.`, primary amber CTA `BROWSE ROUTINES` → `/routines`.
   - Card is always rendered; never collapsed.

4. **Program strip** (hidden when no active program).
   - Single horizontal row directly under the primary card.
   - Left: `<Program name> · Week <currentWeek> of <totalWeeks>` text.
   - Right: 7-day dot row representing the **current program week** (anchored to the run, not the calendar week). Dot states:
     - `done` — filled amber.
     - `today_active` — outlined amber, pulsing 1.5s ease-in-out (a11y: respect `prefers-reduced-motion` → static outline).
     - `today_idle` — outlined amber, no pulse.
     - `planned` — muted gray fill.
     - `rest` — smaller faded gray dot.
     - `skipped` — gray with diagonal slash.
   - Whole strip is one tap target → `/programs/<activeProgramId>`.

5. **Mini calendar** (always rendered).
   - Same 7-cell row from the briefing strip, but here it serves as the day-detail trigger surface.
   - Tap a cell → opens day-detail surface anchored to that cell (popover desktop, sheet mobile).
   - Under-cell: 3px amber dot when ≥1 finished session that day; hidden otherwise.
   - Today's cell amber-outlined.

6. **Goals section** (hidden when zero active goals).
   - Section header `PRIORITY OBJECTIVES`.
   - Up to two stacked goal cards mirroring the goals-list card shape: category pill, title, big numeric `currentValue / targetValue <unit>`, amber progress bar with right-aligned percent, footer `<countdown>` (`X weeks left` / `OVERDUE` / `COMPLETED`). Tap → `/goals/:id`.
   - Render only the cards that exist (no empty placeholder slots).

7. **Quick stats row** (always rendered).
   - Three tiles in a single horizontal grid (responsive: 3-col desktop, 3-col mobile via small numeric scale).
   - Tiles in declared order: `THIS WEEK · <n> workouts`, `VOLUME · <n> kg`, `STREAK · <n> wk`.
   - Each tile: `#17181A` surface, 14px rounding, 1px `#26272A` border, oversized tabular numeric (Inter, ~32–36px), small uppercase muted label below.
   - Zero values render as `0`/`0 kg`/`0 wk` naturally.

### Day-detail surface

Trigger: tap any mini-calendar day cell.

Implementation:

- Desktop (`min-width: 768px`): Radix `Popover` anchored to the day cell, side `bottom`, align `center`. Width `~280px`.
- Mobile: full-width slide-up sheet covering the bottom 60% of the viewport, using a custom `Sheet` component (or Radix Dialog with bottom-anchored animation). Backdrop tap and swipe-down dismiss.
- Both share the same content component, parameterized by `DayDetail`.

Content variants:

- **Day with finished session**: routine title (or `Freeform`), `<exCount> exercises · <setCount> sets · <durationMin> min`, primary text-link `Open session` → `/sessions/:id`.
- **Day with in-progress session**: same as finished + an amber `In progress` pill, primary amber CTA `RESUME WORKOUT` → `/sessions/:id`.
- **Future planned program day**: routine title + planned exercises preview (max 5 rows, muted); no CTA.
- **Past planned program day with no session**: routine title + muted line `Skipped`.
- **Rest day**: title `Rest day`, muted body `Recover and come back tomorrow.`.
- **Empty day**: muted body `Nothing scheduled.`, optional text-link `Log a freeform workout` → `/sessions/new?date=YYYY-MM-DD`.

The `?date=` param is informational; the session itself uses `Date.now()` for `startedAt` (workout-sessions invariant). The link is a navigation hint, not a session pre-fill.

### Loading / empty / error states

- **Loading**: skeleton boxes for primary card, program strip, goals row, stats tiles on initial mount; subsequent navigations are instant from Dexie.
- **Fully empty install**: primary card renders the "No program active" variant with `BROWSE ROUTINES` CTA; program strip and goals section hidden; mini calendar still renders (all dots empty); stats tiles render zeros.
- **Errors**: never blocks the page. A muted line `Couldn't load latest data — try refreshing.` renders at the top if the composed hook throws; sub-sections degrade independently.

## Search, filter, sort, and pagination semantics

None. The homepage is a curated, fixed-layout view.

## Offline and sync model

Pure read; no Dexie writes, no outbox entries. All sections render from Dexie on mount; if the outbox flusher is mid-drain, the page reflects local Dexie state (a superset of server state until the outbox clears) — same invariant as the rest of the app.

## Validation rules

No persisted writes; no validation. Read-side derivations clamp gracefully:

- `weeklyStats.streakWeeks` is a non-negative integer.
- `topGoals` is `[]` when no active goals; the section is hidden.
- `weekDots` and `calendarDots` always emit exactly 7 entries.
- `inProgressSession` falls back to `MAX(updatedAt)` if invariant violated.

## Visual Design

Authoritative: `design/home.png`, `design/home.json`. Tokens are the project standard set (Inter, dark-mode bg/surface/border, amber accent, 14px rounding, no heavy shadows, oversized tabular numerics on stat tiles and goal cards). The latest mockup edit (`home.json.lastEdit`) explicitly removes the bottom tab bar and Pro Member pill — both stay removed.

## Existing Code to Leverage

- `specs/programs/planning/spec.md` — `programs`, `program_days`, `program_runs`, `program_run_day_states` shapes; the active-run invariant; existing Dexie helper for "next pending day" — reuse for `todayPlannedDay`.
- `specs/workout-sessions/planning/spec.md` — `sessions`, `session_set_logs` shapes; the in-progress-session invariant; the exported `epley()` helper (reused indirectly via the weekly-volume aggregation predicate).
- `specs/workout-history/planning/spec.md` — weekly aggregation predicate (`status='logged'`, set type allowlist, `reps > 0`, `weightKg > 0`); homepage `weeklyStats` MUST match exactly.
- `specs/routines/planning/spec.md` — routine prescription model used to render exercise preview rows on the primary card.
- `specs/goals/planning/spec.md` — goal card shape and `computeGoalProgress` helper; reuse for the homepage's two-card render.
- `src/client/db/forge-db.ts` and `src/client/db/queries.ts` — Dexie + Tanstack Query patterns; this slice adds `useHomepageState()` composing existing per-entity hooks.
- `docs/PRODUCT-PLAN.md` lines 39–46, 195, 213, 234–236 — explicit guidance for this slice.
- `docs/PRD.md` §Today, §Goal progress page — original PRD references.

## Out of Scope

- Full month-grid calendar; multi-week scrolling calendar; year heatmap.
- Any mutation surface on the homepage.
- Notifications, reminders, push, email digests.
- Charts, trends, or sparklines beyond the three fixed quick-stat tiles.
- Surfacing more than two goals.
- Onboarding / setup wizards.
- Bearer-token auth, per-user isolation, settings-driven units (v1 hardcodes `kg`).
- Server-side homepage state endpoint.
- Cross-week scrolling on the mini calendar (current week only).
