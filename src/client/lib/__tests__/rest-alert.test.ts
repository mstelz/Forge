import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRestAlertMode, setRestAlertMode, prepareRestAlertAudio, notifyRestTimer } from "../rest-alert";

describe("rest timer alerts", () => {
  let ctx: AudioContext;
  let vibrate: ReturnType<typeof vi.fn>;
  let oscillator: { connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; frequency: { value: number } };

  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    oscillator = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { value: 0 } };
    ctx = {
      state: "suspended", currentTime: 10, destination: {},
      resume: vi.fn(async () => { Object.assign(ctx, { state: "running" }); }),
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => ({ connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })),
    } as unknown as AudioContext;
    vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("defaults to sound and vibration and persists the selected mode", () => {
    expect(getRestAlertMode()).toBe("both");
    setRestAlertMode("sound");
    expect(getRestAlertMode()).toBe("sound");
    localStorage.setItem("forge:rest-timer-alert", "invalid");
    expect(getRestAlertMode()).toBe("both");
  });

  it("resumes a newly created suspended context during the logging gesture", () => {
    const ref = { current: null as AudioContext | null };
    prepareRestAlertAudio(ref);
    expect(ref.current).toBe(ctx);
    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it("recreates a closed context and reuses a running one", () => {
    const ref = { current: { state: "closed" } as AudioContext };
    prepareRestAlertAudio(ref);
    prepareRestAlertAudio(ref);
    expect(AudioContext).toHaveBeenCalledOnce();
  });

  it("plays two beeps and vibrates by default", async () => {
    expect(await notifyRestTimer({ current: ctx })).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    expect(oscillator.start.mock.calls).toEqual([[10], [10.35]]);
    expect(ctx.resume).toHaveBeenCalledBefore(oscillator.start);
  });

  it("plays sound without vibration when selected", async () => {
    setRestAlertMode("sound");
    await notifyRestTimer({ current: ctx });
    expect(vibrate).not.toHaveBeenCalled();
    expect(oscillator.start).toHaveBeenCalledTimes(2);
  });

  it("does not create or play audio in vibration mode", async () => {
    setRestAlertMode("vibration");
    prepareRestAlertAudio({ current: null });
    await notifyRestTimer({ current: ctx });
    expect(AudioContext).not.toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it("does neither in silent mode", async () => {
    setRestAlertMode("silent");
    prepareRestAlertAudio({ current: null });
    await notifyRestTimer({ current: ctx });
    expect(AudioContext).not.toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("still plays sound when vibration throws", async () => {
    vibrate.mockImplementation(() => { throw Error("unsupported"); });
    expect(await notifyRestTimer({ current: ctx })).toBe(true);
    expect(oscillator.start).toHaveBeenCalledTimes(2);
  });

  it("does not let unavailable audio prevent logging or timer expiry", async () => {
    setRestAlertMode("sound");
    vi.stubGlobal("AudioContext", vi.fn(function () { throw Error("unsupported"); }));
    expect(() => prepareRestAlertAudio({ current: null })).not.toThrow();
    expect(await notifyRestTimer({ current: null })).toBe(false);
    vi.mocked(ctx.resume).mockRejectedValueOnce(Error("blocked"));
    expect(await notifyRestTimer({ current: ctx })).toBe(false);
  });
});
