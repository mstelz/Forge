import { useMemo, useState } from "react";
import { useEquipment } from "../../../hooks/use-equipment";
import { cn } from "../../../lib/cn";
import { AddEquipmentDialog } from "./add-equipment-dialog";

type Props = {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onAdd: (id: string) => void;
};

export function EquipmentField({ selectedIds, onToggle, onAdd }: Props) {
  const { data: equipment } = useEquipment();
  const [dialogOpen, setDialogOpen] = useState(false);

  const sorted = useMemo(
    () => [...(equipment ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [equipment],
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <fieldset className="space-y-1.5">
      <legend className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Equipment
      </legend>
      <div className="flex flex-wrap gap-2">
        {sorted.map((eq) => {
          const active = selected.has(eq.id);
          return (
            <button
              key={eq.id}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(eq.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                active
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "bg-transparent text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:text-[var(--text)]",
              )}
            >
              {eq.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          aria-haspopup="dialog"
          className="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--accent)] ring-1 ring-dashed ring-[var(--accent)]/60 hover:ring-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          + Add
        </button>
      </div>
      <AddEquipmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(eq) => onAdd(eq.id)}
      />
    </fieldset>
  );
}
