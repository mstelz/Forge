import { useEffect, useRef, useState } from "react";
import { InfoIcon, NoteIcon, PlusSmIcon, TrashIcon } from "../icons";
import { LastTimeLine } from "./last-time";
import { SetRow, type SetRowState } from "./set-row";
import { doneSlotKeys, supersetRoundCount } from "./structure";
import type { Session, SessionSetLog } from "../../../../shared";
import type { CursorPos, LiveBlock, PlannedSlot } from "./types";

// ─── Superset round pips ──────────────────────────────────────────────────────

function SupersetRoundPips({
  block,
  blockIdx,
  logs,
  cursor,
  roundCount,
}: {
  block: LiveBlock;
  blockIdx: number;
  logs: SessionSetLog[];
  cursor: CursorPos | null;
  roundCount: number;
}) {
  const doneIds = doneSlotKeys(logs);

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: roundCount }).map((_, round) => {
        const allDoneInRound = block.items.every((item) => {
          const slot = item.setTargets[round];
          return slot ? doneIds.has(`${item.performedExerciseId}:${slot.id}`) : false;
        });
        const isCurrentRound =
          cursor?.blockIdx === blockIdx && cursor?.slotIdx === round;

        return (
          <span
            key={round}
            className={[
              "h-2 w-2 rounded-full transition-colors",
              allDoneInRound
                ? "bg-[var(--text-muted)]"
                : isCurrentRound
                  ? "bg-[var(--accent)]"
                  : "border border-[var(--border)] bg-transparent",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}

// ─── Exercise Card ────────────────────────────────────────────────────────────

export interface ExerciseCardProps {
  block: LiveBlock;
  blockIdx: number;
  session: Session;
  logs: SessionSetLog[];
  cursor: CursorPos | null;
  exerciseNames: Map<string, string>;
  onSlotTap: (blockIdx: number, itemIdx: number, slotIdx: number, isExtra?: boolean) => void;
  onAddSet: (blockIdx: number, itemIdx: number) => void;
  onDeleteSlot: (blockIdx: number, itemIdx: number, slotIdx: number) => void;
  onDeleteExtraLog: (logId: string) => void;
  onSaveBlockNote: (note: string | null) => void;
  onViewHistory: (exerciseId: string, exerciseName: string) => void;
  onViewInfo: (exerciseId: string, exerciseName: string) => void;
}

export function ExerciseCard({
  block,
  blockIdx,
  session,
  logs,
  cursor,
  exerciseNames,
  onSlotTap,
  onAddSet,
  onDeleteSlot,
  onDeleteExtraLog,
  onSaveBlockNote,
  onViewHistory,
  onViewInfo,
}: ExerciseCardProps) {
  const [blockNoteOpen, setBlockNoteOpen] = useState(!!block.notes);
  const [blockNoteText, setBlockNoteText] = useState(block.notes ?? "");

  // Arm-to-confirm delete: first tap arms the button, second tap (within 2s) deletes.
  type ArmedDelete =
    | { type: "slot"; blockIdx: number; itemIdx: number; slotIdx: number }
    | { type: "extra"; logId: string };
  const [armedDelete, setArmedDelete] = useState<ArmedDelete | null>(null);
  const armedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armDelete = (target: ArmedDelete) => {
    if (armedTimerRef.current) clearTimeout(armedTimerRef.current);
    setArmedDelete(target);
    armedTimerRef.current = setTimeout(() => setArmedDelete(null), 2000);
  };

  const isArmed = (target: ArmedDelete): boolean => {
    if (!armedDelete) return false;
    if (armedDelete.type !== target.type) return false;
    if (target.type === "slot" && armedDelete.type === "slot") {
      return armedDelete.blockIdx === target.blockIdx && armedDelete.itemIdx === target.itemIdx && armedDelete.slotIdx === target.slotIdx;
    }
    if (target.type === "extra" && armedDelete.type === "extra") {
      return armedDelete.logId === target.logId;
    }
    return false;
  };

  useEffect(() => () => { if (armedTimerRef.current) clearTimeout(armedTimerRef.current); }, []);

  // Keep local state in sync if the block note changes externally
  useEffect(() => {
    setBlockNoteText(block.notes ?? "");
    if (block.notes) setBlockNoteOpen(true);
  }, [block.notes]);
  const isSuperset = block.type === "superset";
  const supersetLabel = `SUPERSET ${String.fromCharCode(65 + blockIdx)}`;
  const roundCount = isSuperset ? supersetRoundCount(block) : 0;

  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--surface)] px-4 py-4">
      {isSuperset && (
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded bg-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
            {supersetLabel}
          </span>
          <SupersetRoundPips
            block={block}
            blockIdx={blockIdx}
            logs={logs}
            cursor={cursor}
            roundCount={roundCount}
          />
        </div>
      )}

      {block.items.map((item, itemIdx) => {
        const name = exerciseNames.get(item.exerciseId) ?? "Exercise";
        const prefix = isSuperset
          ? `${String.fromCharCode(65 + blockIdx)}${itemIdx + 1}. `
          : "";

        // Build a map of plannedSetId → log for this specific exercise item
        const logMap = new Map<string, SessionSetLog>();
        for (const log of logs) {
          if (log.performedExerciseId === item.performedExerciseId && log.plannedSetId) {
            logMap.set(log.plannedSetId, log);
          }
        }

        const extraLogs = logs
          .filter((l) => l.performedExerciseId === item.performedExerciseId && l.status === "extra" && l.plannedSetId == null)
          .sort((a, b) => a.loggedAt - b.loggedAt);

        return (
          <div
            key={item.performedExerciseId}
            className={isSuperset && itemIdx > 0 ? "mt-5 border-t border-[var(--border)] pt-4" : ""}
          >
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-bold text-[var(--text)]">
                {prefix}{name}
              </h2>
              <button
                type="button"
                onClick={() => onViewInfo(item.exerciseId, name)}
                aria-label={`View info for ${name}`}
                className="shrink-0 rounded-full p-1 text-[var(--text-subtle)] hover:text-[var(--text-muted)] active:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <InfoIcon />
              </button>
            </div>
            <LastTimeLine exerciseId={item.exerciseId} sessionId={session.id} onViewHistory={() => onViewHistory(item.exerciseId, name)} />

            <div className="mt-3 space-y-1">
              {item.setTargets.map((slot, slotIdx) => {
                const isCursor =
                  cursor?.blockIdx === blockIdx &&
                  cursor?.itemIdx === itemIdx &&
                  cursor?.slotIdx === slotIdx &&
                  !cursor?.isExtra;

                const log = logMap.get(slot.id);
                let rowState: SetRowState = "future";
                if (log?.status === "logged") rowState = "logged";
                else if (log?.status === "skipped") rowState = "skipped";
                else if (isCursor) rowState = "cursor";

                return (
                  <div key={slot.id} className="group flex items-center gap-1">
                    <div className="flex-1">
                      <SetRow
                        setNumber={slotIdx + 1}
                        rowState={rowState}
                        slot={slot}
                        log={log}
                        isCursor={isCursor}
                        onClick={() => onSlotTap(blockIdx, itemIdx, slotIdx)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const target: ArmedDelete = { type: "slot", blockIdx, itemIdx, slotIdx };
                        if (isArmed(target)) {
                          if (armedTimerRef.current) clearTimeout(armedTimerRef.current);
                          setArmedDelete(null);
                          onDeleteSlot(blockIdx, itemIdx, slotIdx);
                        } else {
                          armDelete(target);
                        }
                      }}
                      aria-label={`Delete set ${slotIdx + 1}`}
                      className={[
                        "shrink-0 rounded p-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                        isArmed({ type: "slot", blockIdx, itemIdx, slotIdx })
                          ? "opacity-100 text-red-500 scale-110"
                          : "text-[var(--text-subtle)] opacity-40 hover:opacity-100 hover:text-red-500 active:opacity-100 active:text-red-500",
                      ].join(" ")}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                );
              })}

              {extraLogs.map((extraLog, extraIdx) => {
                const extraSlotIdx = item.setTargets.length + extraIdx;
                const isCursor =
                  cursor?.blockIdx === blockIdx &&
                  cursor?.itemIdx === itemIdx &&
                  cursor?.slotIdx === extraSlotIdx &&
                  cursor?.isExtra === true;
                const fakeSlot: PlannedSlot = { id: extraLog.id, setType: "normal" };
                const hasValues = extraLog.reps != null || extraLog.weightKg != null || extraLog.durationSec != null || extraLog.distanceM != null;
                const rowState: SetRowState = hasValues ? "logged" : isCursor ? "cursor" : "future";

                return (
                  <div key={extraLog.id} className="group flex items-center gap-1">
                    <div className="flex-1">
                      <SetRow
                        setNumber={item.setTargets.length + extraIdx + 1}
                        rowState={rowState}
                        slot={fakeSlot}
                        log={hasValues ? extraLog : undefined}
                        isCursor={isCursor}
                        onClick={() => onSlotTap(blockIdx, itemIdx, extraSlotIdx, true)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const target: ArmedDelete = { type: "extra", logId: extraLog.id };
                        if (isArmed(target)) {
                          if (armedTimerRef.current) clearTimeout(armedTimerRef.current);
                          setArmedDelete(null);
                          onDeleteExtraLog(extraLog.id);
                        } else {
                          armDelete(target);
                        }
                      }}
                      aria-label={`Delete extra set ${item.setTargets.length + extraIdx + 1}`}
                      className={[
                        "shrink-0 rounded p-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                        isArmed({ type: "extra", logId: extraLog.id })
                          ? "opacity-100 text-red-500 scale-110"
                          : "text-[var(--text-subtle)] opacity-40 hover:opacity-100 hover:text-red-500 active:opacity-100 active:text-red-500",
                      ].join(" ")}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-4">
              <button
                type="button"
                onClick={() => onAddSet(blockIdx, itemIdx)}
                className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <PlusSmIcon />
                ADD SET
              </button>
            </div>
          </div>
        );
      })}

      {/* Block-level note — one per block/superset, stored in liveStructure */}
      {blockNoteOpen ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <textarea
            value={blockNoteText}
            onChange={(e) => setBlockNoteText(e.target.value)}
            onBlur={() => {
              const trimmed = blockNoteText.trim() || null;
              onSaveBlockNote(trimmed);
              if (!trimmed) setBlockNoteOpen(false);
            }}
            placeholder="Add a note for this exercise…"
            rows={2}
            autoFocus
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none resize-none"
          />
        </div>
      ) : (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={() => setBlockNoteOpen(true)}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <NoteIcon />
            ADD NOTE
          </button>
        </div>
      )}
    </div>
  );
}
