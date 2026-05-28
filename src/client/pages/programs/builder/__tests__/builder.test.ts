import { describe, it, expect } from "vitest";
import { builderReducer, emptyDraft } from "../state";
import type { BuilderState, DraftProgram } from "../state";
import { normalizeDraft } from "../state";
import { ProgramCreateInput } from "../../../../../shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<DraftProgram> = {}): BuilderState {
  return {
    draft: { ...emptyDraft(), ...overrides },
    isDirty: false,
  };
}

// ─── Test 1: Duplicate week deep-clones day assignments with fresh UUIDs ──────

describe("DUPLICATE_WEEK — deep-clone with fresh UUIDs", () => {
  it("copies source week days into dest range and mints fresh UUIDs", () => {
    const state = makeState({
      durationWeeks: 4,
      days: [
        {
          id: "day-src-1",
          weekIndex: 0,
          dayIndex: 1,
          order: 0,
          routineId: "routine-abc",
          isRestDay: false,
          notes: null,
        },
        {
          id: "day-src-2",
          weekIndex: 0,
          dayIndex: 3,
          order: 0,
          routineId: null,
          isRestDay: true,
          notes: null,
        },
      ],
    });

    const next = builderReducer(state, {
      type: "DUPLICATE_WEEK",
      sourceWeek: 0,
      destStart: 1,
      destEnd: 2,
    });

    // All source days should appear in weeks 1 and 2
    const week1Days = next.draft.days.filter((d) => d.weekIndex === 1);
    const week2Days = next.draft.days.filter((d) => d.weekIndex === 2);

    expect(week1Days).toHaveLength(2);
    expect(week2Days).toHaveLength(2);

    // All IDs should be unique (no PK collisions)
    const allIds = next.draft.days.map((d) => d.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);

    // Source week IDs should not appear in dest weeks
    const destIds = [...week1Days, ...week2Days].map((d) => d.id);
    expect(destIds).not.toContain("day-src-1");
    expect(destIds).not.toContain("day-src-2");

    // Routine assignments are preserved
    const copied = week1Days.find((d) => d.dayIndex === 1);
    expect(copied?.routineId).toBe("routine-abc");
    expect(copied?.isRestDay).toBe(false);
  });

  it("overwrites any pre-existing days in the destination range", () => {
    const state = makeState({
      durationWeeks: 4,
      days: [
        { id: "src", weekIndex: 0, dayIndex: 0, order: 0, routineId: "r1", isRestDay: false, notes: null },
        // Existing day in week 1 that should be overwritten
        { id: "existing", weekIndex: 1, dayIndex: 2, order: 0, routineId: "r99", isRestDay: false, notes: null },
      ],
    });

    const next = builderReducer(state, {
      type: "DUPLICATE_WEEK",
      sourceWeek: 0,
      destStart: 1,
      destEnd: 1,
    });

    const week1Days = next.draft.days.filter((d) => d.weekIndex === 1);
    // The old week 1 day should be replaced
    expect(week1Days.every((d) => d.id !== "existing")).toBe(true);
    // Only 1 day cloned (source week 0 had 1 day)
    expect(week1Days).toHaveLength(1);
    expect(week1Days[0]?.routineId).toBe("r1");
  });
});

// ─── Test 2: Repeat-pattern tiles correctly and truncates trailing partial ─────

