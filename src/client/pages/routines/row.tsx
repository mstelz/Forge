import { useState } from "react";
import { Link } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import type { Routine } from "../../../shared";
import { deleteRoutine } from "../../db/mutations";
import { DeleteRoutineDialog } from "./delete-dialog";

type Props = {
  routine: Routine;
};

export function RoutineRow({ routine }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const blockCount = routine.blocks.length;
  const secondaryParts: string[] = [`${blockCount} block${blockCount === 1 ? "" : "s"}`];
  if (routine.estimatedDurationMin != null) {
    secondaryParts.push(`~${routine.estimatedDurationMin} min`);
  }
  const secondary = secondaryParts.join(" · ");

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
      <div className="flex items-center gap-1 rounded-[var(--radius-card)] bg-[var(--surface)] transition-colors hover:bg-[var(--surface-elevated)]">
        <Link
          to={`/routines/${routine.id}`}
          aria-label={`${routine.name}, ${secondary}`}
          className="flex min-w-0 flex-1 flex-col px-3 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
        >
          <span className="truncate text-[15px] font-semibold text-[var(--text)]">
            {routine.name}
          </span>
          <span className="truncate text-xs text-[var(--text-muted)]">{secondary}</span>
        </Link>
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

function KebabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
