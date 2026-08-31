import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import type { Equipment } from "../../../shared";
import type { AppShellOutletContext } from "../../layouts/app-shell";
import { useEquipment } from "../../hooks/use-equipment";
import { deleteEquipmentWithFanout } from "../../db/mutations";
import { restoreEquipment } from "../../db/undo";
import { useUndoToast } from "../../components/toast";
import { useEquipmentReferenceCounts } from "./use-reference-counts";
import { EquipmentRow } from "./row";
import { CreateEquipmentDialog } from "./create-dialog";

export function EquipmentListPage() {
  const { openDrawer } = useOutletContext<AppShellOutletContext>();
  const { data: equipment, isLoading } = useEquipment();
  const { data: refCounts } = useEquipmentReferenceCounts();
  const undoToast = useUndoToast();

  const [createOpen, setCreateOpen] = useState(false);

  const sorted = useMemo(
    () => [...(equipment ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [equipment],
  );

  const refCount = (id: string) => refCounts?.get(id) ?? 0;

  // Deleting equipment also strips it from the exercises that referenced it.
  // The fanout hands back those exercises so the undo can re-attach them —
  // without that the equipment would come back orphaned.
  const handleDelete = async (item: Equipment) => {
    const { affected, touchedExercises } = await deleteEquipmentWithFanout(item.id);
    const suffix =
      affected > 0
        ? ` and removed it from ${affected} exercise${affected === 1 ? "" : "s"}`
        : "";
    undoToast(
      `Deleted ${item.name}${suffix}`,
      () => void restoreEquipment(item, touchedExercises),
    );
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={openDrawer}
          aria-label="Open navigation"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <HamburgerIcon />
        </button>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
          Equipment
        </h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label="Add equipment"
          className="rounded-md p-2 text-[var(--accent)] hover:text-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <PlusIcon />
        </button>
      </header>

      <main className="flex-1 px-4 pt-2 pb-8">
        {isLoading ? (
          <Skeleton />
        ) : sorted.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <ul className="space-y-2">
            {sorted.map((eq) => (
              <li key={eq.id}>
                <EquipmentRow
                  equipment={eq}
                  referenceCount={refCount(eq.id)}
                  onRequestDelete={() => void handleDelete(eq)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <CreateEquipmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-base font-semibold text-[var(--text)]">No equipment yet</p>
      <p className="text-sm text-[var(--text-muted)]">
        Add equipment to associate with your exercises.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        Add equipment
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="h-14 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]"
        />
      ))}
    </ul>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
