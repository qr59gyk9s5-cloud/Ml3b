import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft, MapPin } from 'lucide-react';
import { getActiveFacilityById, getPublicVenueBySlug } from '@/domain/venue/queries';
import { getAvailableSlots } from '@/domain/availability/queries';
import { addLocalDays, todayInTimeZone, type LocalDate } from '@/domain/availability/time';
import { formatPriceMinor } from '@/lib/format/money';
import { getSessionActor } from '@/lib/auth/session';
import { SportIcon } from '@/components/sport-icon';
import { requestBookingAction } from './actions';

type Props = {
  params: Promise<{ slug: string; facilityId: string }>;
  searchParams: Promise<{ date?: string; duration?: string; error?: string }>;
};

function formatSlotTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(date);
}

/** date is a plain 'YYYY-MM-DD' local calendar date — parsed at noon UTC
 * purely so Intl picks the right weekday, never as a real instant. */
function formatDateLabel(date: LocalDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, facilityId } = await params;
  const venue = await getPublicVenueBySlug(slug);
  if (!venue) return { title: 'Venue not found' };
  const facility = await getActiveFacilityById(facilityId, venue.id);
  return { title: facility ? `Book ${facility.name} — ${venue.name}` : 'Facility not found' };
}

export default async function BookFacilityPage({ params, searchParams }: Props) {
  const { slug, facilityId } = await params;
  const sp = await searchParams;

  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();
  const facility = await getActiveFacilityById(facilityId, venue.id);
  if (!facility) notFound();

  const today = todayInTimeZone(venue.timezone);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const durationOptions: number[] = [];
  for (
    let d = facility.minimumDurationMinutes;
    d <= facility.maximumDurationMinutes;
    d += facility.slotDurationMinutes
  ) {
    durationOptions.push(d);
  }
  const requestedDuration = sp.duration ? Number(sp.duration) : durationOptions[0];
  const duration = durationOptions.includes(requestedDuration)
    ? requestedDuration
    : durationOptions[0];
  const slotsNeeded = duration / facility.slotDurationMinutes;

  const slots = await getAvailableSlots(facility.id, date);
  const validStartIndexes = slots
    .map((_, i) => i)
    .filter((i) => {
      if (i + slotsNeeded > slots.length) return false;
      for (let k = 0; k < slotsNeeded; k++) {
        if (!slots[i + k].available) return false;
      }
      return true;
    });

  const actor = await getSessionActor();
  const dayLinks = Array.from({ length: 7 }, (_, i) => addLocalDays(today, i));
  const pricePerBooking = Math.round((facility.basePriceMinor * duration) / 60);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <Link
        href={`/venues/${slug}`}
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {venue.name}
      </Link>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-wash text-accent-strong">
          <SportIcon code={facility.sportCode} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">
            {facility.name}
          </h1>
          <p className="flex items-center gap-1 text-xs text-muted">
            <MapPin className="h-3 w-3 flex-none" aria-hidden />
            {[venue.district, venue.city].filter(Boolean).join(', ')}
          </p>
        </div>
      </div>

      {sp.error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-danger-wash px-3 py-2.5 text-sm font-medium text-danger"
        >
          {sp.error}
        </p>
      ) : null}

      {durationOptions.length > 1 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
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

      <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
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

      <p className="mt-5 text-xs font-bold tracking-wide text-faint uppercase">
        {duration}-minute slots · {formatPriceMinor(pricePerBooking, facility.currency)} total
      </p>

      {slots.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Closed on this day.
        </p>
      ) : validStartIndexes.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          No {duration}-minute openings on this day. Try another date or duration.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {validStartIndexes.map((i) => {
            const start = slots[i].startAt;
            const end = slots[i + slotsNeeded - 1].endAt;
            return (
              <form key={start.toISOString()} action={requestBookingAction}>
                <input type="hidden" name="venueSlug" value={slug} />
                <input type="hidden" name="facilityId" value={facility.id} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="startAt" value={start.toISOString()} />
                <input type="hidden" name="durationMinutes" value={duration} />
                <button
                  type="submit"
                  title={actor ? 'Request this slot' : 'Sign in to request this slot'}
                  className="focus-visible:outline-accent flex w-full flex-col items-center rounded-xl border border-line bg-surface px-2 py-2.5 text-center transition-colors hover:border-accent hover:bg-accent-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="text-xs font-bold text-foreground">
                    {formatSlotTime(start, venue.timezone)}
                  </span>
                  <span className="text-[10px] text-faint">
                    – {formatSlotTime(end, venue.timezone)}
                  </span>
                </button>
              </form>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-center text-[11px] text-faint">
        {actor
          ? "Requesting holds nothing yet — the venue confirms before it's final."
          : 'Sign in to request a slot — browsing availability never requires an account.'}
      </p>
    </main>
  );
}
