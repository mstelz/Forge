export function HistoryPlaceholder() {
  return (
    <section className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        Recent history
      </h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        No history yet — log a workout to see progress here.
      </p>
    </section>
  );
}
