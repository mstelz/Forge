# Workout Dash PRD

## Summary

Workout Dash is a self-hosted workout tracker and planner for one primary user who wants the simplicity of a basic lifting log, the structure of reusable routines, and the ability to assemble those routines into multi-week plans.

The product should feel fast while training, easy to manage outside the gym, and scriptable through an API.

## Problem

Most workout apps either become overly social and cluttered or hide core data behind rigid UX. The goal here is a private, self-hosted system that keeps workout logging simple while still modeling real training structure:

- exercises with instructional links
- routines with singles and supersets
- workout history with preserved snapshots
- multi-week programs

## Product goals

- Mobile app native feel without requiring app store integration
- Log a workout quickly from a phone without excessive taps.
- Maintain a private exercise library that supports both seed data and custom exercises.
- Build routines from reusable blocks, including supersets.
- Combine routines into multi-week programs
- Expose a stable API so other tools or agents can manage data directly.
- Keep deployment simple enough for one-container local use in v1.

## Non-goals for v1

- Social feed, comments, likes, or community features
- Coaching marketplace or public sharing
- Wearable integrations
- Complex AI recommendations
- Full-blown analytics beyond recent history and simple PR summaries
- Automatic import/scrape of exercise videos beyond storing metadata and links

## Primary user

Single self-hosting user who:

- lifts regularly
- wants to log quickly on mobile
- wants custom routines and programs
- may automate exercise/routine maintenance through the API

## Key Features

### Exercise library

- Create, edit, remove, and search exercises.
- Exercises should be classified as Strength, Cardio, or Mixed
- Store aliases for flexible search.
- Exercises should allow for equipment, primary & secondary muscles, descriptions, instructional video and description
- Keep exercise definitions clear enough that meaningful history is preserved.

### Routine builder

- Create a routine as an ordered list of blocks. Routines should allow for notes, estimated duration and name
- Add a single-exercise block or a superset block.
- Reorder blocks and reorder exercises inside a superset.
- Define prescription metadata per item: target sets, rep range or target reps, rest, RPE, tempo, and notes.
- Strength and Mixed  exercises should allow for techniques such as dropsets, rest pause, AMRAP and to failure
- Mixed and Cardio should have duration targets

### Workout logging

- Start a workout from a routine, a freeform session, or part of an already joined program
- See the routine structure exactly as it existed when the workout started.
- Ability to add/remove exercises or reoganize entirely from a simple to use menu / interface. FOr example I may be doing the same routine as last week but a piece of equipment is out of service so I need to quickly change out an exercise or swap the order out if the equipment is taken.
- In addition to basic fields such as duration (cardio / mixed), or for Mixed / Strength reps, weight, there should be perceived effort as optional as well as optional notes. These should stay out of the way unless the user wishes to include them. 
- The user should easily be able to change the set type from say normal to drop set. 
- Ability to leave a workout in progress and delete or save progress. 
- Clear view into the set I am currently on and and workout in the entire routine or superset. 
- Log sets quickly with strength and basic cardio fields.
- Reuse prior values for the same exercise as a speed aid.
- A timer should be visible and either auto start upon logging or have the ability to start/pause/stop. Also with the ability to change the time amount
- Finish a workout and store it as immutable history.
- Ability to see history for a specific exercise
- Ability to see calculated 1 rep max estimation

### Program planning

- Build a program as weeks containing planned training days.
- Program name, description, duration (in weeks)
- Ability to copy a previous week or pattern of weeks, say I have weeks 1 and 2 I want to repeat for a total duration of 12 weeks
- Assign a routine or session template to each day.
- Start a program and track completed, skipped, and upcoming sessions.

### Workout history

- Logged routine or freeform exercise history
- Ability to see logged sets
- Overall history and breakdown
- Total weight lifted, total exercises completed, total sets completed, etc

### Goals

- Ability to set Goals based on a few categories:
  - Weight
  - Measurement
  - Strength
  - Program
  - Cardio
  - Other
- Deadline
- Start / end value if appropriate
- Notes

### Goal progress page

- show goal progress

### Settings

- See @SETTINGS-PLAN.md

### API and automation

- CRUD exercises, goals, routines, and programs via `/api/v1`.
- Export all user-owned data

## Functional requirements

## 1. Exercise management

- Each exercise must have a stable ID, name, and lifecycle status.
- Each exercise can have zero or more video links.
- Each exercise can have aliases for search.
- Each exercise can declare a primary tracking mode:
  - `strength`
  - `cardio`
  - `mixed`
- Each exercise can define default units and equipment metadata.

## 2. Routine model

- A routine is a reusable workout template.
- A routine contains ordered blocks.
- Supported block types in v1:
  - `single`
  - `superset`
- A block contains ordered items.
- Each item references an exercise and a prescription payload.

## 3. Workout model

- A workout session stores the performed event.
- A session may optionally reference a source routine.
- The routine structure must be snapshotted at workout start so later routine edits do not rewrite history.
- Set entries must support:
  - reps
  - weight
  - RPE
  - duration
  - distance
  - notes

## 4. Program model

- A program contains weeks.
- Each week contains planned training days.
- Each training day points to a routine or embedded session template.
- Program progress must track not started, active, completed, and skipped states at the session level.

## 5. Auth and permissions

- V1 is single-user first.
- Read and write API access should be protected by a bearer token.
- Multi-user accounts and sharing are deferred until the single-user flow is stable.

## UX requirements

- Logging flow must be mobile-first.
- The logger must minimize keyboard use where possible.
- Supersets must render clearly as grouped exercises with obvious order.
- Recent performance for an exercise should be visible during logging.
- The app must remain usable on desktop for planning tasks.

