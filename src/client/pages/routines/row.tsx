import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import type { Routine } from "../../../shared";
import { deleteRoutine, createSession } from "../../db/mutations";
import { queryKeys } from "../../db/query-keys";
import { uuidv4 } from "../../lib/uuid";
import { useExercises } from "../../hooks/use-exercises";
import { useActiveSession } from "../../hooks/use-sessions";
import { buildLiveStructure } from "../workout/start";
import type { Session } from "../../../shared";
import { DeleteRoutineDialog } from "./delete-dialog";

type Props = {
  routine: Routine;
};

export function RoutineRow({ routine }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: exercises } = useExercises();
  const { data: activeSession } = useActiveSession();

  const [expanded, setExpanded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const exerciseMap = new Map(exercises?.map((e) => [e.id, e.name]) ?? []);

  const blockCount = routine.blocks.length;
  const secondaryParts: string[] = [`${blockCount} block${blockCount === 1 ? "" : "s"}`];
  if (routine.estimatedDurationMin != null) {
    secondaryParts.push(`~${routine.estimatedDurationMin} min`);
  }
  const secondary = secondaryParts.join(" · ");

  const handleStart = async () => {
    if (starting) return;
    if (activeSession) {
      navigate("/workout/active");
      return;
    }
    setStarting(true);
    try {
      const now = Date.now();
      const session: Session = {
        id: uuidv4(),
        status: "in_progress",
        sourceType: "routine",
        sourceRoutineId: routine.id,
        sourceProgramId: null,
        sourceProgramWeekIndex: null,
        sourceProgramDayIndex: null,
        templateSnapshot: JSON.stringify(routine),
        liveStructure: JSON.stringify(buildLiveStructure(routine)),
        restTimer: null,
        title: routine.name,
        notes: null,
        startedAt: now,
        endedAt: null,
        pausedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await createSession(session);
      qc.setQueryData(queryKeys.sessions.active(), session);
      navigate("/workout/active");
    } finally {
      setStarting(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteRoutine(routine.id);
      setDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="rounded-[var(--radius-card)] bg-[var(--surface)] overflow-hidden">
        {/* Main row */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset hover:bg-[var(--surface-elevated)] transition-colors"
          >
            <div className="min-w-0 flex-1">
              <span className="truncate text-[15px] font-semibold text-[var(--text)] block">
                {routine.name}
              </span>
              <span className="truncate text-xs text-[var(--text-muted)] block">{secondary}</span>
            </div>
            <ChevronIcon expanded={expanded} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Routine actions"
              className="mr-1 shrink-0 rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <KebabIcon />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="z-50 min-w-[140px] rounded-[var(--radius-card)] bg-[var(--surface-elevated)] p-1 ring-1 ring-[var(--border)]"
              >
                <DropdownMenuItem asChild>
                  <Link
                    to={`/routines/${routine.id}`}
                    className="block cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--text)] outline-none data-[highlighted]:bg-[var(--surface)]"
                  >
                    Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setDialogOpen(true)}
                  className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--danger)] outline-none data-[highlighted]:bg-[var(--surface)]"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-[var(--border)] px-3 pb-3 pt-2">
            {/* Exercise list */}
            {routine.blocks.length > 0 ? (
              <ul className="mb-3 divide-y divide-[var(--border)]">
                {routine.blocks.map((block, bi) => (
                  <li key={block.id ?? bi} className="py-2 first:pt-1">
                    {block.type === "superset" && (
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                        Superset · {block.roundCount ?? 1} rounds
                      </p>
                    )}
                    <ul className="space-y-1">
                      {block.items.map((item, ii) => {
                        const name = exerciseMap.get(item.exerciseId) ?? "Unknown exercise";
                        const sets = block.type === "superset"
                          ? block.roundCount ?? 1
                          : item.setCount;
                        const repsLabel =
                          item.repMode === "uniform" && item.uniformReps != null
                            ? `${sets}×${item.uniformReps}`
                            : item.repMode === "uniform" && item.uniformRepsMin != null && item.uniformRepsMax != null
                              ? `${sets}×${item.uniformRepsMin}–${item.uniformRepsMax}`
                              : `${sets} sets`;
                        return (
                          <li key={item.id ?? ii} className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm text-[var(--text)]">{name}</span>
                            <span className="shrink-0 text-xs text-[var(--text-muted)]">{repsLabel}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-xs text-[var(--text-muted)]">No exercises added yet.</p>
            )}

            {/* Start button */}
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={starting}
              className="w-full rounded-lg bg-[var(--accent)] py-2 text-sm font-semibold text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {starting ? "Starting…" : activeSession ? "Resume active workout" : "Start workout"}
            </button>
          </div>
        )}
      </div>

      <DeleteRoutineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        routineName={routine.name}
        onConfirm={() => void handleConfirmDelete()}
        pending={deleting}
      />
    </>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 text-[var(--text-subtle)] transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
