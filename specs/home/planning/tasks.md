# Task Breakdown: Today / Homepage

## Status (last updated 2026-05-04)

**Not started.** Read-only view layer over existing Dexie stores. No new tables, no new API endpoints, no new outbox entities, no new mutations. The slice consolidates `/today` into `/`, removes the duplicate secondary active-program card, and replaces calendar day-link navigation with an inline Radix Popover (desktop) / slide-up sheet (mobile).

Status legend: `[x]` done, `[~]` partial, `[ ]` not started.

### Phase status

- [ ] Phase 1 — `useHomepageState` hook (composed Dexie reads + derivations)
- [ ] Phase 2 — `/` route + page shell (top bar, briefing strip)
- [ ] Phase 3 — Primary today card (all four variants)
- [ ] Phase 4 — Program strip (week dots, pulse + reduced-motion)
- [ ] Phase 5 — Mini calendar + day-detail surface
- [ ] Phase 6 — Goals section
- [ ] Phase 7 — Quick stats row
- [ ] Phase 8 — `/today` → `/` redirect (SPA + server)
- [ ] Phase 9 — Polish (loading / empty / error states, a11y)
- [ ] Phase 10 — Manual verification against `design/home.png`

---

## Overview

Read-only homepage at `/`. Renders seven sections from existing Dexie data; the only "logic" is the composed derivation hook plus the inline day-detail surface.

Authoritative spec: `/home/mike/Development/Forge/specs/home/planning/spec.md`.
Visual reference: `/home/mike/Development/Forge/design/home.png`.

Total tasks: ~36 across 10 phases.

---

## Phase 1: `useHomepageState` hook

**Dependencies:** programs, workout-sessions, goals, routines, workout-history specs implemented (their Dexie stores and helpers exist).

### 1.1 [ ] Scaffold `src/client/home/state.ts`
- Export `HomepageState` type per spec Data Model.
- Export `useHomepageState()` returning `{ data, isLoading }`.
- Internally compose `useLiveQuery`s + Tanstack Query.

### 1.2 [ ] Active program / today's plan derivation
- Read `program_runs` for `status='active'`; null when none.
- Compute `todayPlannedDay` per programs spec scheduling-mode rules; null when no plan.
- Resolve `todayRoutine` via `routines` lookup; null on rest day.

### 1.3 [ ] In-progress session detection
- Read `sessions` for `status='in_progress'`. Pick `MAX(updatedAt)` if invariant violated.

### 1.4 [ ] Weekly stats derivation
- `weekStart` = Monday 00:00 local.
- `weeklyStats.workouts` = count finished sessions with `endedAt >= weekStart`.
- `weeklyStats.volumeKg` = sum `weightKg * reps` over `session_set_logs` matching workout-history's predicate exactly. Reuse the helper if exported; otherwise duplicate the predicate inline with a comment pointing to workout-history spec.
- `weeklyStats.streakWeeks` = consecutive prior Monday-weeks with ≥1 finished session, ending at this week if it has ≥1, otherwise the previous week.

### 1.5 [ ] `weekDots` (program strip) + `calendarDots` (mini calendar)
- `weekDots`: 7 entries across the active run's current program week, each tagged `done | today_active | today_idle | planned | rest | skipped | empty`.
- `calendarDots`: 7 entries Monday–Sunday calendar week, each `{ y, m, d, hasFinishedSession, isToday }`.

### 1.6 [ ] `topGoals`
- Read `goals` filtered to `status='active'`, sort by `deadline ASC nulls last`, tiebreak `updatedAt DESC`, take 2.

### 1.7 [ ] `getDayDetail(date)` helper
- Pure function reading from the same Dexie stores; returns `DayDetail` per spec.

### 1.8 [ ] Unit tests
- One test per derivation rule: weekly volume predicate, streak edge case (week with no sessions), program week dot states, today plan resolution per scheduling mode.

---

## Phase 2: Route + shell

