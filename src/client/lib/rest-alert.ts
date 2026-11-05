export const REST_ALERT_OPTIONS = [
  { value: "both", label: "Sound + vibration" },
  { value: "sound", label: "Sound" },
  { value: "vibration", label: "Vibration" },
  { value: "silent", label: "Silent" },
] as const;

export type RestAlertMode = typeof REST_ALERT_OPTIONS[number]["value"];
const STORAGE_KEY = "forge:rest-timer-alert";
type AudioRef = { current: AudioContext | null };

export function getRestAlertMode(): RestAlertMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return REST_ALERT_OPTIONS.find((option) => option.value === saved)?.value ?? "both";
  } catch {
    return "both";
  }
}

export function setRestAlertMode(mode: RestAlertMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

/** Call synchronously from a tap, before saving a set or resuming the timer. */
export function prepareRestAlertAudio(ref: AudioRef): void {
  const mode = getRestAlertMode();
  if (mode !== "both" && mode !== "sound") return;
  try {
    if (!ref.current || ref.current.state === "closed") ref.current = new AudioContext();
    // A newly created context can also be suspended on mobile browsers.
    if (ref.current.state !== "running") void ref.current.resume().catch(() => {});
  } catch {
    // Audio support must never prevent a workout from being saved.
  }
}

export async function notifyRestTimer(ref: AudioRef): Promise<boolean> {
  const mode = getRestAlertMode();
  let delivered = mode === "silent";
  if (mode === "both" || mode === "vibration") {
    try { delivered = navigator.vibrate?.([200, 100, 200]) ?? false; } catch { /* Try sound independently. */ }
  }
  if (mode === "both" || mode === "sound") {
    try {
      const ctx = ref.current;
      if (!ctx || ctx.state === "closed") return delivered;
      if (ctx.state !== "running") await ctx.resume();
      for (const offset of [0, 0.35]) {
        const start = ctx.currentTime + offset;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        osc.start(start);
        osc.stop(start + 0.25);
      }
      delivered = true;
    } catch { /* Timer expiry and saving remain independent of audio playback. */ }
  }
  return delivered;
}
