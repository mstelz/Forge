import type { Routine, RoutineItemOverride } from "../../../../shared";
import type { BuilderState } from "./state";
import { XSmallIcon, PlusSmallIcon } from "./icons";

// The week/day schedule grid for the program builder, extracted from index.tsx (issue 09).
// Owns the shared DAY_LABELS constant and the DayCellPickerTarget shape that the picker
// sheet and the builder page also consume.

export const DAY_LABELS = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"];

export type DayCellPickerTarget = {
  weekIndex: number;
  dayIndex: number;
  order: number;
  routineId: string | null;
  isRestDay: boolean;
  notes: string | null;
  overrides: RoutineItemOverride[] | null;
  /** True when opening the picker to add a second+ workout to the day */
  isAddingWorkout: boolean;
};

type WeekGridProps = {
  state: BuilderState;
  routineMap: Map<string, Routine>;
  onWorkoutTap: (target: DayCellPickerTarget) => void;
  onAddWorkout: (weekIndex: number, dayIndex: number) => void;
  onRemoveWorkout: (weekIndex: number, dayIndex: number, order: number) => void;
};

export function WeekGrid({ state, routineMap, onWorkoutTap, onAddWorkout, onRemoveWorkout }: WeekGridProps) {
  const { durationWeeks, days } = state.draft;

  return (
    <div className="space-y-2">
      {Array.from({ length: durationWeeks }, (_, wi) => (
        <div key={wi} className="rounded-[var(--radius-card)] overflow-hidden bg-[var(--surface)]">
          {/* Week header */}
          <div className="flex items-center px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">
              Week {String(wi + 1).padStart(2, "0")}
            </span>
          </div>

          {/* Day rows */}
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 7 }, (_, di) => {
              const dayEntries = days
                .filter((d) => d.weekIndex === wi && d.dayIndex === di)
                .sort((a, b) => a.order - b.order);
              const primary = dayEntries.find((d) => d.order === 0) ?? dayEntries[0];
              const isRest = primary?.isRestDay ?? false;
              const workouts = dayEntries.filter((d) => d.routineId);

              return (
                <div
                  key={di}
                  className="flex min-h-[42px] items-start gap-2 px-3 py-2"
                >
                  {/* Day label */}
                  <span className="mt-1 w-6 flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">
                    {DAY_LABELS[di]}
                  </span>

                  {/* Content */}
                  <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-0">
                    {isRest ? (
                      <button
                        type="button"
                        onClick={() =>
                          onWorkoutTap({
                            weekIndex: wi,
                            dayIndex: di,
                            order: 0,
                            routineId: null,
                            isRestDay: true,
                            notes: primary?.notes ?? null,
                            overrides: null,
                            isAddingWorkout: false,
                          })
                        }
                        className="rounded-md px-2 py-0.5 text-[11px] text-[var(--text-subtle)] border border-dashed border-[var(--border)] hover:border-[var(--accent)]/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] italic"
                      >
                        rest
                      </button>
                    ) : (
                      <>
                        {workouts.map((d) => {
                          const routine = routineMap.get(d.routineId!);
                          const hasOverrides = !!(d.overrides?.length);
                          const chipLabel = d.label
                            ? `${routine?.name ?? "?"} · ${d.label}`
                            : (routine?.name ?? "?");
                          return (
                            <div
                              key={d.id}
                              className="flex items-center gap-0.5 rounded-md bg-[var(--surface-elevated)] ring-1 ring-[var(--border)] pl-2 pr-0.5 py-0.5"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  onWorkoutTap({
                                    weekIndex: wi,
                                    dayIndex: di,
                                    order: d.order,
                                    routineId: d.routineId,
                                    isRestDay: false,
                                    notes: d.notes ?? null,
                                    overrides: d.overrides ?? null,
                                    isAddingWorkout: false,
                                  })
                                }
                                aria-label={`Edit ${chipLabel}`}
                                className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded"
                              >
                                {chipLabel}
                                {hasOverrides ? (
                                  <span
                                    aria-label="has overrides"
                                    className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] opacity-70"
                                  />
                                ) : null}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveWorkout(wi, di, d.order);
                                }}
                                aria-label={`Remove ${chipLabel}`}
                                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[var(--text-subtle)] hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                              >
                                <XSmallIcon />
                              </button>
                            </div>
                          );
                        })}

                        {/* Add workout button */}
                        {!isRest && (
                          <button
                            type="button"
                            onClick={() => onAddWorkout(wi, di)}
                            aria-label={`Add workout to Week ${wi + 1} ${DAY_LABELS[di]}`}
                            className="flex items-center gap-0.5 rounded-md border border-dashed border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-subtle)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                          >
                            <PlusSmallIcon />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
