import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { CalendarCheck, MapPin } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { listBookingsForCustomerWithDetails } from '@/domain/booking/queries';
import { CANCELLATION_CUTOFF_HOURS } from '@/lib/config/constants';
import { now } from '@/lib/time/now';
import {
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_TONE,
  VENUE_REASON_LABEL,
} from '@/lib/format/booking-status';
import { formatPriceMinor } from '@/lib/format/money';
import { generateBookingQrDataUrl } from '@/lib/format/qr-code';
import { cancelBookingAction } from './actions';

export const metadata: Metadata = { title: 'My bookings' };

type Props = {
  searchParams: Promise<{ error?: string; cancelled?: string; requested?: string }>;
};

const TONE_CLASS: Record<string, string> = {
  pending: 'bg-floodlight-wash text-floodlight',
  positive: 'bg-accent-wash text-accent-strong',
  negative: 'bg-danger-wash text-danger',
  neutral: 'bg-surface-2 text-faint',
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

export default async function MyBookingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/bookings');

  const myBookings = await listBookingsForCustomerWithDetails(actor.userId, {
    userId: actor.userId,
    isPlatformAdmin: actor.isPlatformAdmin,
  });

  const cutoffMs = CANCELLATION_CUTOFF_HOURS * 60 * 60 * 1000;
  const currentTime = now();

  const qrCodesByBookingId = new Map(
    await Promise.all(
      myBookings
        .filter((b) => b.status === 'CONFIRMED')
        .map(async (b) => [b.id, await generateBookingQrDataUrl(b.reference)] as const),
    ),
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-accent-strong" aria-hidden />
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">My bookings</h1>
      </div>

      {sp.requested ? (
        <p className="mb-4 rounded-xl bg-accent-wash px-3 py-2.5 text-sm font-medium text-accent-strong">
          Request sent — the venue usually responds within 30 minutes.
        </p>
      ) : null}
      {sp.cancelled ? (
        <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-muted">
          Booking cancelled.
        </p>
      ) : null}
      {sp.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-danger-wash px-3 py-2.5 text-sm font-medium text-danger"
        >
          {sp.error}
        </p>
      ) : null}

      {myBookings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <span aria-hidden className="text-2xl">
            📭
          </span>
          <p className="text-sm font-medium text-foreground">No bookings yet</p>
          <p className="max-w-sm text-xs text-muted">
            Browse venues and request a slot to see it here.
          </p>
          <Link
            href="/"
            className="focus-visible:outline-accent mt-2 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Browse venues
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {myBookings.map((booking) => {
            const canCancel =
              (booking.status === 'REQUESTED' || booking.status === 'CONFIRMED') &&
              booking.startAt.getTime() - currentTime > cutoffMs;
            return (
              <li
                key={booking.id}
                className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/venues/${booking.venueSlug}`}
                      className="truncate text-sm font-bold text-foreground hover:text-accent-strong"
                    >
                      {booking.facilityName}
                    </Link>
                    <p className="flex items-center gap-1 text-xs text-muted">
                      <MapPin className="h-3 w-3 flex-none" aria-hidden />
                      {booking.venueName}
                    </p>
                  </div>
                  <span
                    className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${TONE_CLASS[CUSTOMER_STATUS_TONE[booking.status]]}`}
                  >
                    {CUSTOMER_STATUS_LABEL[booking.status]}
                  </span>
                </div>

                <p className="mt-2.5 text-sm font-semibold text-foreground">
                  {formatDateTime(booking.startAt, booking.venueTimezone)}
                </p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span className="font-mono">{booking.reference}</span>
                  <span className="font-bold text-accent-strong">
                    {formatPriceMinor(booking.totalMinor, booking.currency)}
                  </span>
                </div>

                {booking.status === 'CONFIRMED' && qrCodesByBookingId.has(booking.id) ? (
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a
                        generated data: URI, not an optimizable remote image */}
                    <img
                      src={qrCodesByBookingId.get(booking.id)}
                      alt={`Check-in QR code for booking ${booking.reference}`}
                      width={64}
                      height={64}
                      className="flex-none rounded-lg bg-white p-1"
                    />
                    <p className="text-xs text-muted">
                      Show this at check-in — venue staff scan it to verify your reservation.
                    </p>
                  </div>
                ) : null}

                {booking.status === 'CANCELLED_BY_VENUE' && booking.cancellationReason ? (
                  <p className="mt-2 text-xs text-danger">
                    Reason: {VENUE_REASON_LABEL[booking.cancellationReason]}
                  </p>
                ) : null}

                {canCancel ? (
                  <form action={cancelBookingAction} className="mt-3">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button
                      type="submit"
                      className="focus-visible:outline-accent rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-danger-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      Cancel booking
                    </button>
                  </form>
                ) : booking.status === 'CONFIRMED' ? (
                  <p className="mt-3 text-[11px] text-faint">
                    Too close to start time to cancel ({CANCELLATION_CUTOFF_HOURS}h cutoff).
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