### 2.1 [ ] Register `/` route
- New page component `src/client/pages/home/index.tsx`. Wire under the app router.

### 2.2 [ ] Top bar
- Hamburger drawer icon left, `FORGE` wordmark center, circular avatar with placeholder initials `MS` right.
- No bottom tab bar. No Pro Member pill.

### 2.3 [ ] Daily briefing strip
- Day name + date line via `Intl.DateTimeFormat`.
- 7-cell mini calendar row (`S M T W T F S` headers + numeric day cells, today amber-outlined). Reusable across the mini-calendar section.

---

## Phase 3: Primary today card

### 3.1 [ ] Card shell with 4px amber left edge accent
- Always rendered; never collapsed.

### 3.2 [ ] Variant: active program day with planned routine
- Routine title (large bold), `~Xh Ym` estimated duration when computable, 3–6 exercise preview rows (`<exerciseName>` + `Sx R` muted).
- CTA: `RESUME WORKOUT` if `inProgressSession` from today exists → `/sessions/:id`; else `START WORKOUT` → `/sessions/new`.

### 3.3 [ ] Variant: rest day
- Title `Rest day`, muted body, secondary text-link `Log a workout anyway` → `/sessions/new`.

### 3.4 [ ] Variant: off-day
- Title `Off-day`, muted body `Nothing scheduled.`, secondary text-link `Log a freeform workout` → `/sessions/new`.

### 3.5 [ ] Variant: no active program
- Title `No program active`, muted body, primary amber CTA `BROWSE ROUTINES` → `/routines`.

### 3.6 [ ] Estimated duration helper
- Pure function over the routine prescription returning `{ hours, minutes }` or null when not computable.
- Document the formula in a one-line comment.

---

## Phase 4: Program strip

### 4.1 [ ] Hide when no active program.

### 4.2 [ ] Render `<Program name> · Week <currentWeek> of <totalWeeks>` + 7-day dot row
- Dot states per spec: `done | today_active | today_idle | planned | rest | skipped | empty`.

### 4.3 [ ] Pulse animation on `today_active`
- 1.5s ease-in-out alpha pulse.
- Respect `prefers-reduced-motion` → static outline.

### 4.4 [ ] Whole strip tappable → `/programs/<activeProgramId>`.

---

## Phase 5: Mini calendar + day-detail surface

### 5.1 [ ] Mini calendar component
- 7-cell current calendar week. Today amber-outlined. 3px amber under-cell dot when `hasFinishedSession`.
- Keyboard reachable; cells are `<button>`s.

### 5.2 [ ] Day-detail content component
- Parameterized by `DayDetail`.
- Variants per spec: finished, in-progress, future-planned, past-skipped, rest, empty.

### 5.3 [ ] Desktop popover wrapper
- Radix `Popover`, side `bottom`, align `center`, ~280px wide. Anchored to the tapped cell.

### 5.4 [ ] Mobile slide-up sheet wrapper
- Bottom-anchored sheet covering 60% viewport. Backdrop tap + swipe-down dismiss.

### 5.5 [ ] Responsive switch
- `min-width: 768px` → popover; else sheet. Single source of truth (CSS or `matchMedia`); no double-render.

### 5.6 [ ] `Open session` / `RESUME WORKOUT` deep-links
- Finished → `/sessions/:id`.
- In-progress → `/sessions/:id`.
- Empty day → `/sessions/new?date=YYYY-MM-DD` (informational hint only).

---

## Phase 6: Goals section

### 6.1 [ ] Hide section when zero active goals.

### 6.2 [ ] Render up to two goal cards
- Reuse the goals-list card primitive verbatim (category pill, title, big numeric, amber progress bar with percent, countdown footer).
- Tap → `/goals/:id`.

### 6.3 [ ] No empty placeholder slot when only one goal.

---

## Phase 7: Quick stats row

### 7.1 [ ] Three-tile horizontal grid
- Order: `THIS WEEK · <n> workouts`, `VOLUME · <n> kg`, `STREAK · <n> wk`.
- `#17181A` surface, 14px rounding, 1px `#26272A` border.

