# Raw Idea: Workout Sessions (Live Logger)

Workout Sessions is the live execution layer of Forge (a self-hosted workout tracker; stack: Bun/Hono/SQLite+Drizzle on the server, React/Vite/Tailwind v4/Dexie on the client, PWA). It is the counterpart to the routines template layer: templates describe planning intent; sessions capture mutable reality. The session schema and runtime must be **architecturally separate** from the template — once a session starts, it does not depend on the template remaining static, and later edits to the source routine must not rewrite session history.

Upstream reference: `specs/routines/planning/spec.md` is the template-side data model that sessions hydrate from.

## Scope (in)

- Mutable live workout sessions hydrated from one of three sources:
  - a routine
  - a program day
  - free-form (no template)
- **Snapshot on start**: the session captures the routine/program-day structure at workout start so later template edits do not rewrite history.
- Mid-session structural edits:
  - add / remove / reorder / swap exercises
  - add / remove sets
- **Guided next-set progression** (no manual set-number entry as the primary flow):
  - app knows the current exercise and the expected next set
  - after logging a set, UI advances to the next expected set
  - after planned sets are complete, surface an **Add extra set** path
- **Superset round progression**: progress by round (A1 → A2 → A3, then round 2), not by finishing all sets of one movement first; group must remain structurally consistent if set counts change mid-session.
- Set logging fields:
  - reps
  - weight
  - RPE
  - duration
  - distance
  - notes
  - setType change mid-session (e.g. normal → drop-set)
- **Rest timer**:
  - visible during logging
  - auto-start on log
  - manual start / pause / stop
  - adjustable duration
- Session lifecycle:
  - pause / resume an in-progress session
  - discard an in-progress session
  - save in-progress (leave and come back)
  - finish → store as immutable history
- Per-exercise history view
- 1RM estimation (calculated)

## Architectural rule

Template layer and session layer are **separate**. The session model must not depend on the source routine remaining static. Historical session truth must be preserved even if templates later change. Avoid fragile one-string prescription models when capturing performed sets.

## Out of scope (separate specs)

- Routines template (already specced — upstream dependency)
- Programs (planning + week/day model)
- History aggregations / totals beyond per-exercise history (e.g. total weight lifted, totals dashboards)
- Goals

## Source extracts

### From `docs/PRD.md`

#### Workout logging
- Start a workout from a routine, a freeform session, or part of an already joined program
- See the routine structure exactly as it existed when the workout started.
- Ability to add/remove exercises or reorganize entirely from a simple to use menu / interface. For example I may be doing the same routine as last week but a piece of equipment is out of service so I need to quickly change out an exercise or swap the order out if the equipment is taken.
- In addition to basic fields such as duration (cardio / mixed), or for Mixed / Strength reps, weight, there should be perceived effort as optional as well as optional notes. These should stay out of the way unless the user wishes to include them.
- The user should easily be able to change the set type from say normal to drop set.
- Ability to leave a workout in progress and delete or save progress.
- Clear view into the set I am currently on and workout in the entire routine or superset.
- Log sets quickly with strength and basic cardio fields.
- Reuse prior values for the same exercise as a speed aid.
- A timer should be visible and either auto start upon logging or have the ability to start/pause/stop. Also with the ability to change the time amount.
- Finish a workout and store it as immutable history.
- Ability to see history for a specific exercise.
- Ability to see calculated 1 rep max estimation.

#### 3. Workout model
- A workout session stores the performed event.
- A session may optionally reference a source routine.
- The routine structure must be snapshotted at workout start so later routine edits do not rewrite history.
- Set entries must support: reps, weight, RPE, duration, distance, notes.

### From `docs/PRODUCT-PLAN.md`

#### 3) Live workout execution direction — Core mental model
Starting from a routine/program should hydrate a **mutable live session**. A template is a starting point, not a lock.

#### Required session behavior
During an active workout, the user must be able to:
- add exercises
- remove exercises
- reorder exercises
- swap exercises if equipment is unavailable
- add sets
- remove sets
- tweak the session after it has started

This must work for: fully free-form workouts, workouts started from a routine, workouts started from a program.

#### Logger behavior requirements
The logger should be **state-driven**, not a dumb form.

**Set progression**
- user should not manually type raw set numbers as the primary flow
- app should know the current exercise and expected next set
- after logging a set, UI should advance to the next expected set
- after planned sets are complete, user should be offered an **Add extra set** path

**Superset progression**
For supersets, progression should be by **round**, not by finishing all sets of one movement first.

Example for a 3-exercise superset over 3 rounds:
- Round 1: A1 → A2 → A3
- Round 2: A1 → A2 → A3
- Round 3: A1 → A2 → A3

If set counts change mid-session, the superset group should remain structurally consistent.

#### Architecture implication
Template planning data and live execution/session data must be **separate concerns**:
- templates describe intent
- sessions capture mutable reality

The workout session model should not depend on the template remaining static once the session begins.

#### Phase 3 — Next major stream (Workout session / logger redesign)
- mutable sessions after starting from template/program
- free-form and template-started workouts share the same execution engine
- automatic set progression
- superset round progression
- add/remove/reorder/swap exercises during the session
- add/remove sets during the session
- log actual performed values cleanly

#### Recommended next implementation order (items 2–5)
2. Start the workout session/logger redesign
   - design mutable session schema
   - define hydration from template/program
   - replace manual set-number workflow with guided progression
3. Implement superset-aware logging flow
4. Implement reorder/swap/add/remove behavior during active sessions
5. Polish Today / next workout surfaces around active session state

#### Architectural tasks
- keep template layer and session layer cleanly separated
- preserve historical session truth even if templates later change
- ensure supersets can be mutated coherently during execution
- avoid fragile one-string prescription models

## Open questions for spec-researcher (do NOT answer here)

- How is the template snapshot stored on the session? Embedded JSON snapshot vs copied normalized rows?
- Concurrency / single-active-session rule? Can a user have multiple paused sessions?
- Conflict semantics if the source routine is edited or deleted while a session is paused?
- Pause vs. save-in-progress vs. discard — distinct states or one "in-progress" state with actions?
- Rest timer persistence across pause/resume, app reload, and offline?
- Offline write semantics via Dexie for live logging — queued sync, last-write-wins, conflict policy?
- Which 1RM formula(s)? Epley, Brzycki, configurable?
- Per-exercise history scope — does it live in this spec or is it just a read view over session set entries?
- How are setType changes (normal → drop-set) modeled — per-set enum field plus optional drop-set linkage?
- Mid-session superset structural changes (adding an exercise to an existing superset, splitting a superset) — supported in v1 or deferred?
- "Add extra set" — does it inherit prescription from the last planned set or start blank?
- Free-form sessions — do they reuse the same schema with a null template reference, or a separate flow?
- Reuse-prior-values UX — read from session history or from a denormalized "last performed" cache?

Deliverable for this step: just the folder + raw-idea file. The next agent (spec-researcher) drives requirements/spec/tasks and asks clarifying questions.
