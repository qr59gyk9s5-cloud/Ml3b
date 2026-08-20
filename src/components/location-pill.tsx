'use client';

import { useLocation } from './location-provider';

/** The header's live location indicator — see location-provider.tsx for
 * the detection logic this just renders. */
export function LocationPill({
  className = '',
  onDark = false,
}: {
  className?: string;
  /** True on the dark navy header chrome — the pill itself is a
   * self-contained light chip either way, but the trailing text button
   * needs a lighter color to read against dark ink. */
  onDark?: boolean;
}) {
  const { status, label, detect } = useLocation();

  const display =
    status === 'granted' && label ? label : status === 'detecting' ? 'Locating…' : 'Cairo, Egypt';
  const isLive = status === 'granted';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-3 py-1.5 font-display text-xs font-bold text-accent-strong">
        <span
          className={`h-1.5 w-1.5 flex-none rounded-full bg-accent ${isLive ? 'animate-pulse-ring' : ''}`}
          aria-hidden
        />
        <svg
          className="flex-none"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
        >
          <path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        {display}
      </span>
      {status !== 'detecting' ? (
        <button
          type="button"
          onClick={detect}
          className={`focus-visible:outline-accent text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            onDark ? 'text-on-ink-muted hover:text-on-ink' : 'text-faint hover:text-accent-strong'
          }`}
        >
          {status === 'granted' ? 'Change' : 'Detect'}
        </button>
      ) : null}
    </div>
  );
}
