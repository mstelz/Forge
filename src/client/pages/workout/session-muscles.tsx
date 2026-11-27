import { useMemo } from "react";
import { MuscleMap } from "../../components/muscle-map/muscle-map";
import { useExercises } from "../../hooks/use-exercises";
import { sessionMuscleSets, setsToIntensity, type MuscleIntensities } from "../../lib/muscles/muscle-load";
import { MUSCLE_LABEL } from "../exercises/detail-header";
import type { SessionSetLog } from "../../../shared";

const formatSets = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Heatmap of working sets per muscle for a finished workout. */
export function SessionMuscles({ logs }: { logs: SessionSetLog[] }) {
  const { data: exercises } = useExercises();

  const sets = useMemo(() => {
    const byId = new Map((exercises ?? []).map((ex) => [ex.id, ex]));
    return sessionMuscleSets(logs, byId);
  }, [logs, exercises]);

  if (sets.size === 0) return null;

  const ranked = Array.from(sets).sort((a, b) => b[1] - a[1]);
  const max = ranked[0]![1];
  const intensities: MuscleIntensities = {};
  for (const [m, n] of ranked) intensities[m] = setsToIntensity(n);
  const label = `Working sets by muscle: ${ranked
    .map(([m, n]) => `${MUSCLE_LABEL[m] ?? m} ${formatSets(n)}`)
    .join(", ")}`;

  return (
    <section aria-labelledby="session-muscles-heading" className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
      <h3 id="session-muscles-heading" className="text-sm font-bold text-[var(--text)]">
        Muscles trained
      </h3>
      <MuscleMap intensities={intensities} label={label} className="mt-3" />

      <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-[var(--text-subtle)]" aria-hidden="true">
        <span className="mr-1">Fewer sets</span>
        {[1, 2, 3, 4].map((lvl) => (
          <span key={lvl} className="h-2 w-5 rounded-sm" style={{ background: `var(--muscle-${lvl})` }} />
        ))}
        <span className="ml-1">9+</span>
      </div>

      <ul className="mt-4 space-y-2" aria-hidden="true">
        {ranked.map(([m, n]) => (
          <li key={m} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)]">{MUSCLE_LABEL[m] ?? m}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-elevated)]">
              <span
                className="block h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${(n / max) * 100}%` }}
              />
            </span>
            <span className="text-right font-semibold tabular-nums text-[var(--text)]">{formatSets(n)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-[var(--text-subtle)]">
        Working sets. A secondary muscle counts as half a set.
      </p>
    </section>
  );
}
