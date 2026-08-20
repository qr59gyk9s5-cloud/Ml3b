/**
 * PlayCairo's icon mark and wordmark — from the founder-approved design
 * canvas: a squircle badge with a play-triangle + pitch center-circle
 * (dual reading: "play" and "sports pitch"), gradient turf-green fill.
 * One component, not a duplicated SVG per usage site (header, footer,
 * favicon all reference the same shape).
 */
export function LogoMark({ size = 28, gradient = true }: { size?: number; gradient?: boolean }) {
  const id = 'logo-mark-gradient';
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden fill="none">
      <rect width="72" height="72" rx="20" fill={gradient ? `url(#${id})` : 'var(--accent)'} />
      <circle cx="36" cy="36" r="17" stroke="white" strokeOpacity="0.55" strokeWidth="2.4" />
      <path d="M29 24L50 36L29 48V24Z" fill="white" />
      {gradient ? (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="72" y2="72">
            <stop stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-strong)" />
          </linearGradient>
        </defs>
      ) : null}
    </svg>
  );
}

export function Logo({
  size = 26,
  className = '',
  onDark = false,
}: {
  size?: number;
  className?: string;
  /** True on the dark navy header/hero chrome — swaps the wordmark's
   * base color from --foreground (tuned for light surfaces) to --on-ink. */
  onDark?: boolean;
}) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span
        className={`font-display text-[15px] font-extrabold tracking-tight whitespace-nowrap ${onDark ? 'text-on-ink' : 'text-foreground'}`}
      >
        <span>Play</span>
        <span className={onDark ? 'text-accent-bright' : 'text-accent-strong'}>Cairo</span>
      </span>
    </span>
  );
}
