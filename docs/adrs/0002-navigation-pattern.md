# 0002 — Navigation pattern

**Status:** accepted · **Date:** 2026-04-23

## Context

Forge has seven top-level surfaces (Today, History, Routines, Programs, Exercises, Goals, Settings). That is too many for a bottom tab bar, and a tab bar also steals vertical space on a screen where the workout logger needs every pixel.

## Decision

Use a slide-out drawer for top-level navigation. During an active workout, the drawer is hidden and replaced with workout-mode chrome; the only exits are explicit (End via kebab menu, Pause).

## Specifics

- Drawer opens from the left via a hamburger icon in the top bar
- Active surface shown with an amber left bar and slightly elevated row background
- During an active workout: hamburger is removed from the top bar; kebab menu owns End, Swap exercise, Reorder, etc.
- Theme toggle pinned to bottom of drawer alongside version + offline-ready indicator

## Rationale

- Seven destinations is past the comfortable limit (~5) for tabs
- Bottom tabs would compete with the logger's primary action zone
- "Locking" nav during workouts enforces completion and prevents accidental exits

## Consequences

- Slightly more taps to move between top-level surfaces compared to tabs — acceptable because most sessions stay in one surface at a time
- Need a smooth drawer animation and scrim; Radix Dialog with a slide transform works
- Workout-mode chrome is a separate shell component, not a conditional branch inside the main shell
