import { uuidv4 } from "../../../lib/uuid";
import type { Program, ProgramDay, RoutineItemOverride } from "../../../../shared";

// ── Draft types ──────────────────────────────────────────────────────────────

export type DraftProgramDay = {
  id: string;
  weekIndex: number;
  dayIndex: number;
  routineId: string | null;
  isRestDay: boolean;
  notes?: string | null;
  overrides?: RoutineItemOverride[] | null;
};

export type DraftProgram = {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  days: DraftProgramDay[];
  createdAt: number;
  updatedAt: number;
};

// ── Factory helpers ──────────────────────────────────────────────────────────

export function emptyDraft(): DraftProgram {
  return {
    id: uuidv4(),
    name: "",
    description: null,
    durationWeeks: 4,
    days: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function toDraft(program: Program): DraftProgram {
  return {
    id: program.id,
    name: program.name,
    description: program.description ?? null,
    durationWeeks: program.durationWeeks,
    days: program.days.map((d: ProgramDay) => ({
      id: d.id,
      weekIndex: d.weekIndex,
      dayIndex: d.dayIndex,
      routineId: d.routineId,
      isRestDay: d.isRestDay,
      notes: d.notes ?? null,
      overrides: d.overrides ?? null,
    })),
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
  };
}

export function normalizeDraft(draft: DraftProgram): Program {
  return {
    id: draft.id,
    name: draft.name.trim(),
    description: draft.description?.trim() || null,
    durationWeeks: draft.durationWeeks,
    days: draft.days.map((d) => ({
      id: d.id,
      weekIndex: d.weekIndex,
      dayIndex: d.dayIndex,
      routineId: d.routineId ?? null,
      isRestDay: d.isRestDay,
      notes: d.notes ?? null,
      overrides: d.overrides ?? null,
    })),
    createdAt: draft.createdAt,
    updatedAt: Date.now(),
  };
}

// ── Deep-clone day with a fresh UUID ────────────────────────────────────────

function cloneDay(d: DraftProgramDay, overrides: Partial<DraftProgramDay> = {}): DraftProgramDay {
  return { ...d, id: uuidv4(), ...overrides };
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type BuilderAction =
  | { type: "SET_NAME"; name: string }
  | { type: "SET_DESCRIPTION"; description: string }
  | { type: "SET_DURATION_WEEKS"; weeks: number }
  | { type: "SET_DAY"; weekIndex: number; dayIndex: number; routineId: string | null; isRestDay: boolean; notes?: string | null; overrides?: RoutineItemOverride[] | null }
  | { type: "SET_DAY_OVERRIDES"; weekIndex: number; dayIndex: number; overrides: RoutineItemOverride[] | null; notes?: string | null }
  | { type: "CLEAR_DAY"; weekIndex: number; dayIndex: number }
  | { type: "DUPLICATE_WEEK"; sourceWeek: number; destStart: number; destEnd: number }
  | { type: "REPEAT_PATTERN"; sourceStart: number; sourceEnd: number };

export type BuilderState = {
  draft: DraftProgram;
  isDirty: boolean;
};

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "SET_NAME":
      return { ...state, isDirty: true, draft: { ...state.draft, name: action.name } };

    case "SET_DESCRIPTION":
      return {
        ...state,
        isDirty: true,
        draft: {
          ...state.draft,
          description: action.description || null,
        },
      };

    case "SET_DURATION_WEEKS": {
      const weeks = Math.max(1, Math.min(52, action.weeks));
      // Drop days that are now out-of-range
      const days = state.draft.days.filter((d) => d.weekIndex < weeks);
      return {
        ...state,
        isDirty: true,
        draft: { ...state.draft, durationWeeks: weeks, days },
      };
    }

    case "SET_DAY": {
      const { weekIndex, dayIndex, routineId, isRestDay, notes, overrides } = action;
      // Upsert: remove existing entry for this slot then add new
      const filtered = state.draft.days.filter(
        (d) => !(d.weekIndex === weekIndex && d.dayIndex === dayIndex),
      );
      // Only persist if there's something to store
      if (!routineId && !isRestDay && !notes) {
        return {
          ...state,
          isDirty: true,
          draft: { ...state.draft, days: filtered },
        };
      }
      const newDay: DraftProgramDay = {
        id: uuidv4(),
        weekIndex,
        dayIndex,
        routineId: routineId ?? null,
        isRestDay,
        notes: notes ?? null,
        overrides: overrides ?? null,
      };
      return {
        ...state,
        isDirty: true,
        draft: { ...state.draft, days: [...filtered, newDay] },
      };
    }

    case "SET_DAY_OVERRIDES": {
      const { weekIndex, dayIndex, overrides, notes } = action;
      const days = state.draft.days.map((d) =>
        d.weekIndex === weekIndex && d.dayIndex === dayIndex
          ? { ...d, overrides, ...(notes !== undefined ? { notes } : {}) }
          : d,
      );
      return { ...state, isDirty: true, draft: { ...state.draft, days } };
    }

    case "CLEAR_DAY": {
      const { weekIndex, dayIndex } = action;
      return {
        ...state,
        isDirty: true,
        draft: {
          ...state.draft,
          days: state.draft.days.filter(
            (d) => !(d.weekIndex === weekIndex && d.dayIndex === dayIndex),
          ),
        },
      };
    }

    case "DUPLICATE_WEEK": {
      const { sourceWeek, destStart, destEnd } = action;
      const sourcedays = state.draft.days.filter((d) => d.weekIndex === sourceWeek);
      // Remove all days in dest range
      const filtered = state.draft.days.filter(
        (d) => d.weekIndex < destStart || d.weekIndex > destEnd,
      );
      // Clone source week into each dest week
      const cloned: DraftProgramDay[] = [];
      for (let w = destStart; w <= destEnd; w++) {
        for (const d of sourcedays) {
          cloned.push(cloneDay(d, { weekIndex: w }));
        }
      }
      return {
        ...state,
        isDirty: true,
        draft: { ...state.draft, days: [...filtered, ...cloned] },
      };
    }

    case "REPEAT_PATTERN": {
      const { sourceStart, sourceEnd } = action;
      const patternWeeks = sourceEnd - sourceStart + 1;
      const { durationWeeks } = state.draft;
      // Remove all days outside of the source pattern
      const filtered = state.draft.days.filter(
        (d) => d.weekIndex >= sourceStart && d.weekIndex <= sourceEnd,
      );
      const cloned: DraftProgramDay[] = [];
      for (let w = sourceEnd + 1; w < durationWeeks; w++) {
        // Which week in the pattern does w correspond to?
        const patternWeekOffset = (w - sourceEnd - 1) % patternWeeks;
        const sourceWeek = sourceStart + patternWeekOffset;
        const sourcedays = state.draft.days.filter((d) => d.weekIndex === sourceWeek);
        for (const d of sourcedays) {
          cloned.push(cloneDay(d, { weekIndex: w }));
        }
      }
      return {
        ...state,
        isDirty: true,
        draft: { ...state.draft, days: [...filtered, ...cloned] },
      };
    }

    default:
      return state;
  }
}
