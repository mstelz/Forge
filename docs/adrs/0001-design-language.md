# 0001 — Design language

**Status:** accepted · **Date:** 2026-04-23

## Context

Forge needs a visual identity that feels native and mobile-first without going through the app stores. User referenced the Android "Simple Workout Tracker" app as a vibe anchor — utilitarian, quiet, functional — but wanted something more refined.

## Decision

A quiet, utilitarian aesthetic with a single warm amber accent on a neutral base. Both light and dark themes ship day one.

## Specifics

- **Palette**
  - Dark: bg `#0B0B0C`, surface `#17181A`, border `#26272A`, text white / muted gray
  - Light: bg `#FAFAF9`, surface white, border `#E7E5E4`, text near-black / `#78716C` muted
  - Accent: warm amber `#F59E0B` — used sparingly, only on primary actions, progress, and current/active indicators
- **Typography:** Inter (variable), with oversized tabular numerics for weight/reps so they're readable mid-set
- **Shape:** 14px corner radius, 1px borders (no heavy shadows)
- **Density:** generous touch targets for thumb use, compact read-only lists where scannability matters

## Rationale

- One accent enforces visual discipline — "if it's amber, it matters"
- Oversized numerics are a functional requirement, not decorative — user reads them from arm's length mid-set
- Avoiding shadows keeps the UI quiet and renders better across pixel densities

## Consequences

- Custom primitives rather than an opinionated UI kit (shadcn, Material) — we paint Radix headless components
- Component library will need variant support for light/dark via CSS variables, not Tailwind class swaps
- Future themes (e.g. high-contrast) slot in by redefining the variable set
