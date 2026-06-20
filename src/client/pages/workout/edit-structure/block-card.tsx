import { useState, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LiveStructureBlock } from "../../../lib/session/cursor";

// Sortable block card for the Edit Structure sheet, extracted from index.tsx (issue 09
// follow-up). Presentational + a local menu-open toggle; all structural mutations are
// emitted as a BlockAction and applied by the parent sheet.

export type BlockAction =
  | { type: "remove_block"; blockIndex: number }
  | { type: "add_set"; blockIndex: number }
  | { type: "remove_set"; blockIndex: number; slotIndex: number }
  | { type: "add_round"; blockIndex: number }
  | { type: "remove_round"; blockIndex: number }
  | { type: "swap_exercise"; blockIndex: number; itemIndex: number }
  | { type: "add_to_superset"; blockIndex: number }
  | { type: "remove_from_superset"; blockIndex: number; itemIndex: number }
  | { type: "split_superset"; blockIndex: number; splitAfterItemIndex: number }
  | { type: "convert_to_superset"; blockIndex: number }
  | { type: "convert_to_single"; blockIndex: number };

interface BlockCardProps {
  block: LiveStructureBlock;
  blockIndex: number;
  exerciseNames: Map<string, string>;
  onAction: (action: BlockAction) => void;
}

export function BlockCard({ block, blockIndex, exerciseNames, onAction }: BlockCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isSuperset = block.type === "superset";
  const roundCount = block.roundCount ?? (block.items[0]?.setTargets.length ?? 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]"
    >
      {/* Block header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab touch-none text-[var(--text-subtle)] hover:text-[var(--text-muted)] active:cursor-grabbing"
        >
          <DragHandleIcon />
        </button>

        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          {isSuperset && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
              Superset · {roundCount} round{roundCount !== 1 ? "s" : ""}
            </span>
          )}
          {block.items.map((item, itemIndex) => {
            const name = exerciseNames.get(item.exerciseId) ?? "Exercise";
            const prefix = isSuperset ? `${String.fromCharCode(65 + blockIndex)}${itemIndex + 1}. ` : "";
            return (
              <div key={item.performedExerciseId} className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-[var(--text)]">
                  {prefix}{name}
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {item.setCount} set{item.setCount !== 1 ? "s" : ""}
                </span>
                {isSuperset && (
                  <button
                    type="button"
                    onClick={() => onAction({ type: "swap_exercise", blockIndex, itemIndex })}
                    className="shrink-0 rounded px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
                  >
                    Swap
                  </button>
                )}
              </div>
            );
          })}
          {!isSuperset && block.items[0] && (
            <button
              type="button"
              onClick={() => onAction({ type: "swap_exercise", blockIndex, itemIndex: 0 })}
              className="self-start rounded px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
            >
              Swap exercise
            </button>
          )}
        </div>

        {/* Context menu button */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Block options"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
          >
            <KebabIcon />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
                role="presentation"
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
                {/* Set operations for single blocks */}
                {!isSuperset && (
                  <>
                    <MenuButton
                      onClick={() => {
                        setMenuOpen(false);
                        onAction({ type: "add_set", blockIndex });
                      }}
                    >
                      + Add set
                    </MenuButton>
                    {(block.items[0]?.setTargets.length ?? 0) > 1 && (
                      <MenuButton
                        onClick={() => {
                          setMenuOpen(false);
                          onAction({
                            type: "remove_set",
                            blockIndex,
                            slotIndex: (block.items[0]?.setTargets.length ?? 1) - 1,
                          });
                        }}
                      >
                        − Remove last set
                      </MenuButton>
                    )}
                    <MenuButton
                      onClick={() => {
                        setMenuOpen(false);
                        onAction({ type: "convert_to_superset", blockIndex });
                      }}
                    >
                      Convert to superset
                    </MenuButton>
                  </>
                )}

                {/* Superset operations */}
                {isSuperset && (
                  <>
                    <MenuButton
                      onClick={() => {
                        setMenuOpen(false);
                        onAction({ type: "add_round", blockIndex });
                      }}
                    >
                      + Add round
                    </MenuButton>
                    {roundCount > 1 && (
                      <MenuButton
                        onClick={() => {
                          setMenuOpen(false);
                          onAction({ type: "remove_round", blockIndex });
                        }}
                      >
                        − Remove last round
                      </MenuButton>
                    )}
                    <MenuButton
                      onClick={() => {
                        setMenuOpen(false);
                        onAction({ type: "add_to_superset", blockIndex });
                      }}
                    >
                      + Add exercise to superset
                    </MenuButton>
                    {block.items.length > 1 && (
                      <MenuButton
                        onClick={() => {
                          setMenuOpen(false);
                          onAction({
                            type: "split_superset",
                            blockIndex,
                            splitAfterItemIndex: 0,
                          });
                        }}
                      >
                        Split superset
                      </MenuButton>
                    )}
                    {block.items.length === 1 && (
                      <MenuButton
                        onClick={() => {
                          setMenuOpen(false);
                          onAction({ type: "convert_to_single", blockIndex });
                        }}
                      >
                        Convert to single
                      </MenuButton>
                    )}
                    {block.items.map((_, itemIndex) => (
                      <MenuButton
                        key={itemIndex}
                        onClick={() => {
                          setMenuOpen(false);
                          onAction({ type: "remove_from_superset", blockIndex, itemIndex });
                        }}
                        danger
                      >
                        Remove exercise {itemIndex + 1}
                      </MenuButton>
                    ))}
                  </>
                )}

                <div className="my-1 border-t border-[var(--border)]" />
                <MenuButton
                  onClick={() => {
                    setMenuOpen(false);
                    onAction({ type: "remove_block", blockIndex });
                  }}
                  danger
                >
                  Remove block
                </MenuButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center px-4 py-2.5 text-sm hover:bg-[var(--surface-elevated)]",
        danger ? "text-red-500" : "text-[var(--text)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function DragHandleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}
