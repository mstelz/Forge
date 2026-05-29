import { useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { SettingsContext } from "../../contexts/settings-context";
import { useProfiles, useWeightLogs } from "../../hooks/use-profile";
import { createProfile, updateProfile, addWeightLog, deleteWeightLog } from "../../db/mutations";
import { uuidv4 } from "../../lib/uuid";
import { formatWeight } from "../../lib/units";
import {
  ageFromDob,
  bmi,
  bmiCategory,
  cmToFtIn,
} from "../../lib/profile-calc";
import type { Profile, WeightLog } from "../../../shared/profile";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      // crop to square from center
      const s = Math.min(img.width, img.height);
      const ox = (img.width - s) / 2;
      const oy = (img.height - s) / 2;
      ctx.drawImage(img, ox, oy, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Sparkline SVG
// ---------------------------------------------------------------------------

function WeightSparkline({ logs, unit }: { logs: WeightLog[]; unit: "kg" | "lb" }) {
  if (logs.length < 2) return null;
  const last30 = logs.slice(-30);
  const weights = last30.map((l) => (unit === "lb" ? l.weightKg * 2.20462 : l.weightKg));
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const W = 300;
  const H = 60;
  const pad = 4;
  const pts = weights.map((w, i) => {
    const x = pad + (i / (weights.length - 1)) * (W - pad * 2);
    const y = H - pad - ((w - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 60 }}
      aria-hidden="true"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* dots at first and last */}
      {[0, weights.length - 1].map((i) => {
        const [x, y] = pts[i]!.split(",").map(Number);
        return <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)" />;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Profile Page
// ---------------------------------------------------------------------------

export function ProfilePage() {
  const navigate = useNavigate();
  const { weightUnit, heightUnit } = useContext(SettingsContext);
  const { data: profiles, isLoading } = useProfiles();

  const profile = profiles?.[0] ?? null;
  const { data: weightLogs = [] } = useWeightLogs(profile?.id);

  // ── Editing state ─────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const [saving, setSaving] = useState(false);

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // ── Weight log form ───────────────────────────────────────────────────────
  const [logDate, setLogDate] = useState(todayStr());
  const [logWeight, setLogWeight] = useState("");
  const [logNote, setLogNote] = useState("");
  const [addingLog, setAddingLog] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);

  // Auto-create profile on first visit
  useEffect(() => {
    if (isLoading) return;
    if (profiles && profiles.length === 0) {
      const newProfile: Profile = {
        id: uuidv4(),
        name: "My Profile",
        avatarDataUrl: null,
        heightCm: null,
        dateOfBirth: null,
        sex: null,
        activityLevel: null,
        goalType: null,
        targetWeightKg: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      createProfile(newProfile).then(() => {
        setEditing(true);
      });
    }
  }, [isLoading, profiles]);

  const startEdit = () => {
    if (!profile) return;
    setDraft({
      name: profile.name,
      heightCm: profile.heightCm,
      dateOfBirth: profile.dateOfBirth,
      sex: profile.sex,
    });
    setAvatarPreview(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft({});
    setAvatarPreview(null);
  };

  const saveEdit = async () => {
    if (!profile || saving) return;
    setSaving(true);
    try {
      const updated: Profile = {
        ...profile,
        ...draft,
        avatarDataUrl: avatarPreview ?? profile.avatarDataUrl,
        updatedAt: Date.now(),
      };
      await updateProfile(updated);
      setEditing(false);
      setDraft({});
      setAvatarPreview(null);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (file: File) => {
    try {
      const dataUrl = await compressImage(file);
      setAvatarPreview(dataUrl);
      setDraft((d) => ({ ...d, avatarDataUrl: dataUrl }));
    } catch {
      // ignore
    }
  };

  const handleAddWeightLog = async () => {
    if (!profile || !logWeight) return;
    const wKg = weightUnit === "lb" ? parseFloat(logWeight) / 2.20462 : parseFloat(logWeight);
    if (isNaN(wKg) || wKg <= 0) return;
    setAddingLog(true);
    try {
      const entry: WeightLog = {
        id: uuidv4(),
        profileId: profile.id,
        weightKg: wKg,
        date: logDate,
        note: logNote.trim() || null,
        createdAt: Date.now(),
      };
      await addWeightLog(entry);
      setLogWeight("");
      setLogNote("");
      setLogDate(todayStr());
    } finally {
      setAddingLog(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    setDeletingLogId(id);
    try {
      await deleteWeightLog(id);
    } finally {
      setDeletingLogId(null);
    }
  };

  // ── Computed values ───────────────────────────────────────────────────────
  const latestLog = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1]! : null;
  const latestWeightKg = latestLog?.weightKg ?? null;

  const ageYears =
    profile?.dateOfBirth ? ageFromDob(profile.dateOfBirth) : null;

  const bmiVal =
    latestWeightKg && profile?.heightCm
      ? bmi(latestWeightKg, profile.heightCm)
      : null;

  const displayWeight = (kg: number) =>
    weightUnit === "lb"
      ? `${(kg * 2.20462).toFixed(1)} lb`
      : `${kg.toFixed(1)} kg`;

  const displayHeight = (cm: number) =>
    heightUnit === "ft" ? cmToFtIn(cm) : `${cm} cm`;

  const avatarSrc = avatarPreview ?? profile?.avatarDataUrl ?? null;
  const initials = profile ? nameInitials(profile.name) : "?";

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)] px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back to home"
          className="rounded-md p-2 text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <BackIcon />
        </button>
        <h1 className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Profile
        </h1>
        {editing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-md px-2 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveEdit()}
              disabled={saving}
              className="rounded-md px-2 py-1.5 text-xs font-semibold text-[var(--accent)] hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-md px-2 py-1.5 text-xs font-semibold text-[var(--accent)] hover:opacity-80"
          >
            Edit
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-12">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 px-4 pt-6 pb-4">
          <button
            type="button"
            disabled={!editing}
            onClick={() => editing && fileInputRef.current?.click()}
            aria-label={editing ? "Change profile photo" : undefined}
            className={[
              "relative flex h-24 w-24 items-center justify-center rounded-full overflow-hidden ring-4",
              editing
                ? "ring-[var(--accent)] cursor-pointer"
                : "ring-[var(--border)] cursor-default",
            ].join(" ")}
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <span className="bg-[var(--surface)] h-full w-full flex items-center justify-center text-2xl font-bold text-[var(--accent)]">
                {initials}
              </span>
            )}
            {editing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <CameraIcon />
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleAvatarChange(f);
            }}
          />

          {editing ? (
            <input
              type="text"
              value={(draft.name as string) ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Your name"
              maxLength={80}
              className="rounded-lg bg-[var(--surface)] px-3 py-2 text-center text-lg font-bold text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          ) : (
            <p className="text-lg font-bold text-[var(--text)]">{profile?.name ?? "My Profile"}</p>
          )}
        </div>

        {/* ── Body Stats ─────────────────────────────────────────────────── */}
        <Section label="Body Stats">
          {editing ? (
            <EditBodyStats draft={draft} setDraft={setDraft} heightUnit={heightUnit} />
          ) : (
            <>
              <StatRow label="Height" value={profile?.heightCm ? displayHeight(profile.heightCm) : "—"} />
              <StatRow
                label="Weight"
                value={latestWeightKg ? displayWeight(latestWeightKg) : "—"}
                sub={latestLog ? formatDate(latestLog.date) : undefined}
              />
              <StatRow
                label="BMI"
                value={bmiVal ? `${bmiVal.toFixed(1)}` : "—"}
                sub={bmiVal ? bmiCategory(bmiVal) : undefined}
              />
              <StatRow label="Age" value={ageYears != null ? `${ageYears} yrs` : "—"} />
              <StatRow
                label="Sex"
                value={profile?.sex ? (profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1)) : "—"}
              />
            </>
          )}
        </Section>

        {/* ── Weight History ─────────────────────────────────────────────── */}
        <Section label="Weight History">
          {weightLogs.length >= 2 && (
            <div className="px-4 pt-2 pb-1">
              <WeightSparkline logs={weightLogs} unit={weightUnit} />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-[var(--text-subtle)]">
                  {formatDate(weightLogs[0]!.date)}
                </span>
                <span className="text-[10px] text-[var(--text-subtle)]">
                  {formatDate(weightLogs[weightLogs.length - 1]!.date)}
                </span>
              </div>
            </div>
          )}

          {/* Log weight form */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-2">
              Log weight
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="flex-1 rounded-lg bg-[var(--surface-elevated)] px-2 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              />
              <input
                type="number"
                inputMode="decimal"
                placeholder={weightUnit === "lb" ? "lbs" : "kg"}
                value={logWeight}
                onChange={(e) => setLogWeight(e.target.value)}
                className="w-24 rounded-lg bg-[var(--surface-elevated)] px-2 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => void handleAddWeightLog()}
                disabled={addingLog || !logWeight}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-fg)] disabled:opacity-40"
              >
                {addingLog ? "…" : "Add"}
              </button>
            </div>
            <input
              type="text"
              placeholder="Note (optional)"
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              className="mt-2 w-full rounded-lg bg-[var(--surface-elevated)] px-2 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </div>

          {/* Log list (newest first) */}
          {weightLogs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              No entries yet. Log your first weight above.
            </p>
          ) : (
            <ul>
              {[...weightLogs].reverse().slice(0, 20).map((log) => (
                <li
                  key={log.id}
                  className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {displayWeight(log.weightKg)}
                    </p>
                    <p className="text-[10px] text-[var(--text-subtle)]">
                      {formatDate(log.date)}
                      {log.note ? ` · ${log.note}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete entry"
                    disabled={deletingLogId === log.id}
                    onClick={() => void handleDeleteLog(log.id)}
                    className="shrink-0 rounded-md p-1.5 text-[var(--text-subtle)] hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-40"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Edit sub-panels
// ---------------------------------------------------------------------------

function EditBodyStats({
  draft,
  setDraft,
  heightUnit,
}: {
  draft: Partial<Profile>;
  setDraft: React.Dispatch<React.SetStateAction<Partial<Profile>>>;
  heightUnit: "cm" | "ft";
}) {
  const totalIn = draft.heightCm != null ? draft.heightCm / 2.54 : null;
  const ftVal = totalIn != null ? Math.floor(totalIn / 12) : "";
  const inVal = totalIn != null ? Math.round(totalIn % 12) : "";

  const handleFtIn = (ft: string, inches: string) => {
    const f = parseInt(ft, 10);
    const i = parseInt(inches, 10);
    if (!ft && !inches) { setDraft((d) => ({ ...d, heightCm: null })); return; }
    const cm = ((isNaN(f) ? 0 : f) * 12 + (isNaN(i) ? 0 : i)) * 2.54;
    setDraft((d) => ({ ...d, heightCm: cm > 0 ? cm : null }));
  };

  return (
    <div className="space-y-0">
      {heightUnit === "ft" ? (
        <EditRow label="Height">
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              step="1"
              value={ftVal}
              onChange={(e) => handleFtIn(e.target.value, String(inVal))}
              placeholder="5"
              min={0}
              max={8}
              className="w-14 rounded-lg bg-[var(--surface-elevated)] px-2 py-1.5 text-right text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text-muted)]">ft</span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              value={inVal}
              onChange={(e) => handleFtIn(String(ftVal), e.target.value)}
              placeholder="10"
              min={0}
              max={11}
              className="w-14 rounded-lg bg-[var(--surface-elevated)] px-2 py-1.5 text-right text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text-muted)]">in</span>
          </div>
        </EditRow>
      ) : (
        <EditRow label="Height (cm)">
          <input
            type="number"
            inputMode="decimal"
            value={draft.heightCm != null ? Math.round(draft.heightCm) : ""}
            onChange={(e) => setDraft((d) => ({ ...d, heightCm: e.target.value ? Number(e.target.value) : null }))}
            placeholder="e.g. 178"
            className="w-28 rounded-lg bg-[var(--surface-elevated)] px-2 py-1.5 text-right text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
        </EditRow>
      )}
      <EditRow label="Age">
        <input
          type="date"
          value={draft.dateOfBirth ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, dateOfBirth: e.target.value || null }))}
          className="rounded-lg bg-[var(--surface-elevated)] px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
      </EditRow>
      <EditRow label="Sex">
        <select
          value={draft.sex ?? ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, sex: (e.target.value || null) as Profile["sex"] }))
          }
          className="rounded-lg bg-[var(--surface-elevated)] px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <option value="">—</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </EditRow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared layout components
// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 mx-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-subtle)]">
        {label}
      </p>
      <div className="rounded-[var(--radius-card)] bg-[var(--surface)] overflow-hidden divide-y divide-[var(--border)]">
        {children}
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-[var(--text)]">{value}</span>
        {sub && (
          <p className="text-[10px] text-[var(--text-subtle)] mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  );
}

function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="px-4 pt-8 space-y-6">
      <div className="flex flex-col items-center gap-3">
        <div className="h-24 w-24 animate-pulse rounded-full bg-[var(--surface)]" />
        <div className="h-5 w-32 animate-pulse rounded bg-[var(--surface)]" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface)]" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
