# Workout Dash Product Plan & Handoff

_Last updated: 2026-03-11_

This document is the **resume-here handoff** for ongoing product work. If you are picking the project back up after a pause, start here first, then read `docs/PRD.md` for the broader product definition.

## Where we are now

Workout Dash is being shaped into a self-hosted workout planner + tracker with:
- a private exercise library
- reusable routines
- multi-week programs
- mutable live workout sessions
- JSON export / API-first ownership

The product direction is now much clearer than the original MVP shape:
- planning/templates and live execution should be treated as **different layers**
- lists must scale beyond tiny demo datasets
- routine editing and workout logging both need to feel mobile-friendly and dense, not like giant admin forms

---

## Resume-here files

When resuming work, check these in order:
1. `docs/PRODUCT-PLAN.md` ← this file
2. `docs/PRD.md` ← broader product requirements
3. `src/components/app-shell.tsx` ← navigation structure
4. `src/components/routine-builder.tsx` ← routine template editor
5. `src/components/program-builder.tsx` ← programs list/create flow
6. `src/components/exercise-manager.tsx` ← exercises list/create flow
7. `prisma/schema.prisma` ← domain model status
8. `src/lib/payloads.ts` / `src/lib/serializers.ts` ← API shape glue

---

## What has already landed on `main`

### Navigation / homepage
- homepage cleanup landed
- removed the "recommended build order" box
- moved **Export JSON** off the homepage
- homepage now prioritizes the next/upcoming workout more clearly
- sidebar sections with children are now collapsible
- sidebar/footer behavior was improved so Export JSON behaves like a sidebar footer action instead of floating awkwardly in the main content

### Exercises
- exercises moved toward a scalable split flow:
  - `/exercises` = denser list/catalog page
  - `/exercises/new` = dedicated create/edit page
- groundwork added for search/filter/sort and denser list scanning

### Programs
- programs moved toward the same split flow:
  - `/programs` = list-first page
  - `/programs/new` = dedicated create/edit page
- bulky combined create/list layout was replaced with a more scalable direction

### Global UI direction already in place
- no mobile bottom nav for now
- dedicated create/edit pages are preferred over mixed create/list screens
- optional details should be secondary / progressively disclosed

---

## Product decisions that are now locked

## 1) Navigation / page structure
- **Do not** pursue a mobile bottom nav right now.
- **Export JSON** belongs in navigation:
  - desktop: bottom of sidebar
  - mobile: hamburger / slide-out menu
- **Programs** should use split list/create pages.
- **Exercises** should use split list/create pages.
- General rule: simpler browsing pages, dedicated editing pages.

## 2) Routine builder direction
The routine builder is the highest-priority planning UX surface.

### Locked UX direction
- routine name and duration should be immediately visible
- optional details/settings should live behind a secondary affordance
- exercise rows should stay dense and scan-friendly
- rows should expand/collapse rather than always showing giant inline forms
- supersets should be clearly grouped but compact

### Locked prescription model
Each exercise in a routine must support:
- set count
- rep targets or rep ranges
- either:
  - **uniform reps across all sets**
  - **custom per-set reps/ranges**
- technique modifiers:
  - drop set
  - rest-pause
  - AMRAP
  - to-failure

### Data-model direction
Avoid overloading everything into one fragile `repScheme` string.
Prefer structured template data for:
- set count
- rep mode
- rep targets/ranges
- technique metadata
- per-set targets when custom mode is enabled

## 3) Live workout execution direction
This is now a major product requirement, not a nice-to-have.

### Core mental model
Starting from a routine/program should **hydrate a mutable live session**.
A template is a starting point, not a lock.

### Required session behavior
During an active workout, the user must be able to:
- add exercises
- remove exercises
- reorder exercises
- swap exercises if equipment is unavailable
- add sets
- remove sets
- tweak the session after it has started

This must work for:
- fully free-form workouts
- workouts started from a routine
- workouts started from a program

### Logger behavior requirements
The logger should be **state-driven**, not a dumb form.

#### Set progression
- user should not manually type raw set numbers as the primary flow
- app should know the current exercise and expected next set
- after logging a set, UI should advance to the next expected set
- after planned sets are complete, user should be offered an **Add extra set** path

#### Superset progression
For supersets, progression should be by **round**, not by finishing all sets of one movement first.