### 7.2 [ ] Oversized tabular numerics + small uppercase muted label
- Numeric ~32–36px Inter, label small caps, muted color.

### 7.3 [ ] Zero values render naturally
- `0` / `0 kg` / `0 wk`. No empty state.

---

## Phase 8: `/today` → `/` redirect

### 8.1 [ ] SPA redirect
- Add a `/today` route that renders `<Navigate to="/" replace />`.

### 8.2 [ ] Server redirect
- Add a `GET /today` handler that returns `302 Location: /` for non-SPA loads.

### 8.3 [ ] Smoke-test
- Direct browser hit on `/today` lands on `/`. Client-side `<Link to="/today">` (if any) navigates to `/` without a flash.

---

## Phase 9: Polish

### 9.1 [ ] Loading skeletons
- Skeleton boxes for primary card, program strip, goals row, stats tiles on initial mount only.

### 9.2 [ ] Empty install
- Primary card renders the "No program active" variant; program strip + goals hidden; mini calendar renders; stats tiles render zeros.

### 9.3 [ ] Error fallback
- A muted line `Couldn't load latest data — try refreshing.` at the top of the page if `useHomepageState` throws. Sub-sections degrade independently.

### 9.4 [ ] A11y
- All interactive elements keyboard reachable; focus rings consistent with the rest of the app.
- `prefers-reduced-motion` respected on the program-strip pulse.
- Mini calendar cells expose `aria-label` with the full date.
- Day-detail surface traps focus when open and restores on close.

### 9.5 [ ] Contrast audit
- Primary card amber CTA, muted footer text, progress bars, dot states all meet AA against `#0B0B0C` / `#17181A`.

---

## Phase 10: Manual verification

### 10.1 [ ] Visual diff against `design/home.png`
- Confirm top bar, briefing strip, primary card with amber accent, program strip dots, mini calendar, two goal cards, three quick-stat tiles. No bottom tab bar. No Pro Member pill.

### 10.2 [ ] All four primary-card variants
- Active-program with planned routine + `START WORKOUT`; same with `RESUME WORKOUT` after starting a session; rest day; off-day; no active program.

### 10.3 [ ] Day-detail surface
- Tap each day-state variant (finished, in-progress, future-planned, past-skipped, rest, empty) and verify the surface contents and dismiss behavior on both desktop popover and mobile sheet.

### 10.4 [ ] Weekly stats parity with `/history`
- Open `/` and `/history?range=week`; verify `THIS WEEK · n workouts` and `VOLUME · n kg` match between the two surfaces exactly. Any drift = bug in the shared predicate; fix at source.

### 10.5 [ ] `/today` redirect
- Hit `/today` directly; verify 302 from server and `<Navigate>` from client both land on `/`.

### 10.6 [ ] Offline path
- Disable network; reload `/`; every section renders from Dexie; goals/stats/today reflect local state including any pending outbox entries.

---

## Notes / pickup hints

- The single hardest invariant in this slice: weekly-volume math MUST match workout-history exactly. Reuse the predicate; do not re-derive it. Drift between the two surfaces is the single most likely user-visible bug.
- The day-detail surface is the second-hardest UX; budget extra time on Phase 5.4 (mobile sheet swipe-down dismiss).
- The primary card's "estimated duration" is a nice-to-have; if the routine prescription doesn't expose enough info, hide it. Do not invent a heuristic.
- Pulse animation on `today_active` must check `prefers-reduced-motion`; do not skip the a11y step in Phase 4.3.
- The avatar initials are hardcoded `MS` in v1 (matches `home.json.lastEdit`); wire to settings only when settings spec lands.
- `?date=YYYY-MM-DD` on `/sessions/new` from the day-detail empty-day link is informational; do not change workout-sessions to honor it as a write-time hint.
- Resist adding a server-side homepage state endpoint; everything reads from Dexie.
