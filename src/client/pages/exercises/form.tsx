import { useState } from "react";
import { Link } from "react-router";
import {
  ExerciseSchema,
  type Exercise,
  type ExerciseType,
  type Muscle,
} from "../../../shared";
import { NameField } from "./form-fields/name";
import { TypeField } from "./form-fields/type";
import { MusclesField } from "./form-fields/muscles";
import { EquipmentField } from "./form-fields/equipment";
import { AliasesField } from "./form-fields/aliases";
import { LongTextField } from "./form-fields/long-text";
import { VideoUrlField } from "./form-fields/video-url";
import { FormError } from "./form-error";

export type ExerciseFormState = {
  name: string;
  type: ExerciseType;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipmentIds: string[];
  aliases: string[];
  description: string;
  instructions: string;
  notes: string;
  videoUrl: string;
};

type FieldErrors = Partial<Record<"name" | "videoUrl", string>>;

type Props = {
  mode: "create" | "edit";
  initial: ExerciseFormState;
  baseRecord: Pick<Exercise, "id" | "createdAt" | "lastUsedAt">;
  onSubmit: (record: Exercise) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
};

export function ExerciseForm({
  mode,
  initial,
  baseRecord,
  onSubmit,
  onCancel,
  submitLabel,
}: Props) {
  const [state, setState] = useState<ExerciseFormState>(initial);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = <K extends keyof ExerciseFormState>(key: K, value: ExerciseFormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const togglePrimary = (m: Muscle) =>
    setState((prev) => ({
      ...prev,
      primaryMuscles: prev.primaryMuscles.includes(m)
        ? prev.primaryMuscles.filter((x) => x !== m)
        : [...prev.primaryMuscles, m],
    }));

  const toggleSecondary = (m: Muscle) =>
    setState((prev) => ({
      ...prev,
      secondaryMuscles: prev.secondaryMuscles.includes(m)
        ? prev.secondaryMuscles.filter((x) => x !== m)
        : [...prev.secondaryMuscles, m],
    }));

  const toggleEquipment = (id: string) =>
    setState((prev) => ({
      ...prev,
      equipmentIds: prev.equipmentIds.includes(id)
        ? prev.equipmentIds.filter((x) => x !== id)
        : [...prev.equipmentIds, id],
    }));

  const onAddedEquipment = (id: string) =>
    setState((prev) =>
      prev.equipmentIds.includes(id)
        ? prev
        : { ...prev, equipmentIds: [...prev.equipmentIds, id] },
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const errs: FieldErrors = {};
    const trimmedName = state.name.trim();
    if (!trimmedName) errs.name = "Name is required";

    const videoUrlTrimmed = state.videoUrl.trim();
    if (videoUrlTrimmed && !/^https?:\/\//i.test(videoUrlTrimmed)) {
      errs.videoUrl = "Must be an http(s) URL";
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setFormError("Please fix the errors above.");
      return;
    }

    const now = Date.now();
    const candidate = {
      id: baseRecord.id,
      name: trimmedName,
      type: state.type,
      primaryMuscles: state.primaryMuscles,
      secondaryMuscles: state.secondaryMuscles,
      equipmentIds: state.equipmentIds,
      aliases: state.aliases,
      description: state.description.trim() ? state.description : null,
      instructions: state.instructions.trim() ? state.instructions : null,
      notes: state.notes.trim() ? state.notes : null,
      videoUrls: videoUrlTrimmed ? [videoUrlTrimmed] : [],
      createdAt: baseRecord.createdAt,
      updatedAt: now,
      lastUsedAt: baseRecord.lastUsedAt,
    };

    const parsed = ExerciseSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setFormError(first ? `${first.path.join(".") || "form"}: ${first.message}` : "Invalid input");
      return;
    }

    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <NameField
        value={state.name}
        onChange={(v) => update("name", v)}
        error={fieldErrors.name}
      />
      <TypeField value={state.type} onChange={(v) => update("type", v)} />
      <MusclesField
        legend="Primary muscles"
        selected={state.primaryMuscles}
        onToggle={togglePrimary}
      />
      <MusclesField
        legend="Secondary muscles"
        selected={state.secondaryMuscles}
        onToggle={toggleSecondary}
      />
      <EquipmentField
        selectedIds={state.equipmentIds}
        onToggle={toggleEquipment}
        onAdd={onAddedEquipment}
      />
      <AliasesField values={state.aliases} onChange={(v) => update("aliases", v)} />
      <LongTextField
        id="exercise-description"
        label="Description"
        value={state.description}
        onChange={(v) => update("description", v)}
        maxLength={5000}
        rows={3}
      />
      <LongTextField
        id="exercise-instructions"
        label="Instructions"
        value={state.instructions}
        onChange={(v) => update("instructions", v)}
        maxLength={10000}
        rows={5}
      />
      <LongTextField
        id="exercise-notes"
        label="Notes"
        value={state.notes}
        onChange={(v) => update("notes", v)}
        maxLength={2000}
        rows={3}
      />
      <VideoUrlField
        value={state.videoUrl}
        onChange={(v) => update("videoUrl", v)}
        error={fieldErrors.videoUrl}
      />
      <FormError message={formError} />
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
        >
          {pending ? "Saving…" : (submitLabel ?? (mode === "create" ? "Create" : "Save"))}
        </button>
      </div>
    </form>
  );
}

export const emptyFormState = (): ExerciseFormState => ({
  name: "",
  type: "strength",
  primaryMuscles: [],
  secondaryMuscles: [],
  equipmentIds: [],
  aliases: [],
  description: "",
  instructions: "",
  notes: "",
  videoUrl: "",
});

export const exerciseToFormState = (e: Exercise): ExerciseFormState => ({
  name: e.name,
  type: e.type,
  primaryMuscles: e.primaryMuscles,
  secondaryMuscles: e.secondaryMuscles,
  equipmentIds: e.equipmentIds,
  aliases: e.aliases,
  description: e.description ?? "",
  instructions: e.instructions ?? "",
  notes: e.notes ?? "",
  videoUrl: e.videoUrls[0] ?? "",
});
