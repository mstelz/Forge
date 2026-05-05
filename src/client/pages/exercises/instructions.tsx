type Props = { instructions: string | null };

export function Instructions({ instructions }: Props) {
  if (!instructions) return null;
  return (
    <section className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        Instructions
      </h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
        {instructions}
      </p>
    </section>
  );
}
