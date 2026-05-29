import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import type { Equipment } from "../../../shared";
import { forgeDB } from "../../db/forge-db";
import { updateEquipment } from "../../db/mutations";

type Props = {
  equipment: Equipment;
  referenceCount: number;
  onRequestDelete: () => void;
};

export function EquipmentRow({ equipment, referenceCount, onRequestDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(equipment.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(equipment.name);
      setError(null);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, equipment.name]);

  const cancel = () => {
    setEditing(false);
    setError(null);
    setDraft(equipment.name);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    if (trimmed === equipment.name) {
      setEditing(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const lower = trimmed.toLowerCase();
      const all = await forgeDB.equipment.toArray();
      const conflict = all.some(
        (eq) => eq.id !== equipment.id && eq.name.trim().toLowerCase() === lower,
      );
      if (conflict) {
        setError("An equipment with that name already exists");
        setPending(false);
        return;
      }
      await updateEquipment({
        ...equipment,
        name: trimmed,
        updatedAt: Date.now(),
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--border)]">
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-1">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => void save()}
              maxLength={100}
              aria-invalid={!!error}
              aria-label={`Rename ${equipment.name}`}
              disabled={pending}
              className="w-full rounded-[8px] bg-[var(--surface-elevated)] px-2 py-1 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--accent)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            {error ? (
              <p className="text-xs text-[var(--danger)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <Link
            to={`/equipment/${equipment.id}`}
            className="flex-1 min-w-0 block"
          >
            <p className="truncate text-sm font-semibold text-[var(--text)]">{equipment.name}</p>
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">
              {referenceCount} {referenceCount === 1 ? "exercise" : "exercises"}
            </p>
          </Link>
        )}
      </div>
      {editing ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${equipment.name}`}
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
                onSelect={() => setEditing(true)}
                className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--text)] outline-none data-[highlighted]:bg-[var(--surface)]"
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onRequestDelete}
                className="cursor-pointer rounded-[8px] px-3 py-2 text-sm text-[var(--danger)] outline-none data-[highlighted]:bg-[var(--surface)]"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      )}
    </div>
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
