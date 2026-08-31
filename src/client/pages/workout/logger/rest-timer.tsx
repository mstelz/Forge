import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { updateSession } from "../../../db/mutations";
import { formatMmSs } from "../../../lib/time";
import { syncLog } from "../../../sync/sync-logger";
import { PauseIcon, PlayIcon } from "../icons";
import { parseRestTimer } from "./structure";
import type { Session } from "../../../../shared";
import type { RestTimerData } from "./types";

/** Two short beeps at timer expiry. Needs an AudioContext already unlocked by a gesture. */
export function playBeep(ctx: AudioContext) {
  [0, 0.35].forEach((offset) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
    osc.start(ctx.currentTime + offset);
    osc.stop(ctx.currentTime + offset + 0.25);
  });
}

export interface RestTimerState {
  timer: RestTimerData;
  displaySecs: number;
  toggle: () => void;
  /** Unlocked by the log-set gesture so expiry can actually make a sound. */
  audioCtxRef: MutableRefObject<AudioContext | null>;
}

/**
 * The rest clock lives on the session record, not in component state, so it
 * survives a reload mid-rest and stays consistent across tabs. This hook keeps a
 * local seconds counter ticking against it and writes back once on expiry.
 */
export function useRestTimer(session: Session | null | undefined): RestTimerState {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [displaySecs, setDisplaySecs] = useState<number>(0);

  const timer = useMemo(() => parseRestTimer(session?.restTimer), [session?.restTimer]);

  useEffect(() => {
    const t = parseRestTimer(session?.restTimer);
    if (t.status === "idle") {
      setDisplaySecs(0);
      return;
    }
    if (t.status === "paused") {
      setDisplaySecs(t.remainingSec ?? 0);
      return;
    }
    // running
    const computeRemaining = () => {
      if (!t.startedAt) return t.remainingSec ?? t.durationSec;
      const elapsed = Math.floor((Date.now() - t.startedAt) / 1000);
      return Math.max(0, t.durationSec - elapsed);
    };

    setDisplaySecs(computeRemaining());
    const id = setInterval(() => {
      const remaining = computeRemaining();
      setDisplaySecs(remaining);
      if (remaining <= 0 && session) {
        clearInterval(id);
        navigator.vibrate?.([200, 100, 200]);
        if (audioCtxRef.current) playBeep(audioCtxRef.current);
        const expired: RestTimerData = { ...t, status: "idle", remainingSec: 0 };
        updateSession({
          ...session,
          restTimer: JSON.stringify(expired),
          updatedAt: Date.now(),
        }).catch((err) => syncLog({ level: "error", category: "app", message: "rest timer expiry update failed", detail: String(err) }));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [session?.restTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(async () => {
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

  return { timer, displaySecs, toggle, audioCtxRef };
}

// ─── Rest Timer Strip ─────────────────────────────────────────────────────────

export interface RestTimerStripProps {
  timer: RestTimerData;
  displaySecs: number;
  onToggle: () => void;
}

export function RestTimerStrip({ timer, displaySecs, onToggle }: RestTimerStripProps) {
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
            {formatMmSs(displaySecs)}
          </p>
        </div>
      </div>
    </div>
  );
}
