import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router";

type Props = {
  exerciseId: string;
  onDelete: () => void;
};

export function DetailMenu({ exerciseId, onDelete }: Props) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Exercise actions"
        className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <KebabIcon />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="z-50 min-w-[140px] rounded-[var(--radius-card)] bg-[var(--surface-elevated)] p-1 ring-1 ring-[var(--border)]"
        >
          <DropdownMenuItem
            onSelect={() => navigate(`/exercises/${exerciseId}/edit`)}
            className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--text)] outline-none data-[highlighted]:bg-[var(--surface)]"
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--danger)] outline-none data-[highlighted]:bg-[var(--surface)]"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
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
