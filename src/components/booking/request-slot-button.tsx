'use client';

/**
 * The "request this slot" button — a client component only so it can
 * read its parent <form>'s pending state (useFormStatus requires a
 * Client Component). Without this, a plain server-rendered <button> gave
 * zero feedback during the request round-trip: nothing visibly changed
 * between the first click and the eventual redirect, so a confused
 * customer would click again (and again) thinking the first click hadn't
 * registered — each click submitted a real, separate booking request.
 * Disabling on pending stops that at the source; the idempotencyKey
 * hidden field the parent form carries (see the booking page) is the
 * server-side backstop for the same double-submit, in case a click
 * lands before React re-renders this as disabled.
 */
import { useFormStatus } from 'react-dom';

type Props = {
  startLabel: string;
  endLabel: string;
  title: string;
};

export function RequestSlotButton({ startLabel, endLabel, title }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      title={title}
      className="focus-visible:outline-accent flex w-full flex-col items-center rounded-xl border border-line bg-surface px-2 py-2.5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:bg-accent-wash hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-70"
    >
      {pending ? (
        <span className="flex items-center gap-1.5 py-0.5">
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-accent-strong border-t-transparent"
          />
          <span className="font-display text-[10px] font-bold text-accent-strong">Requesting…</span>
        </span>
      ) : (
        <>
          <span className="font-display text-xs font-bold text-foreground">{startLabel}</span>
          <span className="text-[10px] text-faint">– {endLabel}</span>
        </>
      )}
    </button>
  );
}
