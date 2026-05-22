import { uuidv4 } from "../../../lib/uuid";
import type {
  Routine,
  RoutineBlock,
  RoutineItem,
  SetTarget,
  SetType,
} from "../../../../shared";

// ── Draft types (same shape as Routine but partial for in-progress edits) ──

export type DraftSetTarget = Omit<SetTarget, "id" | "order"> & { id: string };
export type DraftItem = Omit<RoutineItem, "id" | "order"> & { id: string };
export type DraftBlock = Omit<RoutineBlock, "id" | "order" | "items"> & {
  id: string;
  items: DraftItem[];
};
export type DraftRoutine = Omit<Routine, "id" | "createdAt" | "updatedAt" | "blocks"> & {
  id: string;
  createdAt: number;
  updatedAt: number;
  blocks: DraftBlock[];
};

// ── Default prescription for a new item ──

export function defaultItem(exerciseId: string): DraftItem {
  return {
    id: uuidv4(),
    exerciseId,
    setCount: 3,
    repMode: "uniform",
    rpeMode: "uniform",
    setTypeMode: "uniform",
    uniformReps: 10,
    uniformSetType: "normal",
    notes: null,
  };
}

export function defaultSingleBlock(exerciseId: string): DraftBlock {
  return {
    id: uuidv4(),
    type: "single",
    roundCount: null,
    restSec: null,
    tempo: null,
    notes: null,
    items: [defaultItem(exerciseId)],
  };
}

export function defaultSupersetBlock(exerciseIds: [string, string]): DraftBlock {
  return {
    id: uuidv4(),
    type: "superset",
    roundCount: 3,
    restSec: null,
    tempo: null,
    notes: null,
    items: exerciseIds.map((id) => defaultItem(id)),
  };
}

// ── Resize setTargets when setCount changes ──

export function resizeSetTargets(
  current: DraftSetTarget[] | undefined,
  newCount: number,
  item: DraftItem,
): DraftSetTarget[] {
  const existing = current ?? [];
  if (existing.length === newCount) return existing;

  if (existing.length > newCount) {
    return existing.slice(0, newCount);
  }

  // Grow: clone last entry (or build from uniform values)
  const last = existing[existing.length - 1];
  const template: DraftSetTarget = last ?? {
    id: uuidv4(),
    reps: item.uniformReps,
    repsMin: item.uniformRepsMin,
    repsMax: item.uniformRepsMax,
    rpe: item.uniformRpe,
    setType: (item.uniformSetType as SetType | undefined) ?? "normal",
  };

  const appended: DraftSetTarget[] = [];
  for (let i = existing.length; i < newCount; i++) {
    appended.push({ ...template, id: uuidv4() });
  }
  return [...existing, ...appended];
}

// ── Normalise order fields for final save ──

export function normalizeDraft(draft: DraftRoutine): Routine {
  const now = Date.now();
  return {
    id: draft.id,
    name: draft.name.trim(),
    notes: draft.notes ?? null,
    estimatedDurationMin: draft.estimatedDurationMin ?? null,
    createdAt: draft.createdAt,
    updatedAt: now,
    blocks: draft.blocks.map((b, bi) => ({
      id: b.id,
      type: b.type,
      order: bi,
      roundCount: b.roundCount ?? null,
      restSec: b.restSec ?? null,
      tempo: b.tempo ?? null,
      notes: b.notes ?? null,
      items: b.items.map((it, ii) => ({
        id: it.id,
        exerciseId: it.exerciseId,
        order: ii,
        setCount: it.setCount,
        repMode: it.repMode,
        rpeMode: it.rpeMode,
        setTypeMode: it.setTypeMode,
        uniformReps: it.uniformReps,
        uniformRepsMin: it.uniformRepsMin,
        uniformRepsMax: it.uniformRepsMax,
        uniformRpe: it.uniformRpe,
        uniformSetType: it.uniformSetType,
        setTargets: it.setTargets?.map((st, si) => ({ ...st, order: si })),
        durationSec: it.durationSec,
        durationMinSec: it.durationMinSec,
        durationMaxSec: it.durationMaxSec,
        notes: it.notes ?? null,
      })),
    })),
  } as unknown as Routine;
}

// ── Actions ──

