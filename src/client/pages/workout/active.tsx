import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@radix-ui/react-dialog";
import { forgeDB } from "../../db/forge-db";
import { getActiveSession, listSessionLogs, listLogsForExercise } from "../../db/queries";
import { useExercise } from "../../hooks/use-exercises";
import { InstructionalCard } from "../exercises/instructional-card";
import { Instructions } from "../exercises/instructions";
import { queryKeys } from "../../db/query-keys";
import {
  createSessionLog,
  updateSession,
  updateSessionLog,
  deleteSessionLog,
  finishSession,
  deleteSession,
  logSetBatch,
  updateSetBatch,
} from "../../db/mutations";
import { reconcileProgramRuns } from "../../sync/program-run-reconciler";
import { useContext } from "react";
import { uuidv4 } from "../../lib/uuid";
import { ExercisePicker } from "../../components/exercise-picker";
import { EditStructureSheet } from "./edit-structure/index";
import { SettingsContext } from "../../contexts/settings-context";
import { formatWeight, formatDistance, convertWeight, convertDistance, weightToKg, distanceToMeters } from "../../lib/units";
import type { Session, SessionSetLog, ExerciseType } from "../../../shared";

// ─── Internal types ──────────────────────────────────────────────────────────

type PlannedSlot = {
  id: string;
  reps?: number;
  repsMin?: number;
  repsMax?: number;
  rpe?: number;
  setType?: string;
};

type LiveItem = {
  performedExerciseId: string;
  sessionItemId: string;
  exerciseId: string;
  setCount: number;
  uniformReps?: number;
  restSec?: number;
  notes?: string;
  setTargets: PlannedSlot[];
};

type LiveBlock = {
  id: string;
  type: "single" | "superset";
  roundCount?: number;
  restSec?: number;
  notes?: string | null;
  items: LiveItem[];
};

type LiveStructure = {
  blocks: LiveBlock[];
};

type CursorPos = {
  blockIdx: number;
  itemIdx: number;
  slotIdx: number;
  /** When true, this position represents a newly-added extra set (no plannedSetId). */
  isExtra?: boolean;
};

type RestTimerData = {
  status: "idle" | "running" | "paused";
  startedAt: number | null;
  durationSec: number;
  pausedAt: number | null;
  remainingSec: number | null;
};

type LogSetType = "normal" | "warmup" | "drop" | "failure" | "amrap" | "rest_pause";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLiveStructure(json: string): LiveStructure {
  try {
    return JSON.parse(json) as LiveStructure;
  } catch {
    return { blocks: [] };
  }
}

function parseRestTimer(json: string | null | undefined): RestTimerData {
  if (!json) {
    return { status: "idle", startedAt: null, durationSec: 90, pausedAt: null, remainingSec: null };
  }
  try {
    return JSON.parse(json) as RestTimerData;
  } catch {
    return { status: "idle", startedAt: null, durationSec: 90, pausedAt: null, remainingSec: null };
  }
}

function deriveCursor(
  liveStructure: LiveStructure,
  logs: SessionSetLog[],
): CursorPos | null {
  const doneIds = new Set<string>();
  for (const log of logs) {
    if ((log.status === "logged" || log.status === "skipped") && log.plannedSetId) {
      doneIds.add(log.plannedSetId);
    }
  }

  for (let blockIdx = 0; blockIdx < liveStructure.blocks.length; blockIdx++) {
    const block = liveStructure.blocks[blockIdx]!;

    if (block.type === "single") {
      const item = block.items[0];
      if (!item) continue;
      for (let slotIdx = 0; slotIdx < item.setTargets.length; slotIdx++) {
        const slot = item.setTargets[slotIdx]!;
        if (!doneIds.has(slot.id)) {
          return { blockIdx, itemIdx: 0, slotIdx };
        }
      }
    } else {
      // superset: walk by round
      const roundCount = block.roundCount ?? (block.items[0]?.setTargets.length ?? 0);
      for (let round = 0; round < roundCount; round++) {
        for (let itemIdx = 0; itemIdx < block.items.length; itemIdx++) {
          const item = block.items[itemIdx];
          if (!item) continue;
          const slot = item.setTargets[round];
          if (!slot) continue;
          if (!doneIds.has(slot.id)) {
            return { blockIdx, itemIdx, slotIdx: round };
          }
        }
      }
    }
  }

  return null;
}

function totalSlotCount(liveStructure: LiveStructure): number {
  let total = 0;
  for (const block of liveStructure.blocks) {
    for (const item of block.items) {
      total += item.setTargets.length;
    }
  }
  return total;
}

function countDoneSlots(
  liveStructure: LiveStructure,
  logs: SessionSetLog[],
): number {
  const doneIds = new Set<string>();
  for (const log of logs) {
    if ((log.status === "logged" || log.status === "skipped") && log.plannedSetId) {
      doneIds.add(log.plannedSetId);
    }
  }
  let count = 0;
  for (const block of liveStructure.blocks) {
    for (const item of block.items) {
      for (const slot of item.setTargets) {
        if (doneIds.has(slot.id)) count++;
      }
    }
  }
  return count;
}

function formatTimer(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatDaysAgo(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatRepsTarget(slot: PlannedSlot): string {
  if (slot.repsMin != null && slot.repsMax != null) return `${slot.repsMin}–${slot.repsMax} reps`;
  if (slot.reps != null) return `${slot.reps} reps`;
  return "";
}

function formatRpeTarget(slot: PlannedSlot): string {
  if (slot.rpe != null) return `RPE ${slot.rpe}`;
  return "";
}

function formatDuration(secs: number): string {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function secsToTimeStr(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function parseTimeStr(str: string): number | null {
  const parts = str.trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return null;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "error" | "info" }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        "fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg",
        type === "error"
          ? "bg-[var(--danger)] text-white"
          : "bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--border)]",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

// ─── Set Row ──────────────────────────────────────────────────────────────────

type SetRowState = "logged" | "cursor" | "future" | "skipped";

interface SetRowProps {
  setNumber: number;
  rowState: SetRowState;
  slot: PlannedSlot;
  log?: SessionSetLog;
  isCursor: boolean;
  onClick: () => void;
}

function SetRow({ setNumber, rowState, slot, log, isCursor, onClick }: SetRowProps) {
  const { weightUnit } = useContext(SettingsContext);
  const repsTarget = formatRepsTarget(slot);
  const rpeTarget = formatRpeTarget(slot);

  if (rowState === "logged" && log) {
    if (isCursor) {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-label={`Set ${setNumber} — editing`}
          className="flex w-full items-center gap-3 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/8 px-3 py-2.5 text-left"
        >
          <span className="w-5 text-xs font-bold text-[var(--accent)] tabular-nums">{setNumber}</span>
          <div className="flex flex-1 items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text)]">
              {log.weightKg != null ? formatWeight(log.weightKg, weightUnit) : "—"} × {log.reps ?? "—"}
            </span>
          </div>
          <span className="text-xs text-[var(--accent)]">editing</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Set ${setNumber} — logged. Tap to edit.`}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-elevated)]"
      >
        <span className="w-5 text-xs text-[var(--text-subtle)] tabular-nums">{setNumber}</span>
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">
            {log.weightKg != null ? formatWeight(log.weightKg, weightUnit) : "—"} × {log.reps ?? "—"}
          </span>
          {log.rpe != null && (
            <span className="rounded bg-[var(--surface-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
              RPE {log.rpe}
            </span>
          )}
        </div>
        <CheckIcon className="text-green-500" />
      </button>
    );
  }

  if (rowState === "skipped") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Set ${setNumber} — skipped. Tap to edit.`}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-elevated)]"
      >
        <span className="w-5 text-xs text-[var(--text-subtle)] tabular-nums">{setNumber}</span>
        <span className="text-sm text-[var(--text-subtle)]">— skipped</span>
      </button>
    );
  }

  if (isCursor) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Set ${setNumber} — active. Tap to log.`}
        className="flex w-full items-center gap-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2.5 text-left"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-[var(--accent-fg)]">
          {setNumber}
        </span>
        <div className="flex flex-1 items-center gap-2">
          {repsTarget && (
            <span className="text-sm font-semibold text-[var(--accent)]">{repsTarget}</span>
          )}
          {rpeTarget && (
            <span className="rounded bg-[var(--accent)]/20 px-1.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
              {rpeTarget}
            </span>
          )}
          {!repsTarget && !rpeTarget && (
            <span className="text-sm text-[var(--accent)]">—</span>
          )}
        </div>
        <span className="text-xs text-[var(--accent)]">Tap to edit</span>
      </button>
    );
  }

  // future placeholder
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Set ${setNumber} — upcoming`}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left"
    >
      <span className="w-5 text-xs text-[var(--text-subtle)] tabular-nums">{setNumber}</span>
      <div className="flex flex-1 items-center gap-2">
        {repsTarget ? (
          <span className="text-sm text-[var(--text-subtle)]">{repsTarget}</span>
        ) : (
          <span className="text-sm text-[var(--text-subtle)]">— —</span>
        )}
        {rpeTarget && (
          <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs text-[var(--text-subtle)]">
            {rpeTarget}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Last time summary ────────────────────────────────────────────────────────

function useLastTimeForExercise(exerciseId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.sessionSetLogs.count()).subscribe({
      next: () =>
        qc.invalidateQueries({
          queryKey: queryKeys.exerciseHistory.byExerciseId(exerciseId),
        }),
    });
    return () => sub.unsubscribe();
  }, [exerciseId, qc]);

  return useQuery({
    queryKey: queryKeys.exerciseHistory.byExerciseId(exerciseId),
    queryFn: () => listLogsForExercise(exerciseId),
  });
}

