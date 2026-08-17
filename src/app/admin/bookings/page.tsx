import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertTriangle, Search } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { findBookingByReference } from '@/domain/admin/queries';
import { resolveBookingAuthzContext } from '@/domain/booking/authz-context';
import { findBookingTransitionRule, isTerminalBookingStatus } from '@/domain/booking/state-machine';
import { BOOKING_STATUS } from '@/lib/config/constants';
import { CUSTOMER_STATUS_LABEL } from '@/lib/format/booking-status';
import { formatPriceMinor } from '@/lib/format/money';
import { overrideBookingAction } from './actions';

export const metadata: Metadata = { title: 'Admin — Bookings — Sports Venue Marketplace' };

type Props = { searchParams: Promise<{ ref?: string; error?: string; done?: string }> };

export default async function AdminBookingsPage({ searchParams }: Props) {
  const { ref, error, done } = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/bookings');
  if (!actor.isPlatformAdmin) redirect('/');

  const booking = ref
    ? await findBookingByReference(ref, { userId: actor.userId, isPlatformAdmin: true })
    : null;

  let overrideTargets: string[] = [];
  if (booking && isTerminalBookingStatus(booking.status)) {
    const ctx = await resolveBookingAuthzContext(booking, {
      userId: actor.userId,
      isPlatformAdmin: true,
    });
    overrideTargets = BOOKING_STATUS.filter((target) => {
      const rule = findBookingTransitionRule(booking.status, target);
      return rule !== undefined && rule.allow(ctx);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex gap-2" action="/admin/bookings">
        <input
          type="text"
          name="ref"
          defaultValue={ref ?? ''}
          placeholder="Booking reference, e.g. BK-A1B2C3"
          className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint"
        />
        <button
          type="submit"
          className="focus-visible:outline-accent flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Search className="h-4 w-4" aria-hidden />
          Search
        </button>
      </form>

      {error ? (
        <p className="rounded-xl bg-danger-wash px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="rounded-xl bg-accent-wash px-3 py-2 text-xs font-semibold text-accent-strong">
          Done.
        </p>
      ) : null}

      {ref && !booking ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
          No booking found with reference &ldquo;{ref}&rdquo;.
        </p>
      ) : null}

      {booking ? (
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-sm font-bold text-foreground">{booking.reference}</p>
          <p className="text-xs text-muted">
            {booking.venueName} · {booking.facilityName}
          </p>
          <p className="mt-2 text-xs text-foreground">
            Status: <span className="font-semibold">{CUSTOMER_STATUS_LABEL[booking.status]}</span> (
            {booking.status})
          </p>
          <p className="text-xs text-muted">
            {new Intl.DateTimeFormat('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(booking.startAt)}{' '}
            · {formatPriceMinor(booking.totalMinor, booking.currency)}
          </p>

          {overrideTargets.length > 0 ? (
            <form
              action={overrideBookingAction}
              className="mt-4 flex flex-col gap-2 border-t border-line pt-4"
            >
              <input type="hidden" name="bookingId" value={booking.id} />
              <input type="hidden" name="reference" value={booking.reference} />
              <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-floodlight" aria-hidden />
                Admin override
              </label>
              <select
                name="targetStatus"
                required
                defaultValue=""
                className="rounded-lg border border-line bg-surface px-2.5 py-2 text-xs font-medium text-foreground"
              >
                <option value="" disabled>
                  Move to…
                </option>
                {overrideTargets.map((target) => (
                  <option key={target} value={target}>
                    {target}
                  </option>
                ))}
              </select>
              <textarea
                name="overrideReason"
                required
                placeholder="Why? This is required and permanently recorded in the audit log."
                rows={2}
                className="rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-faint"
              />
              <button
                type="submit"
                className="focus-visible:outline-accent self-start rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Apply override
              </button>
            </form>
          ) : (
            <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
              This booking is in an active state — no override needed. Use the venue dashboard for
              normal confirm/reject/cancel actions.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
