import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { getVenueByIdForStaff } from '@/domain/venue/staff-queries';
import { getActiveFacilityById } from '@/domain/venue/queries';
import { getAvailableSlots } from '@/domain/availability/queries';
import { addLocalDays, todayInTimeZone } from '@/domain/availability/time';
import { DomainError } from '@/domain/errors';
import { formatPriceMinor } from '@/lib/format/money';
import {
  computeDurationOptions,
  computeValidStartIndexes,
  formatDateLabel,
  formatSlotTime,
} from '@/lib/booking/slot-picker';
import { createManualBookingAction } from './actions';

type Props = {
  params: Promise<{ venueId: string; facilityId: string }>;
  searchParams: Promise<{ date?: string; duration?: string; error?: string }>;
};

export const metadata: Metadata = { title: 'Add a walk-in booking' };

export default async function ManualBookingPage({ params, searchParams }: Props) {
  const { venueId, facilityId } = await params;
  const sp = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect(`/sign-in?next=/dashboard/${venueId}/manual/${facilityId}`);

  let venue;
  try {
    venue = await getVenueByIdForStaff(venueId, actor);
  } catch (err) {
    if (err instanceof DomainError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }

  const facility = await getActiveFacilityById(facilityId, venueId);
  if (!facility) notFound();

  const today = todayInTimeZone(venue.timezone);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const durationOptions = computeDurationOptions(facility);
  const requestedDuration = sp.duration ? Number(sp.duration) : durationOptions[0];
  const duration = durationOptions.includes(requestedDuration)
    ? requestedDuration
    : durationOptions[0];
  const slotsNeeded = duration / facility.slotDurationMinutes;

  const slots = await getAvailableSlots(facility.id, date);
  const validStarts = new Set(computeValidStartIndexes(slots, slotsNeeded));
  const dayLinks = Array.from({ length: 7 }, (_, i) => addLocalDays(today, i));

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link
        href={`/dashboard/${venueId}`}
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {venue.name}
      </Link>

      <h1 className="text-xl font-extrabold tracking-tight text-foreground">
        Add a walk-in booking — {facility.name}
      </h1>
      <p className="mt-1 text-xs text-muted">
        Goes straight to CONFIRMED, same double-booking guarantee as an online booking.
      </p>

      {sp.error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-danger-wash px-3 py-2.5 text-sm font-medium text-danger"
        >
          {sp.error}
        </p>
      ) : null}

      <form action={createManualBookingAction} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="venueId" value={venueId} />
        <input type="hidden" name="facilityId" value={facility.id} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="durationMinutes" value={duration} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Customer name</span>
            <input
              name="customerName"
              type="text"
              placeholder="Walk-in customer"
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Phone (optional)</span>
            <input
              name="customerPhone"
              type="tel"
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
        </div>

        {durationOptions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold tracking-wide text-faint uppercase">Duration</span>
            {durationOptions.map((d) => (
              <Link
                key={d}
                href={`?date=${date}&duration=${d}`}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                  d === duration
                    ? 'border-accent bg-accent text-white'
                    : 'border-line text-muted hover:border-accent'
                }`}
              >
                {d} min
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {dayLinks.map((d) => (
            <Link
              key={d}
              href={`?date=${d}&duration=${duration}`}
              className={`flex-none rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                d === date
                  ? 'border-accent bg-accent text-white'
                  : 'border-line text-muted hover:border-accent'
              }`}
            >
              {formatDateLabel(d)}
            </Link>
          ))}
        </div>

        <p className="text-xs font-bold tracking-wide text-faint uppercase">
          {duration}-minute slots ·{' '}
          {formatPriceMinor(
            Math.round((facility.basePriceMinor * duration) / 60),
            facility.currency,
          )}{' '}
          total
        </p>

        {slots.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Closed on this day.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot, i) => {
              const isValidStart = validStarts.has(i);
              const end = isValidStart ? slots[i + slotsNeeded - 1].endAt : slot.endAt;
              if (!isValidStart) {
                return (
                  <div
                    key={slot.startAt.toISOString()}
                    className="flex w-full flex-col items-center rounded-xl border border-line bg-surface-2 px-2 py-2.5 text-center opacity-50"
                    title={
                      slot.reason === 'BOOKED'
                        ? 'Already booked'
                        : 'Not enough room for this duration'
                    }
                  >
                    <span className="text-xs font-bold text-faint">
                      {formatSlotTime(slot.startAt, venue.timezone)}
                    </span>
                    <span className="text-[10px] text-faint">
                      {slot.available ? '' : slot.reason === 'BOOKED' ? 'Booked' : 'Closed'}
                    </span>
                  </div>
                );
              }
              return (
                <button
                  key={slot.startAt.toISOString()}
                  type="submit"
                  name="startAt"
                  value={slot.startAt.toISOString()}
                  title="Add this slot"
                  className="focus-visible:outline-accent flex w-full flex-col items-center rounded-xl border border-line bg-surface px-2 py-2.5 text-center transition-colors hover:border-accent hover:bg-accent-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="text-xs font-bold text-foreground">
                    {formatSlotTime(slot.startAt, venue.timezone)}
                  </span>
                  <span className="text-[10px] text-faint">
                    – {formatSlotTime(end, venue.timezone)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </form>
    </main>
  );
}