function LastTimeLine({
  exerciseId,
  sessionId,
  onViewHistory,
}: {
  exerciseId: string;
  sessionId: string;
  onViewHistory: () => void;
}) {
  const { data: allLogs } = useLastTimeForExercise(exerciseId);

  const settings = useContext(SettingsContext);
  const summary = useMemo(() => {
    if (!allLogs || allLogs.length === 0) return null;
    const prev = allLogs.filter(
      (l) => l.sessionId !== sessionId && l.status === "logged",
    );
    if (prev.length === 0) return null;

    const mostRecentAt = Math.max(...prev.map((l) => l.loggedAt));
    const sessionLogs = prev
      .filter((l) => mostRecentAt - l.loggedAt < 4 * 3_600_000)
      .sort((a, b) => a.order - b.order);

    if (sessionLogs.length === 0) return null;

    const firstLog = sessionLogs[0]!;
    const weightKg = firstLog.weightKg;
    const repsArr = sessionLogs.map((l) => l.reps).filter((r): r is number => r != null);
    const weightStr = weightKg != null ? formatWeight(weightKg, settings.weightUnit) : null;
    const repsStr = repsArr.length > 0 ? repsArr.join(", ") : null;
    const when = formatDaysAgo(mostRecentAt);

    if (weightStr && repsStr) return `Last time: ${weightStr} × ${repsStr} · ${when}`;
    if (repsStr) return `Last time: ${repsStr} reps · ${when}`;
    return null;
  }, [allLogs, sessionId]);

  if (!summary) return null;
  return (
    <button
      type="button"
      onClick={onViewHistory}
      className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none"
    >
      <span>{summary}</span>
      <ChevronRightIcon />
    </button>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

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
  const doneIds = new Set<string>();
  for (const log of logs) {
    if ((log.status === "logged" || log.status === "skipped") && log.plannedSetId) {
      doneIds.add(log.plannedSetId);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: roundCount }).map((_, round) => {
        const allDoneInRound = block.items.every((item) => {
          const slot = item.setTargets[round];
          return slot ? doneIds.has(slot.id) : false;
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

interface ExerciseCardProps {
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

function ExerciseCard({
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
  const roundCount = block.roundCount ?? (block.items[0]?.setTargets.length ?? 0);

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

// ─── Rest Timer Strip ─────────────────────────────────────────────────────────

interface RestTimerStripProps {
  timer: RestTimerData;
  displaySecs: number;
  onToggle: () => void;
}

function RestTimerStrip({ timer, displaySecs, onToggle }: RestTimerStripProps) {
  if (timer.status === "idle") return null;

  const progress =
    timer.durationSec > 0
      ? Math.max(0, Math.min(1, displaySecs / timer.durationSec))
      : 0;

  return (
    <div className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]">
      {/* progress bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-[var(--accent)] transition-all duration-1000"
        style={{ width: `${progress * 100}%` }}
      />
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-label={timer.status === "running" ? "Pause rest timer" : "Resume rest timer"}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)]"
        >
          {timer.status === "running" ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Rest
          </p>
          <p className="text-2xl font-bold tabular-nums text-[var(--text)]">
            {formatTimer(displaySecs)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Bottom Panel ─────────────────────────────────────────────────────────────

interface BottomPanelProps {
  cursor: CursorPos | null;
  liveStructure: LiveStructure;
  logs: SessionSetLog[];
  session: Session;
  timer: RestTimerData;
  timerDisplaySecs: number;
  onTimerToggle: () => void;
  onFinishWorkout: () => void;
  onSkipSet: () => void;
  onEditSaved: () => void;
  exerciseTypes: Map<string, ExerciseType>;
  noteOpen: boolean;
  onToggleNote: () => void;
  onCloseNote: () => void;
}

function BottomPanel({
  cursor,
  liveStructure,
  logs,
  session,
  timer,
  timerDisplaySecs,
  onTimerToggle,
  onFinishWorkout,
  onSkipSet,
  onEditSaved,
  exerciseTypes,
  noteOpen,
  onToggleNote,
  onCloseNote,
}: BottomPanelProps) {
  const [weightDisplay, setWeightDisplay] = useState<number | null>(null);
  const [weightInputStr, setWeightInputStr] = useState<string>("");
  const [reps, setReps] = useState<number | null>(null);
  const [repsInputStr, setRepsInputStr] = useState<string>("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [durationInputStr, setDurationInputStr] = useState<string>("");
  const [distanceDisplay, setDistanceDisplay] = useState<number | null>(null);
  const [distanceInputStr, setDistanceInputStr] = useState<string>("");
  const [setType, setSetType] = useState<LogSetType>("normal");
  const [note, setNote] = useState("");
  const [logging, setLogging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "error" | "info" } | null>(null);

  const showToast = useCallback((message: string, type: "error" | "info" = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const currentSlot = useMemo<PlannedSlot | null>(() => {
    if (!cursor) return null;
    const block = liveStructure.blocks[cursor.blockIdx];
    if (!block) return null;
    const item = block.items[cursor.itemIdx];
    if (!item) return null;
    return item.setTargets[cursor.slotIdx] ?? null;
  }, [cursor, liveStructure]);

  const currentItem = useMemo<LiveItem | null>(() => {
    if (!cursor) return null;
    const block = liveStructure.blocks[cursor.blockIdx];
    if (!block) return null;
    return block.items[cursor.itemIdx] ?? null;
  }, [cursor, liveStructure]);

  const currentExerciseType = currentItem
    ? (exerciseTypes.get(currentItem.exerciseId) ?? "strength")
    : "strength";
  const { weightUnit, distanceUnit, showRpe, showCardio } = useContext(SettingsContext);
  const showWeightReps = currentExerciseType !== "cardio";
  const showDurationDistance = (currentExerciseType === "cardio" || currentExerciseType === "mixed") && showCardio;

  const isEditingExisting = useMemo(
    () =>
      !!(
        currentItem &&
        currentSlot &&
        logs.some(
          (l) =>
            l.performedExerciseId === currentItem.performedExerciseId &&
            l.plannedSetId === currentSlot.id &&
            l.status === "logged",
        )
      ),
    [currentItem, currentSlot, logs],
  );

  // Pre-fill from the existing log for this slot (if editing) or from the last log
  // for this exercise. Re-runs whenever the active slot changes.
  const prevSlotKey = useRef<string | null>(null);
  useEffect(() => {
    if (!currentItem || !currentSlot) return;
    const slotKey = `${currentItem.performedExerciseId}:${currentSlot.id}`;
    if (prevSlotKey.current === slotKey) return;
    prevSlotKey.current = slotKey;

    // If this slot already has a logged entry, pre-fill from it so the user
    // edits the existing values rather than getting stale defaults.
    const existingLog = logs.find(
      (l) =>
        l.performedExerciseId === currentItem.performedExerciseId &&
        l.plannedSetId === currentSlot.id &&
        l.status === "logged",
    );

    const setWeight = (kg: number) => {
      const val = Math.round(convertWeight(kg, weightUnit) * 100) / 100;
      setWeightDisplay(val);
      setWeightInputStr(String(val));
    };
    const setDist = (m: number) => {
      const val = Math.round(convertDistance(m, distanceUnit) * 1000) / 1000;
      setDistanceDisplay(val);
      setDistanceInputStr(String(val));
    };

    if (existingLog) {
      if (existingLog.weightKg != null) setWeight(existingLog.weightKg);
      if (existingLog.reps != null) { setReps(existingLog.reps); setRepsInputStr(String(existingLog.reps)); }
      if (existingLog.rpe != null) setRpe(existingLog.rpe);
      if (existingLog.durationSec != null) { setDurationSec(existingLog.durationSec); setDurationInputStr(secsToTimeStr(existingLog.durationSec)); }
      if (existingLog.distanceM != null) setDist(existingLog.distanceM);
      setSetType((existingLog.setType as LogSetType) ?? "normal");
      // Pre-fill note from the saved log so editing can't accidentally wipe it
      setNote(existingLog.notes ?? "");
      return;
    }

    // No existing log — clear note and pre-fill metrics from the last logged set.
    setNote("");

    // No existing log — pre-fill from the last logged set for this exercise.
    const prevLogs = logs
      .filter(
        (l) =>
          l.performedExerciseId === currentItem.performedExerciseId &&
          l.status === "logged",
      )
      .sort((a, b) => b.loggedAt - a.loggedAt);

    if (prevLogs.length > 0) {
      const prev = prevLogs[0]!;
      if (prev.weightKg != null) setWeight(prev.weightKg);
      if (prev.reps != null) { setReps(prev.reps); setRepsInputStr(String(prev.reps)); }
      if (prev.durationSec != null) { setDurationSec(prev.durationSec); setDurationInputStr(secsToTimeStr(prev.durationSec)); }
      if (prev.distanceM != null) setDist(prev.distanceM);
      // Do not pre-fill RPE — it is per-set
    } else {
      if (currentSlot.reps != null) { setReps(currentSlot.reps); setRepsInputStr(String(currentSlot.reps)); }
    }
  }, [currentItem, currentSlot, logs, weightUnit, distanceUnit]);

  const handleLogSet = async () => {
    if (!cursor || !currentItem || logging) return;
    const block = liveStructure.blocks[cursor.blockIdx];
    if (!block) return;

    const storedKg = weightDisplay != null ? weightToKg(weightDisplay, weightUnit) : null;
    const storedM = distanceDisplay != null ? distanceToMeters(distanceDisplay, distanceUnit) : null;

    const hasStrengthMetric = (reps != null && reps > 0) || (weightDisplay != null && weightDisplay > 0);
    const hasCardioMetric = (durationSec != null && durationSec > 0) || (distanceDisplay != null && distanceDisplay > 0);

    // ── Extra set branch (ADD SET button) ────────────────────────────────────
    if (cursor.isExtra) {
      const extraLog = [...logs]
        .filter((l) => l.performedExerciseId === currentItem.performedExerciseId && l.status === "extra")
        .sort((a, b) => b.loggedAt - a.loggedAt)[0];
      if (!extraLog) return;

      if (showWeightReps && !showDurationDistance && !hasStrengthMetric) {
        setValidationError("Enter reps or weight before logging.");
        return;
      }
      if (!showWeightReps && showDurationDistance && !hasCardioMetric) {
        setValidationError("Enter duration or distance before logging.");
        return;
      }
      if (showWeightReps && showDurationDistance && !hasStrengthMetric && !hasCardioMetric) {
        setValidationError("Enter at least one metric before logging.");
        return;
      }
      setValidationError(null);
      setLogging(true);
      try {
        const now = Date.now();
        const updatedExtraLog = {
          ...extraLog,
          reps,
          weightKg: storedKg,
          rpe,
          durationSec: showDurationDistance ? (durationSec ?? null) : null,
          distanceM: showDurationDistance ? storedM : null,
          notes: note.trim() || null,
          setType,
          loggedAt: now,
          enteredWeight: weightDisplay,
          enteredWeightUnit: (weightDisplay != null ? weightUnit : null) as "kg" | "lb" | null,
        };
        const prevLogged = logs.filter((l) => l.status === "logged").sort((a, b) => b.loggedAt - a.loggedAt)[0];
        const prevLogUpdate =
          prevLogged && prevLogged.restAfterSec == null
            ? { ...prevLogged, restAfterSec: Math.min(3600, Math.max(0, Math.round((now - prevLogged.loggedAt) / 1000))) }
            : null;
        const restSec = block.restSec ?? currentItem.restSec ?? 90;
        const updatedSession: Session = {
          ...session,
          restTimer: JSON.stringify({ status: "running", startedAt: now, durationSec: restSec, pausedAt: null, remainingSec: restSec } satisfies RestTimerData),
          updatedAt: now,
        };
        await updateSetBatch(updatedExtraLog, updatedSession, prevLogUpdate);
        setNote(""); onCloseNote(); setRpe(null);
        prevSlotKey.current = null;
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to save. Please try again.");
      } finally {
        setLogging(false);
      }
      return;
    }

    // ── Normal / edit planned-slot branch ────────────────────────────────────
    if (!currentSlot) return;

    // Validate
    if (showWeightReps && !showDurationDistance && !hasStrengthMetric) {
      setValidationError("Enter reps or weight before logging.");
      return;
    }
    if (!showWeightReps && showDurationDistance && !hasCardioMetric) {
      setValidationError("Enter duration or distance before logging.");
      return;
    }
    if (showWeightReps && showDurationDistance && !hasStrengthMetric && !hasCardioMetric) {
      setValidationError("Enter at least one metric before logging.");
      return;
    }
    setValidationError(null);

    setLogging(true);
    try {
      const now = Date.now();

      // Check if this planned slot already has a log (user is editing a logged set)
      const existingLog = logs.find(
        (l) =>
          l.performedExerciseId === currentItem.performedExerciseId &&
          l.plannedSetId === currentSlot.id &&
          l.status === "logged",
      );

      const updatedFields = {
        reps,
        weightKg: storedKg,
        rpe,
        durationSec: showDurationDistance ? (durationSec ?? null) : null,
        distanceM: showDurationDistance ? storedM : null,
        notes: note.trim() || null,
        setType,
        loggedAt: now,
        enteredWeight: weightDisplay,
        enteredWeightUnit: (weightDisplay != null ? weightUnit : null) as "kg" | "lb" | null,
      };

      if (existingLog) {
        // Update in place — don't advance rest timer or backfill restAfterSec
        await updateSessionLog({ ...existingLog, ...updatedFields });
        // Return to the next unlogged set
        onEditSaved();
      } else {
        // New log: build all writes and commit in one transaction
        const prevLogged = logs
          .filter((l) => l.status === "logged")
          .sort((a, b) => b.loggedAt - a.loggedAt)[0];
        const prevLogUpdate =
          prevLogged && prevLogged.restAfterSec == null
            ? {
                ...prevLogged,
                restAfterSec: Math.min(3600, Math.max(0, Math.round((now - prevLogged.loggedAt) / 1000))),
              }
            : null;

        const order = logs.filter((l) => l.status === "logged").length;
        const record: SessionSetLog = {
          id: uuidv4(),
          sessionId: session.id,
          performedExerciseId: currentItem.performedExerciseId,
          exerciseId: currentItem.exerciseId,
          sessionItemId: currentItem.sessionItemId,
          plannedSetId: currentSlot.id,
          order,
          restAfterSec: null,
          enteredDistance: null,
          enteredDistanceUnit: null,
          status: "logged",
          ...updatedFields,
        };

        const restSec = block.restSec ?? currentItem.restSec ?? 90;
        const updatedSession: Session = {
          ...session,
          restTimer: JSON.stringify({
            status: "running",
            startedAt: now,
            durationSec: restSec,
            pausedAt: null,
            remainingSec: restSec,
          } satisfies RestTimerData),
          updatedAt: now,
        };

        await logSetBatch(record, updatedSession, prevLogUpdate);
      }

      setNote(""); onCloseNote(); setRpe(null);
      // Reset slot tracking so the next cursor position pre-fills fresh
      prevSlotKey.current = null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save. Please try again.";
      showToast(msg);
    } finally {
      setLogging(false);
    }
  };

  const SET_TYPE_CHIPS: { key: LogSetType; label: string }[] = [
    { key: "normal", label: "N" },
    { key: "drop", label: "D" },
    { key: "warmup", label: "W" },
    { key: "failure", label: "F" },
    { key: "amrap", label: "A" },
    { key: "rest_pause", label: "RP" },
  ];

  if (!cursor) {
    return (
      <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 pb-6 pt-4 space-y-3">
        <button
          type="button"
          onClick={onFinishWorkout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-base font-bold text-[var(--accent-fg)] hover:opacity-90"
        >
          <CheckIcon className="text-[var(--accent-fg)]" />
          FINISH WORKOUT
        </button>
        <button
          type="button"
          className="w-full rounded-2xl border border-[var(--border)] py-3 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Add extra set
        </button>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)]">
      <RestTimerStrip
        timer={timer}
        displaySecs={timerDisplaySecs}
        onToggle={onTimerToggle}
      />

      <div className="px-4 pb-5 pt-3 space-y-4">
        {/* Metric inputs */}
        <div className="flex flex-wrap gap-4">
          {showWeightReps && (
            <>
              <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "120px" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Weight {weightUnit}
                </p>
                <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <button
                    type="button"
                    aria-label={`Decrease weight by 2.5 ${weightUnit}`}
                    onClick={() => {
                      setValidationError(null);
                      const next = Math.max(0, Number(((weightDisplay ?? 0) - 2.5).toFixed(2)));
                      setWeightDisplay(next);
                      setWeightInputStr(String(next));
                    }}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={weightInputStr}
                    placeholder="—"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      setValidationError(null);
                      setWeightInputStr(e.target.value);
                      const v = parseFloat(e.target.value);
                      setWeightDisplay(isNaN(v) ? null : Math.max(0, v));
                    }}
                    className="w-0 min-w-0 flex-1 bg-transparent text-center text-lg font-bold tabular-nums text-[var(--text)] focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={`Increase weight by 2.5 ${weightUnit}`}
                    onClick={() => {
                      setValidationError(null);
                      const next = Number(((weightDisplay ?? 0) + 2.5).toFixed(2));
                      setWeightDisplay(next);
                      setWeightInputStr(String(next));
                    }}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "120px" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Reps
                </p>
                <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <button
                    type="button"
                    aria-label="Decrease reps by 1"
                    onClick={() => {
                      setValidationError(null);
                      const next = Math.max(1, (reps ?? 1) - 1);
                      setReps(next);
                      setRepsInputStr(String(next));
                    }}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={repsInputStr}
                    placeholder="—"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      setValidationError(null);
                      setRepsInputStr(e.target.value);
                      const v = parseInt(e.target.value, 10);
                      setReps(isNaN(v) ? null : Math.max(0, v));
                    }}
                    className="w-0 min-w-0 flex-1 bg-transparent text-center text-lg font-bold tabular-nums text-[var(--text)] focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Increase reps by 1"
                    onClick={() => {
                      setValidationError(null);
                      const next = (reps ?? 0) + 1;
                      setReps(next);
                      setRepsInputStr(String(next));
                    }}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    +
                  </button>
                </div>
              </div>
            </>
          )}
          {showDurationDistance && (
            <>
              <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "120px" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Duration
                </p>
                <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <button
                    type="button"
                    aria-label="Decrease duration by 30 seconds"
                    onClick={() => {
                      const next = Math.max(0, (durationSec ?? 0) - 30);
                      setDurationSec(next);
                      setDurationInputStr(secsToTimeStr(next));
                    }}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="text"
                    value={durationInputStr}
                    placeholder="0:00"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setDurationInputStr(e.target.value)}
                    onBlur={(e) => {
                      const parsed = parseTimeStr(e.target.value);
                      const secs = parsed != null ? Math.max(0, parsed) : null;
                      setDurationSec(secs);
                      setDurationInputStr(secs != null ? secsToTimeStr(secs) : "");
                    }}
                    className="w-0 min-w-0 flex-1 bg-transparent text-center text-lg font-bold tabular-nums text-[var(--text)] focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Increase duration by 30 seconds"
                    onClick={() => {
                      const next = (durationSec ?? 0) + 30;
                      setDurationSec(next);
                      setDurationInputStr(secsToTimeStr(next));
                    }}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "120px" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Distance {distanceUnit}
                </p>
                <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  {(() => {
                    const distanceStep = distanceUnit === "m" ? 100 : 0.25;
                    return (
                      <>
                        <button
                          type="button"
                          aria-label={`Decrease distance by ${distanceStep} ${distanceUnit}`}
                          onClick={() => {
                            const next = Math.max(0, Math.round(((distanceDisplay ?? 0) - distanceStep) * 1000) / 1000);
                            setDistanceDisplay(next);
                            setDistanceInputStr(String(next));
                          }}
                          className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={distanceInputStr}
                          placeholder="—"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            setDistanceInputStr(e.target.value);
                            const v = parseFloat(e.target.value);
                            setDistanceDisplay(isNaN(v) ? null : Math.max(0, v));
                          }}
                          className="w-0 min-w-0 flex-1 bg-transparent text-center text-lg font-bold tabular-nums text-[var(--text)] focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`Increase distance by ${distanceStep} ${distanceUnit}`}
                          onClick={() => {
                            const next = Math.round(((distanceDisplay ?? 0) + distanceStep) * 1000) / 1000;
                            setDistanceDisplay(next);
                            setDistanceInputStr(String(next));
                          }}
                          className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
                        >
                          +
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* RPE stepper */}
        {showRpe && (
        <div className="flex flex-col gap-1.5" style={{ maxWidth: "160px" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            RPE
          </p>
          <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <button
              type="button"
              aria-label="Decrease RPE by 0.5"
              onClick={() => setRpe((r) => r != null ? Math.max(0, Math.round((r - 0.5) * 2) / 2) : null)}
              className="flex h-11 w-11 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              −
            </button>
            <span className="flex-1 text-center text-lg font-bold tabular-nums text-[var(--text)]">
              {rpe != null ? rpe : "—"}
            </span>
            <button
              type="button"
              aria-label="Increase RPE by 0.5"
              onClick={() => setRpe((r) => Math.min(10, Math.round(((r ?? 5) + 0.5) * 2) / 2))}
              className="flex h-11 w-11 items-center justify-center text-xl text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              +
            </button>
          </div>
        </div>
        )}

        {/* Set type chips + note */}
        <div className="flex flex-wrap items-center gap-2">
          {SET_TYPE_CHIPS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSetType(key)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                setType === key
                  ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={onToggleNote}
            className={[
              "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              noteOpen
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            <NoteIcon />
            Note
          </button>
        </div>

        {/* Note input */}
        {noteOpen && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            autoFocus
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none"
          />
        )}

        {/* Validation error */}
        {validationError && (
          <p role="alert" className="text-xs font-semibold text-[var(--danger)]">
            {validationError}
          </p>
        )}

        {/* LOG SET (+ optional SKIP button) */}
        {!isEditingExisting && !cursor?.isExtra ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLogSet}
              disabled={logging}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-base font-bold text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50"
            >
              <CheckIcon className="text-[var(--accent-fg)]" />
              {logging ? "Saving…" : "LOG SET"}
            </button>
            <button
              type="button"
              onClick={onSkipSet}
              disabled={logging}
              className="flex items-center justify-center rounded-2xl border border-[var(--border)] px-5 py-4 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLogSet}
            disabled={logging}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-base font-bold text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50"
          >
            <CheckIcon className="text-[var(--accent-fg)]" />
            {logging ? "Saving…" : isEditingExisting ? "SAVE EDIT" : "LOG SET"}
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

// ─── Exercise History Sheet ───────────────────────────────────────────────────

function ExerciseHistorySheet({
  exerciseId,
  exerciseName,
  open,
  onClose,
}: {
  exerciseId: string;
  exerciseName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: allLogs } = useLastTimeForExercise(exerciseId);
  const { weightUnit, distanceUnit } = useContext(SettingsContext);

  const sessions = useMemo(() => {
    if (!allLogs) return [];
    const logged = allLogs.filter((l) => l.status === "logged").sort((a, b) => b.loggedAt - a.loggedAt);
    const groups: Array<{ date: number; sets: typeof logged }> = [];
    for (const log of logged) {
      const last = groups[groups.length - 1];
      if (last && last.date - log.loggedAt < 4 * 3_600_000) {
        last.sets.push(log);
      } else {
        groups.push({ date: log.loggedAt, sets: [log] });
      }
    }
    return groups.slice(0, 5);
  }, [allLogs]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-label={`${exerciseName} history`}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-[var(--radius-card)] bg-[var(--surface)] ring-1 ring-[var(--border)]"
        style={{ maxHeight: "70dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <p className="text-sm font-bold text-[var(--text)]">{exerciseName}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-6 space-y-4" style={{ maxHeight: "calc(70dvh - 80px)" }}>
          {sessions.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--text-muted)]">No history yet</p>
          ) : (
            sessions.map((group, gi) => (
              <div key={gi}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  {formatDaysAgo(group.date)}
                </p>
                <div className="space-y-1">
                  {group.sets.map((log, si) => {
                    const parts: string[] = [];
                    if (log.weightKg != null) parts.push(formatWeight(log.weightKg, weightUnit));
                    if (log.reps != null) parts.push(`${log.reps} reps`);
                    if (log.durationSec != null) parts.push(secsToTimeStr(log.durationSec));
                    if (log.distanceM != null) parts.push(formatDistance(log.distanceM, distanceUnit));
                    return (
                      <div key={log.id} className="flex items-center gap-3">
                        <span className="w-10 text-[10px] font-semibold text-[var(--text-subtle)]">
                          Set {si + 1}
                        </span>
                        <span className="text-sm text-[var(--text)]">{parts.join(" × ") || "—"}</span>
                        {log.rpe != null && (
                          <span className="ml-auto text-[10px] text-[var(--text-muted)]">RPE {log.rpe}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Exercise Info Sheet ──────────────────────────────────────────────────────

function ExerciseInfoSheet({
  exerciseId,
  exerciseName,
  open,
  onClose,
}: {
  exerciseId: string;
  exerciseName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: exercise } = useExercise(exerciseId);

  if (!open) return null;

  const videoUrl = exercise?.videoUrls?.[0] ?? null;
  const hasContent = videoUrl || exercise?.description || exercise?.instructions;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-label={`${exerciseName} info`}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-[var(--radius-card)] bg-[var(--surface-elevated)] ring-1 ring-[var(--border)]"
        style={{ maxHeight: "80dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <p className="text-sm font-bold text-[var(--text)]">{exerciseName}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close exercise info"
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-8 space-y-3" style={{ maxHeight: "calc(80dvh - 80px)" }}>
          {!exercise ? (
            <p className="py-4 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          ) : !hasContent ? (
            <p className="py-4 text-center text-sm text-[var(--text-muted)]">No description or instructions added yet.</p>
          ) : (
            <>
              <InstructionalCard videoUrl={videoUrl} description={exercise.description ?? null} />
              <Instructions instructions={exercise.instructions ?? null} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Overflow menu ────────────────────────────────────────────────────────────

interface OverflowMenuProps {
  onFinish: () => void;
  onDiscard: () => void;
  onEditStructure: () => void;
  onPauseAndLeave: () => void;
  isReopenEdit?: boolean;
}

function OverflowMenu({ onFinish, onDiscard, onEditStructure, onPauseAndLeave, isReopenEdit }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More options"
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <KebabIcon />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <div
            role="menu"
            aria-label="Workout options"
            className="absolute right-0 z-50 mt-1 w-48 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onEditStructure(); }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
            >
              Edit workout
            </button>
            {!isReopenEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onPauseAndLeave(); }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
              >
                Pause and leave
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onFinish(); }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface-elevated)]"
            >
              Finish Workout
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onDiscard(); }}
              className={`flex w-full items-center px-4 py-2.5 text-sm hover:bg-[var(--surface-elevated)] ${isReopenEdit ? "text-[var(--text-muted)]" : "text-red-500"}`}
            >
              {isReopenEdit ? "Stop editing" : "Discard Workout"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page skeleton ────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-[var(--surface)]" />
        <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface)]" />
        <div className="h-8 w-8 animate-pulse rounded-lg bg-[var(--surface)]" />
      </div>
      <div className="flex-1 space-y-4 px-4 py-4">
        <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" />
        <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ActiveWorkoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isReopenEdit = !!(location.state as { isReopenEdit?: boolean } | null)?.isReopenEdit;
  const originalEndedAt = (location.state as { originalEndedAt?: number } | null)?.originalEndedAt ?? null;
  const qc = useQueryClient();

  // ── Reactive live-query invalidation ──────────────────────────────────────
  useEffect(() => {
    const sub = liveQuery(() => forgeDB.sessions.count()).subscribe({
      next: () => {
        qc.invalidateQueries({ queryKey: queryKeys.sessions.active() });
      },
    });
    return () => sub.unsubscribe();
  }, [qc]);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: queryKeys.sessions.active(),
    queryFn: getActiveSession,
  });

  useEffect(() => {
    if (!sessionLoading && !session) {
      navigate("/workout/start", { replace: true });
    }
  }, [session, sessionLoading, navigate]);

  const sessionId = session?.id;

  useEffect(() => {
    if (!sessionId) return;
    const sub = liveQuery(() => forgeDB.sessionSetLogs.count()).subscribe({
      next: () => {
        qc.invalidateQueries({ queryKey: queryKeys.sessions.logs(sessionId) });
      },
    });
    return () => sub.unsubscribe();
  }, [sessionId, qc]);

  const { data: rawLogs } = useQuery({
    queryKey: sessionId
      ? queryKeys.sessions.logs(sessionId)
      : ["sessions", "logs", "_disabled"],
    queryFn: () => (sessionId ? listSessionLogs(sessionId) : undefined),
    enabled: !!sessionId,
  });
  const logs: SessionSetLog[] = rawLogs ?? [];

  // ── Live structure ─────────────────────────────────────────────────────────
  const liveStructure = useMemo<LiveStructure>(() => {
    if (!session) return { blocks: [] };
    return parseLiveStructure(session.liveStructure);
  }, [session]);

  // ── Exercise names + types (lazy-load from IndexedDB) ────────────────────
  const exerciseNamesRef = useRef<Map<string, string>>(new Map());
  const exerciseTypesRef = useRef<Map<string, ExerciseType>>(new Map());
  const [, forceRender] = useState(0);

  useEffect(() => {
    const ids = new Set<string>();
    for (const block of liveStructure.blocks) {
      for (const item of block.items) {
        ids.add(item.exerciseId);
      }
    }
    const toFetch = [...ids].filter((id) => !exerciseNamesRef.current.has(id));
    if (toFetch.length === 0) return;

    Promise.all(
      toFetch.map((id) =>
        forgeDB.exercises
          .get(id)
          .then((ex) => [id, ex?.name ?? "Exercise", ex?.type ?? "strength"] as const),
      ),
    ).then((pairs) => {
      for (const [id, name, type] of pairs) {
        exerciseNamesRef.current.set(id, name);
        exerciseTypesRef.current.set(id, type as ExerciseType);
      }
      forceRender((n) => n + 1);
    });
  }, [liveStructure]);

  // ── Cursor (auto-derived) ──────────────────────────────────────────────────
  const cursor = useMemo(
    () => deriveCursor(liveStructure, logs),
    [liveStructure, logs],
  );

  // ── User can tap any row to override the active editor slot ───────────────
  const [selectedPos, setSelectedPos] = useState<CursorPos | null>(null);

  const prevCursorRef = useRef<CursorPos | null>(null);
  useEffect(() => {
    if (cursor === null) {
      setSelectedPos(null);
      prevCursorRef.current = null;
      return;
    }
    const prev = prevCursorRef.current;
    const moved =
      prev === null ||
      cursor.blockIdx !== prev.blockIdx ||
      cursor.itemIdx !== prev.itemIdx ||
      cursor.slotIdx !== prev.slotIdx;
    if (moved) {
      setSelectedPos(cursor);
    }
    prevCursorRef.current = cursor;
  }, [cursor]);

  const activeCursor = selectedPos ?? cursor;

  // ── Rest timer ─────────────────────────────────────────────────────────────
  const timer = useMemo(
    () => parseRestTimer(session?.restTimer),
    [session?.restTimer],
  );

  const [timerDisplaySecs, setTimerDisplaySecs] = useState<number>(0);

  useEffect(() => {
    const t = parseRestTimer(session?.restTimer);
    if (t.status === "idle") {
      setTimerDisplaySecs(0);
      return;
    }
    if (t.status === "paused") {
      setTimerDisplaySecs(t.remainingSec ?? 0);
      return;
    }
    // running
    const computeRemaining = () => {
      if (!t.startedAt) return t.remainingSec ?? t.durationSec;
      const elapsed = Math.floor((Date.now() - t.startedAt) / 1000);
      return Math.max(0, t.durationSec - elapsed);
    };

    setTimerDisplaySecs(computeRemaining());
    const id = setInterval(() => {
      const remaining = computeRemaining();
      setTimerDisplaySecs(remaining);
      if (remaining <= 0 && session) {
        clearInterval(id);
        const expired: RestTimerData = { ...t, status: "idle", remainingSec: 0 };
        updateSession({
          ...session,
          restTimer: JSON.stringify(expired),
          updatedAt: Date.now(),
        }).catch(console.error);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [session?.restTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimerToggle = useCallback(async () => {
    if (!session) return;
    const t = parseRestTimer(session.restTimer);
    let updated: RestTimerData;
    if (t.status === "running") {
      const remaining =
        t.startedAt != null
          ? Math.max(0, t.durationSec - Math.floor((Date.now() - t.startedAt) / 1000))
          : (t.remainingSec ?? t.durationSec);
      updated = { ...t, status: "paused", pausedAt: Date.now(), remainingSec: remaining };
    } else if (t.status === "paused") {
      const alreadyElapsed = t.durationSec - (t.remainingSec ?? t.durationSec);
      updated = {
        ...t,
        status: "running",
        startedAt: Date.now() - alreadyElapsed * 1000,
        pausedAt: null,
      };
    } else {
      return;
    }
    await updateSession({ ...session, restTimer: JSON.stringify(updated), updatedAt: Date.now() });
  }, [session]);

  // ── Edit workout structure ─────────────────────────────────────────────────
  const [structureOpen, setStructureOpen] = useState(false);

  // ── Note state ────────────────────────────────────────────────────────────
  const [noteOpen, setNoteOpen] = useState(false);

  const handleSaveBlockNote = useCallback((blockIdx: number, note: string | null) => {
    if (!session) return;
    const updatedBlocks = liveStructure.blocks.map((b, i) =>
      i === blockIdx ? { ...b, notes: note } : b,
    );
    void updateSession({
      ...session,
      liveStructure: JSON.stringify({ ...liveStructure, blocks: updatedBlocks }),
      updatedAt: Date.now(),
    });
  }, [session, liveStructure]);

  // ── Exercise history sheet ─────────────────────────────────────────────────
  const [historyTarget, setHistoryTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Exercise info sheet ────────────────────────────────────────────────────
  const [infoTarget, setInfoTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Add exercise (freeform / mid-session) ─────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingExerciseId, setPendingExerciseId] = useState<string | null>(null);
  const [setCountInput, setSetCountInput] = useState("3");

  const handleAddExercise = useCallback((exerciseId: string) => {
    setPickerOpen(false);
    setSetCountInput("3");
    setPendingExerciseId(exerciseId);
  }, []);

  const confirmAddExercise = useCallback(
    async (exerciseId: string, setCount: number) => {
      if (!session) return;
      setPendingExerciseId(null);
      const sid = uuidv4();
      const setTargets = Array.from({ length: setCount }, (_, i) => ({
        id: uuidv4(),
        order: i,
        setType: "normal",
      }));
      const newBlock = {
        id: uuidv4(),
        type: "single" as const,
        items: [
          {
            id: sid,
            performedExerciseId: uuidv4(),
            sessionItemId: sid,
            exerciseId,
            setCount,
            setTargets,
          },
        ],
      };
      const updated = { ...liveStructure, blocks: [...liveStructure.blocks, newBlock] };
      await updateSession({ ...session, liveStructure: JSON.stringify(updated), updatedAt: Date.now() });
    },
    [session, liveStructure],
  );

  // ── Finish / Discard ───────────────────────────────────────────────────────
  const [finishing, setFinishing] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [pageToast, setPageToast] = useState<{ message: string; type: "error" | "info" } | null>(null);

  const showPageToast = useCallback((message: string, type: "error" | "info" = "error") => {
    setPageToast({ message, type });
    setTimeout(() => setPageToast(null), 3000);
  }, []);

  const handleFinish = useCallback(async () => {
    if (!session || finishing) return;
    setFinishing(true);
    try {
      const finished: Session = {
        ...session,
        status: "finished",
        endedAt: isReopenEdit && originalEndedAt != null ? originalEndedAt : Date.now(),
        updatedAt: Date.now(),
      };
      await finishSession(finished);
      // Update program run day state locally so home page reflects completion immediately
      if (session.sourceType === "program_day") {
        reconcileProgramRuns().catch(console.error);
      }
      navigate(`/workout/sessions/${session.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to finish workout. Please try again.";
      showPageToast(msg);
    } finally {
      setFinishing(false);
      setFinishConfirmOpen(false);
    }
  }, [session, finishing, navigate, showPageToast]);

  const handleDiscard = useCallback(() => {
    setDiscardConfirmOpen(true);
  }, []);

  const handleDiscardConfirmed = useCallback(async () => {
    if (!session) return;
    try {
      if (isReopenEdit) {
        // Re-editing a finished session — "discard" just re-finishes and goes back
        const finished: Session = {
          ...session,
          status: "finished",
          endedAt: originalEndedAt != null ? originalEndedAt : Date.now(),
          updatedAt: Date.now(),
        };
        await finishSession(finished);
        navigate(`/workout/sessions/${session.id}`, { replace: true });
      } else {
        await deleteSession(session.id);
        navigate("/workout/start", { replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to discard workout.";
      showPageToast(msg);
      setDiscardConfirmOpen(false);
    }
  }, [session, navigate, showPageToast, isReopenEdit]);

  // ── Pause and leave ────────────────────────────────────────────────────────
  const handlePauseAndLeave = useCallback(async () => {
    if (!session) return;
    await updateSession({ ...session, pausedAt: Date.now(), updatedAt: Date.now() });
    navigate("/", { replace: true });
  }, [session, navigate]);

  // ── Skip set ───────────────────────────────────────────────────────────────
  const handleSkipSet = useCallback(async () => {
    if (!activeCursor || !session) return;
    const block = liveStructure.blocks[activeCursor.blockIdx];
    if (!block) return;
    const item = block.items[activeCursor.itemIdx];
    if (!item) return;
    const slot = item.setTargets[activeCursor.slotIdx];
    if (!slot) return;

    // Only skip unlogged planned sets (not extra sets, not already logged)
    if (activeCursor.isExtra) return;
    const alreadyLogged = logs.some(
      (l) =>
        l.performedExerciseId === item.performedExerciseId &&
        l.plannedSetId === slot.id &&
        l.status === "logged",
    );
    if (alreadyLogged) return;

    const order = logs.filter((l) => l.status === "logged" || l.status === "skipped").length;
    const record: SessionSetLog = {
      id: uuidv4(),
      sessionId: session.id,
      performedExerciseId: item.performedExerciseId,
      exerciseId: item.exerciseId,
      sessionItemId: item.sessionItemId,
      plannedSetId: slot.id,
      order,
      reps: null,
      weightKg: null,
      rpe: null,
      durationSec: null,
      distanceM: null,
      notes: null,
      setType: (slot.setType as LogSetType) ?? "normal",
      status: "skipped",
      loggedAt: Date.now(),
      restAfterSec: null,
      enteredWeight: null,
      enteredWeightUnit: null,
      enteredDistance: null,
      enteredDistanceUnit: null,
    };
    await createSessionLog(record);
  }, [activeCursor, session, liveStructure, logs]);

  // ── Add extra set ──────────────────────────────────────────────────────────
  const handleAddSet = useCallback(
    async (blockIdx: number, itemIdx: number) => {
      if (!session) return;
      const block = liveStructure.blocks[blockIdx];
      if (!block) return;
      const item = block.items[itemIdx];
      if (!item) return;

      // Order = last log for this exercise + 1
      const exerciseLogs = logs.filter(
        (l) => l.performedExerciseId === item.performedExerciseId,
      );
      const order = exerciseLogs.length > 0
        ? Math.max(...exerciseLogs.map((l) => l.order)) + 1
        : logs.length;

      const record: SessionSetLog = {
        id: uuidv4(),
        sessionId: session.id,
        performedExerciseId: item.performedExerciseId,
        exerciseId: item.exerciseId,
        sessionItemId: item.sessionItemId,
        plannedSetId: null,
        order,
        reps: null,
        weightKg: null,
        rpe: null,
        durationSec: null,
        distanceM: null,
        notes: null,
        setType: "normal",
        status: "extra",
        loggedAt: Date.now(),
        restAfterSec: null,
        enteredWeight: null,
        enteredWeightUnit: null,
        enteredDistance: null,
        enteredDistanceUnit: null,
      };
      await createSessionLog(record);

      // Place cursor on this new extra set
      const extraSlotIdx = item.setTargets.length; // beyond last planned slot
      setSelectedPos({ blockIdx, itemIdx, slotIdx: extraSlotIdx, isExtra: true });
    },
    [session, liveStructure, logs],
  );

  // ── Delete slot (planned set) ──────────────────────────────────────────────
  const handleDeleteSlot = useCallback(
    async (blockIdx: number, itemIdx: number, slotIdx: number) => {
      if (!session) return;
      const block = liveStructure.blocks[blockIdx];
      if (!block) return;
      const item = block.items[itemIdx];
      if (!item) return;
      const slot = item.setTargets[slotIdx];
      if (!slot) return;

      // Delete any log tied to this slot
      const matchingLog = logs.find(
        (l) => l.performedExerciseId === item.performedExerciseId && l.plannedSetId === slot.id,
      );
      if (matchingLog) {
        await deleteSessionLog(matchingLog.id, session.id);
      }

      // Remove the slot from setTargets
      const updatedItem = {
        ...item,
        setTargets: item.setTargets.filter((_, i) => i !== slotIdx),
        setCount: item.setCount - 1,
      };
      const updatedBlock = {
        ...block,
        items: block.items.map((it, i) => (i === itemIdx ? updatedItem : it)),
      };
      const updated = {
        ...liveStructure,
        blocks: liveStructure.blocks.map((b, i) => (i === blockIdx ? updatedBlock : b)),
      };
      await updateSession({ ...session, liveStructure: JSON.stringify(updated), updatedAt: Date.now() });

      // Clear cursor if it was on the deleted slot
      setSelectedPos((prev) => {
        if (prev && prev.blockIdx === blockIdx && prev.itemIdx === itemIdx && prev.slotIdx === slotIdx) {
          return null;
        }
        return prev;
      });
    },
    [session, liveStructure, logs],
  );

  // ── Delete extra set log ───────────────────────────────────────────────────
  const handleDeleteExtraLog = useCallback(
    async (logId: string) => {
      if (!session) return;
      await deleteSessionLog(logId, session.id);
      setSelectedPos((prev) => (prev?.isExtra ? null : prev));
    },
    [session],
  );

  // ── Loading / no session ───────────────────────────────────────────────────
  if (sessionLoading || !session) {
    return <PageSkeleton />;
  }

  const total = totalSlotCount(liveStructure);
  const done = countDoneSlots(liveStructure, logs);
  const headerLabel =
    cursor === null ? "All sets done" : `Set ${Math.min(done + 1, total)} of ${total}`;

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={async () => {
            if (isReopenEdit && session) {
              const finished: Session = {
                ...session,
                status: "finished",
                endedAt: originalEndedAt != null ? originalEndedAt : Date.now(),
                updatedAt: Date.now(),
              };
              await finishSession(finished).catch(console.error);
              navigate(`/workout/sessions/${session.id}`, { replace: true });
            } else {
              navigate(-1);
            }
          }}
          aria-label="Go back"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <BackIcon />
        </button>
        <h1 className="text-sm font-semibold text-[var(--text)]">{headerLabel}</h1>
        <OverflowMenu
          onFinish={() => setFinishConfirmOpen(true)}
          onDiscard={handleDiscard}
          onEditStructure={() => setStructureOpen(true)}
          onPauseAndLeave={handlePauseAndLeave}
          isReopenEdit={isReopenEdit}
        />
      </header>

      {/* Scrollable body */}
      <main className="flex-1 overflow-y-auto space-y-4 px-4 pb-4 pt-2">
        {liveStructure.blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <p className="text-sm text-[var(--text-muted)]">No exercises planned.</p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded-2xl bg-[var(--accent)] px-6 py-3 text-sm font-bold text-[var(--accent-fg)] hover:opacity-90"
            >
              Add exercise
            </button>
          </div>
        ) : (
          <>
            {liveStructure.blocks.map((block, blockIdx) => (
              <ExerciseCard
                key={block.id}
                block={block}
                blockIdx={blockIdx}
                session={session}
                logs={logs}
                cursor={activeCursor}
                exerciseNames={exerciseNamesRef.current}
                onSlotTap={(bi, ii, si, isExtra) =>
                  setSelectedPos({ blockIdx: bi, itemIdx: ii, slotIdx: si, isExtra })
                }
                onAddSet={handleAddSet}
                onDeleteSlot={handleDeleteSlot}
                onDeleteExtraLog={handleDeleteExtraLog}
                onSaveBlockNote={(note) => handleSaveBlockNote(blockIdx, note)}
                onViewHistory={(id, name) => setHistoryTarget({ id, name })}
                onViewInfo={(id, name) => setInfoTarget({ id, name })}
              />
            ))}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] py-3 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <PlusSmIcon />
              Add exercise
            </button>
          </>
        )}
      </main>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleAddExercise}
        title="Add exercise"
      />

      {/* Set count dialog — shown after exercise is picked */}
      <Dialog open={pendingExerciseId !== null} onOpenChange={(open) => { if (!open) setPendingExerciseId(null); }}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
          <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]">
            <DialogTitle className="text-base font-semibold text-[var(--text)]">
              How many sets?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-[var(--text-muted)]">
              Choose the number of sets to add for this exercise.
            </DialogDescription>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setSetCountInput((v) => String(Math.max(1, Number(v) - 1)))}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-xl font-bold text-[var(--text)] hover:bg-[var(--surface-raised-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={20}
                value={setCountInput}
                onChange={(e) => setSetCountInput(e.target.value)}
                className="w-16 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] py-2 text-center text-xl font-semibold text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => setSetCountInput((v) => String(Math.min(20, Number(v) + 1)))}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-xl font-bold text-[var(--text)] hover:bg-[var(--surface-raised-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                +
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingExerciseId(null)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const count = Math.max(1, Math.min(20, Number(setCountInput) || 3));
                  if (pendingExerciseId) confirmAddExercise(pendingExerciseId, count);
                }}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Add
              </button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      <EditStructureSheet
        open={structureOpen}
        onClose={() => setStructureOpen(false)}
        session={session}
        logs={logs}
        exerciseNames={exerciseNamesRef.current}
      />

      {/* Bottom panel */}
      <BottomPanel
        cursor={activeCursor}
        liveStructure={liveStructure}
        logs={logs}
        session={session}
        timer={timer}
        timerDisplaySecs={timerDisplaySecs}
        onTimerToggle={handleTimerToggle}
        onFinishWorkout={() => setFinishConfirmOpen(true)}
        onSkipSet={handleSkipSet}
        onEditSaved={() => setSelectedPos(null)}
        exerciseTypes={exerciseTypesRef.current}
        noteOpen={noteOpen}
        onToggleNote={() => setNoteOpen((o) => !o)}
        onCloseNote={() => setNoteOpen(false)}
      />

      {/* Exercise history sheet */}
      {historyTarget && (
        <ExerciseHistorySheet
          exerciseId={historyTarget.id}
          exerciseName={historyTarget.name}
          open={true}
          onClose={() => setHistoryTarget(null)}
        />
      )}

      {/* Exercise info sheet */}
      {infoTarget && (
        <ExerciseInfoSheet
          exerciseId={infoTarget.id}
          exerciseName={infoTarget.name}
          open={true}
          onClose={() => setInfoTarget(null)}
        />
      )}

      {/* Finish Workout confirm dialog */}
      <Dialog open={finishConfirmOpen} onOpenChange={setFinishConfirmOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
          <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]">
            <DialogTitle className="text-base font-semibold text-[var(--text)]">
              Finish workout?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-[var(--text-muted)]">
              This will end your session. This can't be undone.
            </DialogDescription>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFinishConfirmOpen(false)}
                disabled={finishing}
                className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={finishing}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
              >
                {finishing ? "Finishing…" : "Finish"}
              </button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Discard Workout confirm dialog */}
      <Dialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-40 bg-black/60" />
          <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)]">
            <DialogTitle className="text-base font-semibold text-[var(--text)]">
              {isReopenEdit ? "Stop editing?" : "Discard workout?"}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-[var(--text-muted)]">
              {isReopenEdit
                ? "Any changes you made will be saved and you'll return to the session summary."
                : "All logged sets will be lost. This can't be undone."}
            </DialogDescription>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDiscardConfirmOpen(false)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscardConfirmed}
                className={`rounded-full px-4 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 ${isReopenEdit ? "bg-[var(--accent)] focus-visible:ring-[var(--accent)]" : "bg-red-500 focus-visible:ring-red-500"}`}
              >
                {isReopenEdit ? "Done editing" : "Discard"}
              </button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Page-level toast (for finish/discard errors) */}
      {pageToast && <Toast message={pageToast.message} type={pageToast.type} />}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PlusSmIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function KebabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// Named export alias to match what app.tsx imports
export { ActiveWorkoutPage as WorkoutActivePage };
