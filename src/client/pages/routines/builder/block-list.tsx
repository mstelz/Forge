// Uses @dnd-kit/core + @dnd-kit/sortable for pointer and touch drag-to-reorder.
import { useState, type Dispatch } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { BuilderAction, DraftBlock } from "./state";
import { SingleBlock } from "./single-block";
import { SupersetBlock } from "./superset-block";
import type { Exercise } from "../../../../shared";

type Props = {
  blocks: DraftBlock[];
  exerciseMap: Map<string, Exercise>;
  dispatch: Dispatch<BuilderAction>;
};

export function BlockList({ blocks, exerciseMap, dispatch }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Check if this is a block-level drag
    const activeBlockIdx = blocks.findIndex((b) => b.id === active.id);
    const overBlockIdx = blocks.findIndex((b) => b.id === over.id);
    if (activeBlockIdx !== -1 && overBlockIdx !== -1) {
      dispatch({ type: "REORDER_BLOCKS", from: activeBlockIdx, to: overBlockIdx });
      return;
    }

    // Check if this is an item drag within a superset
    for (const block of blocks) {
      if (block.type !== "superset") continue;
      const fromIdx = block.items.findIndex((it) => it.id === active.id);
      const toIdx = block.items.findIndex((it) => it.id === over.id);
      if (fromIdx !== -1 && toIdx !== -1) {
        dispatch({ type: "REORDER_ITEMS", blockId: block.id, from: fromIdx, to: toIdx });
        return;
      }
    }
    // Cross-block item drags are intentionally ignored.
  };

  const blockIds = blocks.map((b) => b.id);

  // Find the active block or item for the overlay
  const activeBlock = activeId ? blocks.find((b) => b.id === activeId) : null;
  const activeItem = activeId
    ? blocks.flatMap((b) => (b.type === "superset" ? b.items : [])).find((it) => it.id === activeId)
    : null;

  // Track superset order for letter assignment
  let supersetCount = 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {blocks.map((block) => {
            if (block.type === "superset") {
              const idx = supersetCount++;
              return (
                <SupersetBlock
                  key={block.id}
                  block={block}
                  supersetIndex={idx}
                  exerciseMap={exerciseMap}
                  dispatch={dispatch}
                />
              );
            }
            return (
              <SingleBlock
                key={block.id}
                block={block}
                exerciseMap={exerciseMap}
                dispatch={dispatch}
              />
            );
          })}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {activeBlock ? (
          <div className="rounded-[var(--radius-card)] bg-[var(--surface)] shadow-xl ring-2 ring-[var(--accent)]/40 opacity-90 px-4 py-3">
            <span className="text-sm font-medium text-[var(--text-muted)]">
              {activeBlock.type === "superset"
                ? `Superset · ${activeBlock.items.length} exercises`
                : (exerciseMap.get(activeBlock.items[0]?.exerciseId ?? "")?.name ?? "Exercise")}
            </span>
          </div>
        ) : activeItem ? (
          <div className="rounded-lg bg-[var(--surface-elevated)] shadow-lg ring-2 ring-amber-400/40 opacity-90 px-3 py-2">
            <span className="text-[13px] font-medium text-[var(--text-muted)]">
              {exerciseMap.get(activeItem.exerciseId)?.name ?? "Exercise"}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
