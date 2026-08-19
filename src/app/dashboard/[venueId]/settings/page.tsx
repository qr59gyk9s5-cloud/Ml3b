import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft, Settings as SettingsIcon } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { getVenueByIdForStaff } from '@/domain/venue/staff-queries';
import { resolveVenueAuthzContext } from '@/domain/venue/authz-context';
import { isVenueOwnerOrManager } from '@/domain/authz/venue';
import { DomainError } from '@/domain/errors';
import { OPEN_GAME_MAX_HOLD_HOURS, OPEN_GAME_MIN_LEAD_TIME_HOURS } from '@/lib/config/constants';
import { updateOpenGameSettingsAction } from './actions';

type Props = {
  params: Promise<{ venueId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export const metadata: Metadata = { title: 'Venue settings' };

export default async function VenueSettingsPage({ params, searchParams }: Props) {
  const { venueId } = await params;
  const sp = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect(`/sign-in?next=${encodeURIComponent(`/dashboard/${venueId}/settings`)}`);

  let venue;
  try {
    venue = await getVenueByIdForStaff(venueId, actor);
  } catch (err) {
    if (err instanceof DomainError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }

  const ctx = await resolveVenueAuthzContext(venueId, {
    userId: actor.userId,
    isPlatformAdmin: actor.isPlatformAdmin,
  });
  if (!isVenueOwnerOrManager(ctx)) {
    // Not FORBIDDEN-thrown — a receptionist isn't doing anything wrong by
    // landing here, this setting just isn't theirs to change.
    redirect(`/dashboard/${venueId}`);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <Link
        href={`/dashboard/${venueId}`}
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {venue.name}
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-accent-strong" aria-hidden />
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Venue settings</h1>
      </div>

      {sp.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-danger-wash px-3 py-2.5 text-sm font-medium text-danger"
        >
          {sp.error}
        </p>
      ) : null}
      {sp.saved ? (
        <p className="mb-4 rounded-xl bg-accent-wash px-3 py-2.5 text-sm font-medium text-accent-strong">
          Saved.
        </p>
      ) : null}

      <form
        action={updateOpenGameSettingsAction}
        className="rounded-2xl border border-line bg-surface p-4 shadow-sm"
      >
        <input type="hidden" name="venueId" value={venueId} />
        <p className="mb-1 text-sm font-bold text-foreground">Open games</p>
        <p className="mb-4 text-xs text-muted">
          How far ahead a game must be organized, and how long the roster can be provisionally held
          before it must fill. Leave a field blank to use the platform default.
        </p>

        <label className="mb-3 flex flex-col gap-1 text-xs font-bold text-faint uppercase">
          Minimum lead time (hours)
          <input
            type="number"
            name="minLeadTimeHours"
            min={1}
            max={72}
            step={1}
            placeholder={`Default: ${OPEN_GAME_MIN_LEAD_TIME_HOURS}`}
            defaultValue={venue.openGameMinLeadTimeHours ?? ''}
            className="focus-visible:outline-accent rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal text-foreground normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </label>

        <label className="mb-4 flex flex-col gap-1 text-xs font-bold text-faint uppercase">
          Maximum hold duration (hours)
          <input
            type="number"
            name="maxHoldHours"
            min={1}
            max={168}
            step={1}
            placeholder={`Default: ${OPEN_GAME_MAX_HOLD_HOURS}`}
            defaultValue={venue.openGameMaxHoldHours ?? ''}
            className="focus-visible:outline-accent rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal text-foreground normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </label>

        <button
          type="submit"
          className="btn-sheen focus-visible:outline-accent w-full rounded-xl bg-gradient-to-br from-accent to-accent-strong px-4 py-3 font-display text-sm font-bold text-white shadow-accent transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Save
        </button>
      </form>
    </main>
  );
}
