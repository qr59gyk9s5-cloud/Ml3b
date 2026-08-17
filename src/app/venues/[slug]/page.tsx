import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { getPublicVenueBySlug, listActiveFacilities } from '@/domain/venue/queries';
import { getAvailableSlots } from '@/domain/availability/queries';
import { todayInTimeZone } from '@/domain/availability/time';
import { countryDisplayName } from '@/lib/config/constants';
import { formatPriceMinor } from '@/lib/format/money';
import { SportIcon } from '@/components/sport-icon';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getPublicVenueBySlug(slug);
  if (!venue) return { title: 'Venue not found' };
  return {
    title: venue.name,
    description:
      venue.description ?? `${venue.name} — ${venue.city}, ${countryDisplayName(venue.country)}`,
  };
}

export default async function VenuePage({ params }: Props) {
  const { slug } = await params;
  const venue = await getPublicVenueBySlug(slug);
  if (!venue) notFound();
  const venueFacilities = await listActiveFacilities(venue.id);
  const today = todayInTimeZone(venue.timezone);
  const facilitiesWithAvailability = await Promise.all(
    venueFacilities.map(async (facility) => ({
      facility,
      todaySlots: await getAvailableSlots(facility.id, today),
    })),
  );

  return (
    <main>
      <div
        aria-hidden
        className="venue-thumb flex h-44 w-full items-center justify-center text-4xl sm:h-64"
      >
        🏟️
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> All venues
        </Link>

        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {venue.name}
        </h1>
        <p className="mt-1.5 flex items-center gap-1 text-sm text-muted">
          <MapPin className="h-3.5 w-3.5 flex-none" aria-hidden />
          {[venue.district, venue.city, countryDisplayName(venue.country)]
            .filter(Boolean)
            .join(', ')}
        </p>

        {venue.description ? (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground">
            {venue.description}
          </p>
        ) : null}

        <p className="mt-8 text-xs font-bold tracking-wide text-faint uppercase">Facilities</p>
        {venueFacilities.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-line bg-surface-2 p-4">
            <p className="text-sm text-muted">
              Bookable courts and pitches for this venue aren&apos;t listed yet.
            </p>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-2.5">
            {facilitiesWithAvailability.map(({ facility, todaySlots }) => {
              const openCount = todaySlots.filter((s) => s.available).length;
              const availabilityLabel =
                todaySlots.length === 0
                  ? 'Closed today'
                  : openCount === 0
                    ? 'Fully booked today'
                    : `${openCount} of ${todaySlots.length} slots open today`;
              return (
                <li key={facility.id}>
                  <Link
                    href={`/venues/${slug}/book/${facility.id}`}
                    className="focus-visible:outline-accent group flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-wash text-accent-strong">
                      <SportIcon code={facility.sportCode} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-bold text-foreground group-hover:text-accent-strong">
                          {facility.name}
                        </p>
                        <p className="flex-none font-mono text-sm font-bold tabular-nums text-accent-strong">
                          {formatPriceMinor(facility.basePriceMinor, facility.currency)}/hr
                        </p>
                      </div>
                      <p className="text-xs text-muted">
                        {facility.slotDurationMinutes}-minute slots
                      </p>
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          openCount > 0 ? 'text-accent-strong' : 'text-faint'
                        }`}
                      >
                        {availabilityLabel}
                      </p>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 flex-none text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
