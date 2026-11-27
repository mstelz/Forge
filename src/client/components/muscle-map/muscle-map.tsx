import type { MuscleIntensities } from "../../lib/muscles/muscle-load";
import { BACK_SHAPES, BODY_HEAD, BODY_VIEWBOX, FRONT_SHAPES, type BodyShape } from "./body-shapes";

type Props = {
  intensities: MuscleIntensities;
  /** Spoken description of what is highlighted, e.g. "Primary: quads, glutes". */
  label: string;
  className?: string;
};

/** Front and back body figures with each muscle shaded by intensity (0–4). */
export function MuscleMap({ intensities, label, className }: Props) {
  return (
    <div role="img" aria-label={label} className={`flex justify-center gap-6 ${className ?? ""}`}>
      <Figure caption="Front" shapes={FRONT_SHAPES} intensities={intensities} />
      <Figure caption="Back" shapes={BACK_SHAPES} intensities={intensities} />
    </div>
  );
}

function Figure({
  caption,
  shapes,
  intensities,
}: {
  caption: string;
  shapes: BodyShape[];
  intensities: MuscleIntensities;
}) {
  const fill = (s: BodyShape) =>
    s.muscle === null ? "var(--muscle-structure)" : `var(--muscle-${intensities[s.muscle] ?? 0})`;
  const half = shapes.map((s, i) => (
    <polygon key={i} points={s.points} fill={fill(s)} data-muscle={s.muscle ?? undefined} />
  ));
  const { width, height } = BODY_VIEWBOX;
  // Crop the empty margin either side of the arms.
  const cropX = 30;

  return (
    <figure className="flex flex-col items-center gap-1.5">
      <svg
        viewBox={`${cropX} 0 ${width - cropX * 2} ${height}`}
        className="h-56 w-auto"
        stroke="var(--muscle-gap)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <ellipse {...BODY_HEAD} fill="var(--muscle-structure)" />
        <g>{half}</g>
        <g transform={`translate(${width},0) scale(-1,1)`}>{half}</g>
      </svg>
      <figcaption className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-subtle)]">
        {caption}
      </figcaption>
    </figure>
  );
}
