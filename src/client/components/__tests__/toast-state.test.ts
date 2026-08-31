import { describe, it, expect, vi } from "vitest";
import {
  toastReducer,
  dismissDelayFor,
  once,
  ACTION_DISMISS_MS,
  AUTO_DISMISS_MS,
  type ToastState,
} from "../toast-state";

const empty: ToastState = { toasts: [] };

describe("toastReducer", () => {
  it("adds a toast with the given tone and message", () => {
    const s = toastReducer(empty, {
      type: "push",
      toast: { id: "a", message: "Exported", tone: "success" },
    });
    expect(s.toasts).toHaveLength(1);
    expect(s.toasts[0]).toMatchObject({ message: "Exported", tone: "success" });
  });

  it("dismisses by id and leaves the rest alone", () => {
    let s = toastReducer(empty, {
      type: "push",
      toast: { id: "a", message: "one", tone: "info" },
    });
    s = toastReducer(s, {
      type: "push",
      toast: { id: "b", message: "two", tone: "info" },
    });
    s = toastReducer(s, { type: "dismiss", id: "a" });

    expect(s.toasts).toHaveLength(1);
    expect(s.toasts[0]!.id).toBe("b");
  });

  it("ignores a dismiss for an id that is already gone", () => {
    const s = toastReducer(empty, { type: "dismiss", id: "nope" });
    expect(s.toasts).toEqual([]);
  });

  it("keeps at most three toasts, dropping the oldest", () => {
    let s = empty;
    for (const id of ["a", "b", "c", "d"]) {
      s = toastReducer(s, { type: "push", toast: { id, message: id, tone: "info" } });
    }
    expect(s.toasts.map((t) => t.id)).toEqual(["b", "c", "d"]);
  });

  it("preserves insertion order so the newest reads last", () => {
    let s = toastReducer(empty, {
      type: "push",
      toast: { id: "a", message: "first", tone: "info" },
    });
    s = toastReducer(s, {
      type: "push",
      toast: { id: "b", message: "second", tone: "info" },
    });
    expect(s.toasts.map((t) => t.message)).toEqual(["first", "second"]);
  });
});

// ─── Actionable toasts (undo) ─────────────────────────────────────────────────

describe("toastReducer — actionable toasts", () => {
  const undo = { label: "Undo", run: () => {} };

  it("carries an action label and callback through a push", () => {
    const s = toastReducer(empty, {
      type: "push",
      toast: { id: "a", message: "Deleted Squat", tone: "info", action: undo },
    });
    expect(s.toasts[0]!.action?.label).toBe("Undo");
    expect(s.toasts[0]!.action?.run).toBe(undo.run);
  });

  it("still drops the oldest toast when an actionable one is pushed past the cap", () => {
    let s = empty;
    for (const id of ["a", "b", "c"]) {
      s = toastReducer(s, { type: "push", toast: { id, message: id, tone: "info" } });
    }
    s = toastReducer(s, {
      type: "push",
      toast: { id: "d", message: "Deleted Squat", tone: "info", action: undo },
    });
    expect(s.toasts.map((t) => t.id)).toEqual(["b", "c", "d"]);
  });
});

// ─── once() — the double-tap guard behind every undo button ───────────────────

describe("once", () => {
  it("calls through on the first invocation", () => {
    const fn = vi.fn();
    once(fn)();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("swallows every invocation after the first", () => {
    const fn = vi.fn();
    const guarded = once(fn);
    guarded();
    guarded();
    guarded();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps separate wrappers independent", () => {
    const a = vi.fn();
    const b = vi.fn();
    const guardedA = once(a);
    guardedA();
    guardedA();
    once(b)();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

// ─── Auto-dismiss windows ─────────────────────────────────────────────────────

describe("dismissDelayFor", () => {
  it("gives a plain toast the default window", () => {
    expect(dismissDelayFor({ id: "a", message: "m", tone: "info" })).toBe(AUTO_DISMISS_MS);
  });

  it("never auto-dismisses an error", () => {
    expect(dismissDelayFor({ id: "a", message: "m", tone: "error" })).toBeNull();
  });

  it("gives an actionable toast a longer window than the default", () => {
    const delay = dismissDelayFor({
      id: "a",
      message: "Deleted Squat",
      tone: "info",
      action: { label: "Undo", run: () => {} },
    });
    expect(delay).toBe(ACTION_DISMISS_MS);
    expect(ACTION_DISMISS_MS).toBeGreaterThan(AUTO_DISMISS_MS);
  });
});
