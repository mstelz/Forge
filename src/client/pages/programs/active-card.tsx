import { Link } from "react-router";
import type { Program, ProgramRun } from "../../../shared";
import { computeRunProgress, computeWeekDots } from "../../lib/programs/run-progress";

type Props = {
  program: Program;
  run: ProgramRun;
};

export function ActiveProgramCard({ program, run }: Props) {
  const progress = computeRunProgress(program, run);
  const dots = computeWeekDots(program, run, 8);
  const weekLabel = `Week ${run.currentWeekIndex + 1} of ${program.durationWeeks}`;
  const desc = program.description?.split("\n")[0]?.trim();
  const subtitle = desc ? `${weekLabel} · ${desc}` : weekLabel;

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
      {/* Amber left edge accent */}
      <div className="absolute inset-y-0 left-0 w-1 bg-[var(--accent)]" />

      <div className="px-4 py-4 pl-5">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
          Active
        </span>
        <h2 className="mt-1 text-xl font-bold text-[var(--text)]">{program.name}</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>

        {/* Progress bar */}
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progress}% complete`}
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Week dots */}
        <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
          {dots.map((val, i) => (
            <WeekDot key={i} value={val} />
          ))}
        </div>

        <div className="mt-3 flex justify-end">
          <Link
            to={`/programs/${program.id}`}
            className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)] hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            View Program ›
          </Link>
        </div>
      </div>
    </div>
  );
}

function WeekDot({ value }: { value: number }) {
  if (value >= 1) {
    return (
      <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
    );
  }
  if (value >= 0.5) {
    return (
      <div className="relative h-2.5 w-2.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-[var(--accent)]" />
      </div>
    );
  }
  return (
    <div className="h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-transparent" />
  );
}
