import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  LayoutDashboard,
  Plus,
  XCircle,
} from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { getVenueByIdForStaff } from '@/domain/venue/staff-queries';
import { resolveVenueAuthzContext } from '@/domain/venue/authz-context';
import { listActiveFacilities } from '@/domain/venue/queries';
import { listBookingsForVenueWithDetails } from '@/domain/booking/queries';
import { DomainError } from '@/domain/errors';
import { VENUE_CANCELLATION_REASON } from '@/lib/config/constants';
import { VENUE_REASON_LABEL } from '@/lib/format/booking-status';
import { formatPriceMinor } from '@/lib/format/money';
import { now } from '@/lib/time/now';
import { confirmRequestAction, rejectRequestAction } from './actions';

type Props = {
  params: Promise<{ venueId: string }>;
  searchParams: Promise<{ error?: string; confirmed?: string; rejected?: string; manual?: string }>;
};

function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(date);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { venueId } = await params;
  const actor = await getSessionActor();
  if (!actor) return { title: 'Venue dashboard' };
  try {
    const venue = await getVenueByIdForStaff(venueId, actor);
    return { title: `${venue.name} — dashboard` };
  } catch {
    return { title: 'Venue dashboard' };
  }
}

export default async function VenueDashboardPage({ params, searchParams }: Props) {
  const { venueId } = await params;
  const sp = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect(`/sign-in?next=/dashboard/${venueId}`);

  let venue;
  try {
    venue = await getVenueByIdForStaff(venueId, actor);
  } catch (err) {
    if (err instanceof DomainError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }

  const venueActor = { userId: actor.userId, isPlatformAdmin: actor.isPlatformAdmin };
  const [ctx, requests, confirmed, venueFacilities] = await Promise.all([
    resolveVenueAuthzContext(venueId, venueActor),
    listBookingsForVenueWithDetails(venueId, venueActor, { status: 'REQUESTED' }),
    listBookingsForVenueWithDetails(venueId, venueActor, { status: 'CONFIRMED' }),
    listActiveFacilities(venueId),
  ]);

  const currentTime = now();
  const upcomingConfirmed = confirmed
    .filter((b) => b.startAt.getTime() > currentTime)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> All venues
      </Link>

      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-accent-strong" aria-hidden />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">{venue.name}</h1>
            <p className="text-xs text-muted">
              {ctx.isPlatformAdmin && !ctx.venueRole ? 'Admin access' : ctx.venueRole}
            </p>
          </div>
        </div>
      </div>

      {sp.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-danger-wash px-3 py-2.5 text-sm font-medium text-danger"
        >
          {sp.error}
        </p>
      ) : null}
      {sp.confirmed ? (
        <p className="mb-4 rounded-xl bg-accent-wash px-3 py-2.5 text-sm font-medium text-accent-strong">
          Booking confirmed.
        </p>
      ) : null}
      {sp.rejected ? (
        <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-muted">
          Request rejected.
        </p>
      ) : null}
      {sp.manual ? (
        <p className="mb-4 rounded-xl bg-accent-wash px-3 py-2.5 text-sm font-medium text-accent-strong">
          Walk-in booking added.
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wide text-faint uppercase">
          Needs your response{requests.length > 0 ? ` (${requests.length})` : ''}
        </h2>
        {requests.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            No pending requests.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {requests.map((booking) => (
              <li
                key={booking.id}
                className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {booking.facilityName}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(booking.startAt, venue.timezone)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {booking.customerName ?? 'Marketplace customer'}
                      {booking.customerPhone ? ` · ${booking.customerPhone}` : ''}
                    </p>
                  </div>
                  <div className="flex-none text-right">
                    <p className="font-mono text-xs text-faint">{booking.reference}</p>
                    <p className="text-sm font-bold text-accent-strong">
                      {formatPriceMinor(booking.totalMinor, booking.currency)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={confirmRequestAction}>
                    <input type="hidden" name="venueId" value={venueId} />
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button
                      type="submit"
                      className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Confirm
                    </button>
                  </form>

                  <form action={rejectRequestAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="venueId" value={venueId} />
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <select
                      name="reason"
                      required
                      className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-foreground"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Reason…
                      </option>
                      {VENUE_CANCELLATION_REASON.map((reason) => (
                        <option key={reason} value={reason}>
                          {VENUE_REASON_LABEL[reason]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-danger-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden /> Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-faint uppercase">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          Upcoming confirmed{upcomingConfirmed.length > 0 ? ` (${upcomingConfirmed.length})` : ''}
        </h2>
        {upcomingConfirmed.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            Nothing confirmed and upcoming yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcomingConfirmed.map((booking) => (
              <li
                key={booking.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {booking.facilityName}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(booking.startAt, venue.timezone)} ·{' '}
                    {booking.customerName ?? 'Marketplace customer'}
                  </p>
                </div>
                <span
                  className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    booking.source === 'MANUAL'
                      ? 'bg-surface-2 text-faint'
                      : 'bg-accent-wash text-accent-strong'
                  }`}
                >
                  {booking.source === 'MANUAL' ? 'Walk-in' : 'Online'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-bold tracking-wide text-faint uppercase">
          Add a walk-in booking
        </h2>
        {venueFacilities.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            No active facilities yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {venueFacilities.map((facility) => (
              <li key={facility.id}>
                <Link
                  href={`/dashboard/${venueId}/manual/${facility.id}`}
                  className="focus-visible:outline-accent flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="text-sm font-bold text-foreground">{facility.name}</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-accent-strong">
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add booking
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