Example for a 3-exercise superset over 3 rounds:
- Round 1: A1 → A2 → A3
- Round 2: A1 → A2 → A3
- Round 3: A1 → A2 → A3

If set counts change mid-session, the superset group should remain structurally consistent.

### Architecture implication
Template planning data and live execution/session data must be separate concerns:
- templates describe intent
- sessions capture mutable reality

The workout session model should not depend on the template remaining static once the session begins.

---

## Current roadmap

## Phase 1 — Completed / mostly completed
- homepage cleanup
- navigation cleanup
- exercises split list/create direction
- programs split list/create direction

## Phase 2 — In progress
### Routine template redesign
Goal: improve the planning layer so routines can express real prescriptions.

Expected first chunk:
- structured set/rep model
- rep mode (uniform vs custom)
- technique metadata
- per-set target support in the builder/API/schema

This is **template-side only**.
It should not try to solve live workout execution at the same time.

## Phase 3 — Next major stream
### Workout session / logger redesign
Goal: make live workouts feel like an intelligent, editable flow.

Key requirements:
- mutable sessions after starting from template/program
- free-form and template-started workouts share the same execution engine
- automatic set progression
- superset round progression
- add/remove/reorder/swap exercises during the session
- add/remove sets during the session
- log actual performed values cleanly

## Phase 4 — Scale / polish
- stronger filtering, sorting, and grouping for large libraries
- better Today page / live status clarity
- richer program progress views
- progressive detail reveal across list-heavy areas

---

## Recommended next implementation order

1. **Finish / land the first routine-template schema + builder slice**
   - structured rep modes
   - technique metadata
   - per-set targets
2. **Start the workout session/logger redesign**
   - design mutable session schema
   - define hydration from template/program
   - replace manual set-number workflow with guided progression
3. **Implement superset-aware logging flow**
4. **Implement reorder/swap/add/remove behavior during active sessions**
5. **Polish Today / next workout surfaces around active session state**

---

## Task list

## Immediate tasks
- [ ] Ensure the routine-template schema/builder slice is fully landed on `main`
- [ ] Validate the routine builder UX against mobile density goals
- [ ] Write a concrete session-schema design for mutable live workouts
- [ ] Define how a routine/program hydrates into a session snapshot
- [ ] Replace manual set-number entry with guided next-set progression
- [ ] Implement superset round progression in the logger
- [ ] Allow adding/removing/reordering/swapping exercises during active sessions
- [ ] Allow adding/removing sets during active sessions

## Near-term UX tasks
- [ ] make the live logger feel fast on mobile
- [ ] surface previous performance / context without clutter
- [ ] ensure extra-set flow is obvious after planned work is complete
- [ ] keep routine-builder advanced controls behind progressive disclosure
- [ ] redesign homepage overview to use a single primary active-program / today card (remove duplicate secondary active-program card)
- [ ] replace calendar day links with a quick day detail surface (popover, drawer, or slide-up) that shows the planned or completed workout/routine for that day
- [ ] evaluate whether the dedicated Today page should be collapsed into the homepage overview once resume/start state is fully surfaced in the top overview card
- [ ] redesign history summaries to replace the current pill-heavy format with a denser, more readable layout
- [ ] document a future scheduling mode feature: programs may eventually support both flexible/sequential execution and calendar-anchored scheduling with prescribed rest days
- [ ] remove "writes respect WORKOUT_DASH_API_TOKEN when configured" from public-facing docs / API docs plan

## Architectural tasks
- [ ] keep template layer and session layer cleanly separated
- [ ] preserve historical session truth even if templates later change
- [ ] ensure supersets can be mutated coherently during execution
- [ ] avoid fragile one-string prescription models

---

## Product principles to preserve

- **Templates are planning tools; sessions are execution reality.**
- **Dense and mobile-friendly beats decorative.**
- **Common actions should be obvious; advanced options should be available but secondary.**
- **The logger should feel like it understands workout flow.**
- **Real gym conditions matter:** unavailable equipment, changed order, extra sets, and deviations are normal — the product should accommodate them.
- **Dedicated list/create flows beat giant mixed screens** for anything that needs to scale.

---

## If resuming after time away

Ask:
1. Has the latest routine-template work actually landed on `main`?
2. Is the next task the logger/session architecture, or is there still unfinished routine-template work?
3. Are we preserving the "mutable live session" rule, or drifting back toward rigid template-bound logging?

If there is ambiguity, prefer the mutable-session / guided-logger direction documented here.
