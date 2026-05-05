type Props = {
  message: string | null;
};

export function FormError({ message }: Props) {
  return (
    <div role="alert" aria-live="polite" className="min-h-[1.25rem]">
      {message ? (
        <p className="rounded-[10px] bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)] ring-1 ring-[var(--danger)]/30">
          {message}
        </p>
      ) : null}
    </div>
  );
}
