import sys

with open("src/client/pages/workout/active.tsx", "r") as f:
    content = f.read()

# 1. Add updateSessionTimes to imports
content = content.replace(
"""  deleteSession,
  logSetBatch,
  updateSetBatch,
} from "../../db/mutations";""",
"""  deleteSession,
  logSetBatch,
  updateSetBatch,
  updateSessionTimes,
} from "../../db/mutations";"""
)

# 2. Add toDatetimeLocal and fromDatetimeLocal
content = content.replace(
"""function parseLiveStructure(json: string): LiveStructure {
  try {
    return JSON.parse(json) as LiveStructure;
  } catch {
    return { blocks: [] };
  }
}

function parseRestTimer(json: string | null | undefined): RestTimerData {""",
"""function parseLiveStructure(json: string): LiveStructure {
  try {
    return JSON.parse(json) as LiveStructure;
  } catch {
    return { blocks: [] };
  }
}

function toDatetimeLocal(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): number {
  return new Date(s).getTime();
}

function parseRestTimer(json: string | null | undefined): RestTimerData {"""
)

# 3. Update OverflowMenuProps and OverflowMenu
content = content.replace(
"""  onDiscard: () => void;
  onEditStructure: () => void;
  onPauseAndLeave: () => void;
  isReopenEdit?: boolean;
}

function OverflowMenu({ onFinish, onDiscard, onEditStructure, onPauseAndLeave, isReopenEdit }: OverflowMenuProps) {""",
"""  onDiscard: () => void;
  onEditStructure: () => void;
  onEditTime: () => void;
  onPauseAndLeave: () => void;
  isReopenEdit?: boolean;
}

function OverflowMenu({ onFinish, onDiscard, onEditStructure, onEditTime, onPauseAndLeave, isReopenEdit }: OverflowMenuProps) {"""
)

# 4. Add Edit time button in OverflowMenu
content = content.replace(
"""            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onEditStructure(); }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
            >
              Edit workout
            </button>""",
"""            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onEditStructure(); }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
            >
              Edit workout
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onEditTime(); }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
            >
              Edit time
            </button>"""
)

# 5. ActiveWorkoutPage state changes
content = content.replace(
"""export function ActiveWorkoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isReopenEdit = !!(location.state as { isReopenEdit?: boolean } | null)?.isReopenEdit;
  const originalEndedAt = (location.state as { originalEndedAt?: number } | null)?.originalEndedAt ?? null;
  const qc = useQueryClient();""",
"""export function ActiveWorkoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isReopenEdit = !!(location.state as { isReopenEdit?: boolean } | null)?.isReopenEdit;
  const [originalEndedAt, setOriginalEndedAt] = import("react").useState<number | null>(
    (location.state as { originalEndedAt?: number } | null)?.originalEndedAt ?? null
  );
  const qc = useQueryClient();

  const [editTimeOpen, setEditTimeOpen] = import("react").useState(false);
  const [editStartedAt, setEditStartedAt] = import("react").useState("");
  const [editEndedAt, setEditEndedAt] = import("react").useState("");
  const [savingTimes, setSavingTimes] = import("react").useState(false);"""
)

# 6. OverflowMenu invocation
content = content.replace(
"""        <OverflowMenu
          onFinish={() => setFinishConfirmOpen(true)}
          onDiscard={handleDiscard}
          onEditStructure={() => setStructureOpen(true)}
          onPauseAndLeave={handlePauseAndLeave}
          isReopenEdit={isReopenEdit}
        />""",
"""        <OverflowMenu
          onFinish={() => setFinishConfirmOpen(true)}
          onDiscard={handleDiscard}
          onEditStructure={() => setStructureOpen(true)}
          onEditTime={() => {
            if (session) {
              setEditStartedAt(toDatetimeLocal(session.startedAt));
              if (isReopenEdit && originalEndedAt != null) {
                setEditEndedAt(toDatetimeLocal(originalEndedAt));
              } else {
                setEditEndedAt("");
              }
              setEditTimeOpen(true);
            }
          }}
          onPauseAndLeave={handlePauseAndLeave}
          isReopenEdit={isReopenEdit}
        />"""
)

# 7. Edit Time Modal
modal_str = """
      {/* Edit Time Modal */}
      {editTimeOpen ? (
        <Dialog open={editTimeOpen} onOpenChange={setEditTimeOpen}>
          <DialogPortal>
            <DialogOverlay className="fixed inset-0 z-50 bg-black/50" />
            <DialogContent className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[var(--surface)] p-5 shadow-xl">
              <DialogTitle className="text-lg font-bold text-[var(--text)] mb-4">Edit Workout Time</DialogTitle>
              <DialogDescription className="sr-only">Edit the start and end time of this workout.</DialogDescription>
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    Start Time
                  </label>
                  <input
                    type="datetime-local"
                    value={editStartedAt}
                    onChange={(e) => setEditStartedAt(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
                {isReopenEdit && originalEndedAt != null && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      End Time
                    </label>
                    <input
                      type="datetime-local"
                      value={editEndedAt}
                      onChange={(e) => setEditEndedAt(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                )}
                <div className="pt-2 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setEditTimeOpen(false)}
                    className="rounded-full bg-[var(--surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingTimes}
                    onClick={async () => {
                      if (!editStartedAt || !session) return;
                      setSavingTimes(true);
                      try {
                        const newStart = fromDatetimeLocal(editStartedAt);
                        const newEnd = isReopenEdit && editEndedAt ? fromDatetimeLocal(editEndedAt) : null;
                        
                        await updateSessionTimes(session.id, newStart, null); // endedAt is null while active
                        
                        if (isReopenEdit && newEnd != null) {
                          setOriginalEndedAt(newEnd);
                        }
                        qc.invalidateQueries({ queryKey: queryKeys.sessions.active() });
                        setEditTimeOpen(false);
                      } finally {
                        setSavingTimes(false);
                      }
                    }}
                    className="rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-[var(--accent-fg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
                  >
                    {savingTimes ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </DialogPortal>
        </Dialog>
      ) : null}
    </div>
  );
}"""

content = content.replace("    </div>\n  );\n}\n", modal_str + "\n")

with open("src/client/pages/workout/active.tsx", "w") as f:
    f.write(content)