describe("REPEAT_PATTERN — tiles and truncates correctly", () => {
  it("tiles a 2-week pattern across remaining duration with trailing truncation", () => {
    // Program: 5 weeks. Source: weeks 0–1 (pattern = 2 weeks).
    // Should apply: w2=copy(w0), w3=copy(w1), w4=copy(w0) — partial
    const state = makeState({
      durationWeeks: 5,
      days: [
        // Week 0: Mon (dayIndex 0) has routineId "r-mon"
        { id: "w0-mon", weekIndex: 0, dayIndex: 0, order: 0, routineId: "r-mon", isRestDay: false, notes: null },
        // Week 1: Wed (dayIndex 2) has routineId "r-wed"
        { id: "w1-wed", weekIndex: 1, dayIndex: 2, order: 0, routineId: "r-wed", isRestDay: false, notes: null },
      ],
    });

    const next = builderReducer(state, {
      type: "REPEAT_PATTERN",
      sourceStart: 0,
      sourceEnd: 1,
    });

    // Week 2 should mirror week 0 (Mon: r-mon)
    const w2 = next.draft.days.filter((d) => d.weekIndex === 2);
    expect(w2).toHaveLength(1);
    expect(w2[0]?.dayIndex).toBe(0);
    expect(w2[0]?.routineId).toBe("r-mon");

    // Week 3 should mirror week 1 (Wed: r-wed)
    const w3 = next.draft.days.filter((d) => d.weekIndex === 3);
    expect(w3).toHaveLength(1);
    expect(w3[0]?.dayIndex).toBe(2);
    expect(w3[0]?.routineId).toBe("r-wed");

    // Week 4 should mirror week 0 again (trailing truncation of 2-week pattern)
    const w4 = next.draft.days.filter((d) => d.weekIndex === 4);
    expect(w4).toHaveLength(1);
    expect(w4[0]?.dayIndex).toBe(0);
    expect(w4[0]?.routineId).toBe("r-mon");

    // All resulting IDs are unique (fresh UUIDs)
    const allIds = next.draft.days.map((d) => d.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("removes days outside the source range before tiling", () => {
    const state = makeState({
      durationWeeks: 4,
      days: [
        { id: "w0", weekIndex: 0, dayIndex: 0, order: 0, routineId: "r1", isRestDay: false, notes: null },
        // This day is outside source range (week 2) — should be removed and replaced
        { id: "w2-old", weekIndex: 2, dayIndex: 0, order: 0, routineId: "old-routine", isRestDay: false, notes: null },
      ],
    });

    const next = builderReducer(state, {
      type: "REPEAT_PATTERN",
      sourceStart: 0,
      sourceEnd: 0, // pattern = 1 week
    });

    // Old week 2 day should not survive
    expect(next.draft.days.find((d) => d.id === "w2-old")).toBeUndefined();
    // Week 2 should now be a copy of week 0
    const w2 = next.draft.days.filter((d) => d.weekIndex === 2);
    expect(w2).toHaveLength(1);
    expect(w2[0]?.routineId).toBe("r1");
  });
});

// ─── Test 3: Save validates with Zod; rejects routineId + isRestDay = true ────

describe("normalizeDraft + ProgramCreateInput — Zod validation on save", () => {
  it("valid draft with sparse days parses successfully", () => {
    const state = makeState({
      name: "My Program",
      durationWeeks: 4,
      days: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          weekIndex: 0,
          dayIndex: 1,
          order: 0,
          routineId: "00000000-0000-0000-0000-000000000099",
          isRestDay: false,
          notes: null,
        },
      ],
    });

    const program = normalizeDraft(state.draft);
    const result = ProgramCreateInput.safeParse(program);
    expect(result.success).toBe(true);
  });

  it("rejects a day with both routineId set and isRestDay=true", () => {
    const state = makeState({
      name: "Bad Program",
      durationWeeks: 4,
      days: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          weekIndex: 0,
          dayIndex: 1,
          order: 0,
          routineId: "00000000-0000-0000-0000-000000000099",
          isRestDay: true, // conflicts with routineId
          notes: null,
        },
      ],
    });

    const program = normalizeDraft(state.draft);
    const result = ProgramCreateInput.safeParse(program);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.toLowerCase().includes("rest") || m.toLowerCase().includes("routine"))).toBe(true);
    }
  });

  it("rejects an empty program name", () => {
    const state = makeState({ name: "   ", durationWeeks: 4 });
    const program = normalizeDraft(state.draft);
    const result = ProgramCreateInput.safeParse(program);
    expect(result.success).toBe(false);
  });

  it("rejects durationWeeks out of range (0 and 53)", () => {
    const s0 = makeState({ name: "P", durationWeeks: 0 });
    expect(ProgramCreateInput.safeParse(normalizeDraft(s0.draft)).success).toBe(false);

    const s53 = makeState({ name: "P", durationWeeks: 53 });
    expect(ProgramCreateInput.safeParse(normalizeDraft(s53.draft)).success).toBe(false);
  });
});
