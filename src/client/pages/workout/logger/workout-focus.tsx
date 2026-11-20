import { ChevronDown, Target } from "lucide-react";
import { readWorkoutGuidance } from "../../../lib/session/workout-guidance";

export function WorkoutFocus({ templateSnapshot }: { templateSnapshot: string | null }) {
  const { dayNotes, routineNotes, programDescription } = readWorkoutGuidance(templateSnapshot);
  const focus = dayNotes || routineNotes;
  if (!focus && !programDescription) return null;

  return (
    <details className="group rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] open:border-[var(--accent)]/40 open:bg-[var(--accent)]/5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-card)] px-3 text-sm font-semibold text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] [&::-webkit-details-marker]:hidden">
        <Target size={16} className="text-[var(--accent)]" aria-hidden="true" />
        Today’s focus
        <ChevronDown size={16} className="ml-auto text-[var(--text-muted)] group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-2 px-3 pb-3 text-sm">
        {focus && <p className="whitespace-pre-wrap wrap-break-word text-[var(--text)]">{focus}</p>}
        {dayNotes && routineNotes && <GuidanceDetails label="Routine notes" text={routineNotes} />}
        {programDescription && <GuidanceDetails label="Program overview" text={programDescription} />}
      </div>
    </details>
  );
}

function GuidanceDetails({ label, text }: { label: string; text: string }) {
  return (
    <details>
      <summary className="cursor-pointer rounded-sm py-1 font-semibold text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
        {label}
      </summary>
      <p className="whitespace-pre-wrap wrap-break-word text-[var(--text-muted)]">{text}</p>
    </details>
  );
}
