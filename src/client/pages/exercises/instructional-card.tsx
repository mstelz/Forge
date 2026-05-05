type Props = {
  videoUrl: string | null;
  description: string | null;
};

const safeHostname = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export function InstructionalCard({ videoUrl, description }: Props) {
  if (!videoUrl && !description) return null;
  const host = videoUrl ? safeHostname(videoUrl) : null;

  return (
    <section className="space-y-3 rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
      {videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Watch form guide${host ? ` on ${host}` : ""} (opens in new tab)`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <div className="relative aspect-video overflow-hidden rounded-[10px] bg-[var(--surface-elevated)]">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)]">
                <PlayIcon />
              </span>
            </div>
          </div>
          {host ? (
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Watch: {host}
            </p>
          ) : null}
        </a>
      ) : null}
      {description ? (
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">{description}</p>
      ) : null}
    </section>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