export type BuilderAction =
  | { type: "SET_NAME"; name: string }
  | { type: "SET_NOTES"; notes: string }
  | { type: "SET_DURATION"; minutes: number | null }
  | { type: "ADD_SINGLE_BLOCK"; exerciseId: string }
  | { type: "BEGIN_SUPERSET"; firstExerciseId: string }
  | { type: "COMPLETE_SUPERSET"; secondExerciseId: string }
  | { type: "REMOVE_BLOCK"; blockId: string }
  | { type: "REORDER_BLOCKS"; from: number; to: number }
  | { type: "REORDER_ITEMS"; blockId: string; from: number; to: number }
  | { type: "REPLACE_EXERCISE"; blockId: string; itemId: string; exerciseId: string }
  | { type: "ADD_ITEM_TO_SUPERSET"; blockId: string; exerciseId: string }
  | { type: "REMOVE_ITEM"; blockId: string; itemId: string }
  | { type: "SET_BLOCK_ROUND_COUNT"; blockId: string; roundCount: number }
  | { type: "SET_BLOCK_REST"; blockId: string; restSec: number | null }
  | { type: "SET_BLOCK_TEMPO"; blockId: string; tempo: string }
  | { type: "SET_BLOCK_NOTES"; blockId: string; notes: string }
  | { type: "SET_ITEM_SET_COUNT"; blockId: string; itemId: string; setCount: number }
  | { type: "SET_ITEM_REP_MODE"; blockId: string; itemId: string; mode: "uniform" | "per_set" }
  | { type: "SET_ITEM_RPE_MODE"; blockId: string; itemId: string; mode: "uniform" | "per_set" }
  | { type: "SET_ITEM_SET_TYPE_MODE"; blockId: string; itemId: string; mode: "uniform" | "per_set" }
  | { type: "SET_UNIFORM_REPS"; blockId: string; itemId: string; reps: number | undefined }
  | { type: "SET_UNIFORM_REPS_RANGE"; blockId: string; itemId: string; min: number | undefined; max: number | undefined }
  | { type: "SET_UNIFORM_RPE"; blockId: string; itemId: string; rpe: number | undefined }
  | { type: "SET_UNIFORM_SET_TYPE"; blockId: string; itemId: string; setType: SetType }
  | { type: "SET_DURATION_SEC"; blockId: string; itemId: string; sec: number | undefined }
  | { type: "SET_DURATION_RANGE"; blockId: string; itemId: string; min: number | undefined; max: number | undefined }
  | { type: "SET_ITEM_NOTES"; blockId: string; itemId: string; notes: string }
  | { type: "SET_SET_TARGET_REPS"; blockId: string; itemId: string; setIndex: number; reps: number | undefined }
  | { type: "SET_SET_TARGET_REPS_RANGE"; blockId: string; itemId: string; setIndex: number; min: number | undefined; max: number | undefined }
  | { type: "SET_SET_TARGET_RPE"; blockId: string; itemId: string; setIndex: number; rpe: number | undefined }
  | { type: "SET_SET_TARGET_SET_TYPE"; blockId: string; itemId: string; setIndex: number; setType: SetType }
  | { type: "SET_SET_TARGET_NOTES"; blockId: string; itemId: string; setIndex: number; notes: string };

// Pending superset state (after first exercise chosen, before second)
export type BuilderPendingSuperset = { pendingBlockId: string; firstExerciseId: string } | null;

export type BuilderState = {
  draft: DraftRoutine;
  pendingSuperset: BuilderPendingSuperset;
  isDirty: boolean;
};

function mapBlock(state: BuilderState, blockId: string, fn: (b: DraftBlock) => DraftBlock): BuilderState {
  return {
    ...state,
    isDirty: true,
    draft: {
      ...state.draft,
      blocks: state.draft.blocks.map((b) => (b.id === blockId ? fn(b) : b)),
    },
  };
}

function mapItem(state: BuilderState, blockId: string, itemId: string, fn: (it: DraftItem) => DraftItem): BuilderState {
  return mapBlock(state, blockId, (b) => ({
    ...b,
    items: b.items.map((it) => (it.id === itemId ? fn(it) : it)),
  }));
}

