import * as Popover from "@radix-ui/react-popover";
import { NoteIcon } from "../icons";

/**
 * Marks a set that has a note and lets it be read in place — without this the
 * only way to find a note again is to reopen the set and its note field.
 */
export function SetNoteButton({
  setNumber,
  note,
  className = "",
}: {
  setNumber: number;
  note: string;
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Read note for set ${setNumber}`}
        className={`flex h-8 w-8 items-center justify-center rounded-md text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] data-[state=open]:bg-[var(--surface-elevated)] ${className}`}
      >
        <NoteIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className="z-50 w-60 max-w-[calc(100vw-24px)] rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] px-3 py-2.5 shadow-lg"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">
            Set {setNumber} note
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text)]">{note}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
