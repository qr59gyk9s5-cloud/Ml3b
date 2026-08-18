'use client';

import { useLocation } from './location-provider';

/** The search bar's "Locate" chip — re-triggers detection so nearby
 * venues sort to the top without the visitor typing anything. */
export function LocateButton() {
  const { status, detect } = useLocation();
  return (
    <button
      type="button"
      onClick={detect}
      disabled={status === 'detecting'}
      className="focus-visible:outline-accent flex flex-none items-center gap-1.5 rounded-full bg-accent-wash px-2.5 py-1.5 font-display text-[11px] font-bold text-accent-strong transition-colors hover:bg-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        aria-hidden
      >
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="5" />
      </svg>
      {status === 'detecting' ? 'Locating…' : 'Locate'}
    </button>
  );
}
