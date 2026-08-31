import { describe, it, expect } from "vitest";
import { toastReducer, type ToastState } from "../toast-state";

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
