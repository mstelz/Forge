/**
 * Per-exercise progress chart.
 *
 * Hand-rolled inline SVG in the same spirit as the bodyweight sparkline on
 * Profile — no charting dependency, no colour literals, every stroke painted
 * from a theme variable so it reads in light and dark alike.
 *
 * All arithmetic lives in ./series, ./plot and ./format, which are unit-tested.
 * This file is only the drawing.
 */

import { useMemo, useState } from "react";
import type { SessionSetLog } from "../../../shared/session-log";
import type { ExerciseType } from "../../../shared/enums";
import { availableMetrics, buildSeries, type Metric } from "./series";
import { axisRange, linePoints, plotPoints } from "./plot";
import {
  describeTrend,
  formatAxisDate,
  formatMetricValue,
  formatPointDate,
  metricLabel,
  metricName,
  type UnitPrefs,
} from "./format";

const BOX = { width: 300, height: 120, pad: 12 };

type Props = {
  logs: SessionSetLog[];
  exerciseType: ExerciseType;
  weightUnit: UnitPrefs["weightUnit"];
  distanceUnit: UnitPrefs["distanceUnit"];
  timezone: string;
};

export function ProgressChart({
  logs,
  exerciseType,
  weightUnit,
  distanceUnit,
  timezone,
}: Props) {
  const prefs: UnitPrefs = { weightUnit, distanceUnit };
  const metrics = useMemo(
    () => availableMetrics(logs, exerciseType),
    [logs, exerciseType],
  );
  const [chosen, setChosen] = useState<Metric | null>(null);
  const [showTable, setShowTable] = useState(false);

  // The chosen metric can fall away when new logs arrive (or when the user
  // switches exercise), so always fall back to the best available one.
  const metric = chosen && metrics.includes(chosen) ? chosen : (metrics[0] ?? null);

  const points = useMemo(
    () => (metric ? buildSeries(logs, metric) : []),
    [logs, metric],
  );

  if (metric === null || points.length === 0) {
    return (
      <section className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
        <SectionHeading>Progress</SectionHeading>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Nothing to chart yet — log a set of this exercise and its trend appears here.
        </p>
      </section>
    );
  }

  const axis = axisRange(points.map((p) => p.value));
  const plotted = plotPoints(points, axis, BOX);
  const line = linePoints(plotted);
  const summary = describeTrend(metric, points, prefs);
  const single = points.length === 1;

  return (
    <section className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <SectionHeading>Progress</SectionHeading>
        <span className="text-[10px] text-[var(--text-subtle)] tabular">
          {metricLabel(metric, prefs)}
          {metric === "pace" ? " · lower is faster" : ""}
        </span>
      </div>

      {metrics.length > 1 ? (
        <div
          role="group"
          aria-label="Chart series"
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {metrics.map((m) => {
            const active = m === metric;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => setChosen(m)}
                className={[
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]",
                ].join(" ")}
              >
                {metricName(m)}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Grid so the y-axis labels span exactly the chart's height and the date
          labels span exactly its width. */}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-2">
        <svg
          viewBox={`0 0 ${BOX.width} ${BOX.height}`}
          className="h-auto w-full"
          role="img"
          aria-label={summary}
        >
          {/* Top and bottom rules stand in for the axis — 1px, border colour. */}
          <line
            x1={0}
            y1={BOX.pad}
            x2={BOX.width}
            y2={BOX.pad}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <line
            x1={0}
            y1={BOX.height - BOX.pad}
            x2={BOX.width}
            y2={BOX.height - BOX.pad}
            stroke="var(--border)"
            strokeWidth={1}
          />

          {line ? (
            <polyline
              points={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {plotted.map((p) =>
            p.clamped ? (
              // Pinned to the edge because its value sits outside the axis.
              // Drawn hollow so it never reads as a real reading at this height.
              <circle
                key={p.point.sessionId}
                cx={p.x}
                cy={p.y}
                r={4}
                fill="var(--surface)"
                stroke="var(--accent)"
                strokeWidth={1.5}
              />
            ) : (
              <circle
                key={p.point.sessionId}
                cx={p.x}
                cy={p.y}
                r={single ? 5 : 3}
                fill="var(--accent)"
              />
            ),
          )}
        </svg>

        <div className="flex flex-col justify-between text-right text-[10px] text-[var(--text-subtle)] tabular">
          <span>{formatMetricValue(metric, axis.max, prefs)}</span>
          <span>{formatMetricValue(metric, axis.min, prefs)}</span>
        </div>

        <div className="mt-1 flex justify-between text-[10px] text-[var(--text-subtle)] tabular">
          <span>{formatAxisDate(points[0]!.at, timezone)}</span>
          {points.length > 1 ? (
            <span>{formatAxisDate(points[points.length - 1]!.at, timezone)}</span>
          ) : null}
        </div>
        <div aria-hidden="true" />
      </div>

      {single ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          One session so far — log this exercise again to draw a trend.
        </p>
      ) : null}

      {axis.clampedCount > 0 ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {axis.clampedCount === 1 ? "1 session sits" : `${axis.clampedCount} sessions sit`}{" "}
          outside this range and {axis.clampedCount === 1 ? "is" : "are"} pinned to the
          edge. See the data below for the real figure.
        </p>
      ) : null}

      <button
        type="button"
        aria-expanded={showTable}
        onClick={() => setShowTable((v) => !v)}
        className="mt-3 rounded-md text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {showTable ? "Hide data" : "Show data"}
      </button>

      {showTable ? (
        <div className="mt-2 max-h-64 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[16rem] text-left text-xs">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                <th scope="col" className="py-1 pr-2 font-semibold">
                  Session
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  {metricLabel(metric, prefs)}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.sessionId} className="border-t border-[var(--border)]">
                  <td className="py-1.5 pr-2 text-[var(--text-muted)]">
                    {formatPointDate(p.at, timezone)}
                  </td>
                  <td className="py-1.5 text-right text-[var(--text)] tabular">
                    {formatMetricValue(metric, p.value, prefs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
      {children}
    </h2>
  );
}