function syncSetTargets(item: DraftItem): DraftItem {
  const anyPerSet = item.repMode === "per_set" || item.rpeMode === "per_set" || item.setTypeMode === "per_set";
  if (!anyPerSet) {
    return { ...item, setTargets: undefined };
  }
  const targets = resizeSetTargets(item.setTargets as DraftSetTarget[] | undefined, item.setCount, item);
  // Strip fields that must be absent when their axis is in uniform mode
  const cleaned: DraftSetTarget[] = targets.map((t) => {
    const out: DraftSetTarget = {
      id: t.id,
      setType: t.setType ?? (item.uniformSetType as SetType | undefined) ?? "normal",
      techniqueNotes: t.techniqueNotes,
    };
    if (item.repMode === "per_set") {
      out.reps = t.reps;
      out.repsMin = t.repsMin;
      out.repsMax = t.repsMax;
    }
    if (item.rpeMode === "per_set") {
      out.rpe = t.rpe;
    }
    return out;
  });
  return { ...item, setTargets: cleaned as RoutineItem["setTargets"] };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "SET_NAME":
      return { ...state, isDirty: true, draft: { ...state.draft, name: action.name } };

    case "SET_NOTES":
      return { ...state, isDirty: true, draft: { ...state.draft, notes: action.notes } };

    case "SET_DURATION":
      return { ...state, isDirty: true, draft: { ...state.draft, estimatedDurationMin: action.minutes } };

    case "ADD_SINGLE_BLOCK": {
      const block = defaultSingleBlock(action.exerciseId);
      return {
        ...state,
        isDirty: true,
        draft: { ...state.draft, blocks: [...state.draft.blocks, block] },
      };
    }

    case "BEGIN_SUPERSET": {
      const pendingBlockId = uuidv4();
      return {
        ...state,
        pendingSuperset: { pendingBlockId, firstExerciseId: action.firstExerciseId },
      };
    }

    case "COMPLETE_SUPERSET": {
      if (!state.pendingSuperset) return state;
      const { pendingBlockId, firstExerciseId } = state.pendingSuperset;
      const block = defaultSupersetBlock([firstExerciseId, action.secondExerciseId]);
      const blockWithId = { ...block, id: pendingBlockId };
      return {
        ...state,
        pendingSuperset: null,
        isDirty: true,
        draft: { ...state.draft, blocks: [...state.draft.blocks, blockWithId] },
      };
    }

    case "REMOVE_BLOCK":
      return {
        ...state,
        isDirty: true,
        draft: { ...state.draft, blocks: state.draft.blocks.filter((b) => b.id !== action.blockId) },
      };

    case "REORDER_BLOCKS": {
      const blocks = [...state.draft.blocks];
      const [moved] = blocks.splice(action.from, 1);
      blocks.splice(action.to, 0, moved!);
      return { ...state, isDirty: true, draft: { ...state.draft, blocks } };
    }

    case "REORDER_ITEMS":
      return mapBlock(state, action.blockId, (b) => {
        const items = [...b.items];
        const [moved] = items.splice(action.from, 1);
        items.splice(action.to, 0, moved!);
        return { ...b, items };
      });

    case "REPLACE_EXERCISE":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        exerciseId: action.exerciseId,
      }));

    case "ADD_ITEM_TO_SUPERSET":
      return mapBlock(state, action.blockId, (b) => ({
        ...b,
        items: [...b.items, defaultItem(action.exerciseId)],
      }));

    case "REMOVE_ITEM":
      return mapBlock(state, action.blockId, (b) => ({
        ...b,
        items: b.items.filter((it) => it.id !== action.itemId),
      }));

    case "SET_BLOCK_ROUND_COUNT":
      return mapBlock(state, action.blockId, (b) => ({ ...b, roundCount: action.roundCount }));

    case "SET_BLOCK_REST":
      return mapBlock(state, action.blockId, (b) => ({ ...b, restSec: action.restSec }));

    case "SET_BLOCK_TEMPO":
      return mapBlock(state, action.blockId, (b) => ({ ...b, tempo: action.tempo }));

    case "SET_BLOCK_NOTES":
      return mapBlock(state, action.blockId, (b) => ({ ...b, notes: action.notes }));

    case "SET_ITEM_SET_COUNT":
      return mapItem(state, action.blockId, action.itemId, (it) => {
        const updated = { ...it, setCount: action.setCount };
        return syncSetTargets(updated);
      });

    case "SET_ITEM_REP_MODE":
      return mapItem(state, action.blockId, action.itemId, (it) => {
        const updated = { ...it, repMode: action.mode };
        if (action.mode === "per_set") {
          // Clone uniform value into all set targets
          const targets = resizeSetTargets(it.setTargets as DraftSetTarget[] | undefined, it.setCount, it);
          const withReps = targets.map((t) => ({
            ...t,
            reps: it.uniformReps ?? t.reps,
            repsMin: it.uniformRepsMin ?? t.repsMin,
            repsMax: it.uniformRepsMax ?? t.repsMax,
          }));
          return syncSetTargets({ ...updated, setTargets: withReps as RoutineItem["setTargets"] });
        }
        return syncSetTargets(updated);
      });

    case "SET_ITEM_RPE_MODE":
      return mapItem(state, action.blockId, action.itemId, (it) => {
        const updated = { ...it, rpeMode: action.mode };
        if (action.mode === "per_set") {
          const targets = resizeSetTargets(it.setTargets as DraftSetTarget[] | undefined, it.setCount, it);
          const withRpe = targets.map((t) => ({ ...t, rpe: it.uniformRpe ?? t.rpe }));
          return syncSetTargets({ ...updated, setTargets: withRpe as RoutineItem["setTargets"] });
        }
        return syncSetTargets(updated);
      });

    case "SET_ITEM_SET_TYPE_MODE":
      return mapItem(state, action.blockId, action.itemId, (it) => {
        const updated = { ...it, setTypeMode: action.mode };
        if (action.mode === "per_set") {
          const targets = resizeSetTargets(it.setTargets as DraftSetTarget[] | undefined, it.setCount, it);
          const withType = targets.map((t) => ({ ...t, setType: it.uniformSetType ?? t.setType ?? "normal" as SetType }));
          return syncSetTargets({ ...updated, setTargets: withType as RoutineItem["setTargets"] });
        }
        return syncSetTargets(updated);
      });

    case "SET_UNIFORM_REPS":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        uniformReps: action.reps,
        uniformRepsMin: undefined,
        uniformRepsMax: undefined,
      }));

    case "SET_UNIFORM_REPS_RANGE":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        uniformReps: undefined,
        uniformRepsMin: action.min,
        uniformRepsMax: action.max,
      }));

    case "SET_UNIFORM_RPE":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        uniformRpe: action.rpe,
      }));

    case "SET_UNIFORM_SET_TYPE":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        uniformSetType: action.setType,
      }));

    case "SET_DURATION_SEC":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        durationSec: action.sec,
        durationMinSec: undefined,
        durationMaxSec: undefined,
      }));

    case "SET_DURATION_RANGE":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        durationSec: undefined,
        durationMinSec: action.min,
        durationMaxSec: action.max,
      }));

    case "SET_ITEM_NOTES":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        notes: action.notes,
      }));

    case "SET_SET_TARGET_REPS":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        setTargets: (it.setTargets ?? []).map((t, i) =>
          i === action.setIndex ? { ...t, reps: action.reps, repsMin: undefined, repsMax: undefined } : t,
        ),
      }));

    case "SET_SET_TARGET_REPS_RANGE":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        setTargets: (it.setTargets ?? []).map((t, i) =>
          i === action.setIndex ? { ...t, reps: undefined, repsMin: action.min, repsMax: action.max } : t,
        ),
      }));

    case "SET_SET_TARGET_RPE":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        setTargets: (it.setTargets ?? []).map((t, i) =>
          i === action.setIndex ? { ...t, rpe: action.rpe } : t,
        ),
      }));

    case "SET_SET_TARGET_SET_TYPE":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        setTargets: (it.setTargets ?? []).map((t, i) =>
          i === action.setIndex ? { ...t, setType: action.setType } : t,
        ),
      }));

    case "SET_SET_TARGET_NOTES":
      return mapItem(state, action.blockId, action.itemId, (it) => ({
        ...it,
        setTargets: (it.setTargets ?? []).map((t, i) =>
          i === action.setIndex ? { ...t, techniqueNotes: action.notes } : t,
        ),
      }));

    default:
      return state;
  }
}
