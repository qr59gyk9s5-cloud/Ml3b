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
import { VenueDistance } from '@/components/venue-distance';

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
        className={`${venue.coverPhotoUrl ? '' : 'pitch-thumb'} relative flex h-44 w-full items-center justify-center overflow-hidden text-4xl sm:h-64`}
      >
        {venue.coverPhotoUrl ? (
          // Venue-owner-supplied arbitrary URL, see
          // src/domain/venue/settings.ts's doc comment.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venue.coverPhotoUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <span className="animate-float pointer-events-none absolute -top-10 right-6 h-32 w-32 rounded-full bg-white/15 blur-xl" />
            🏟️
          </>
        )}
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 font-display text-xs font-bold text-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> All venues
        </Link>

        <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {venue.name}
        </h1>
        <p className="mt-1.5 flex items-center gap-1 text-sm text-muted">
          <MapPin className="h-3.5 w-3.5 flex-none" aria-hidden />
          {[venue.district, venue.city, countryDisplayName(venue.country)]
            .filter(Boolean)
            .join(', ')}
          <VenueDistance
            latitude={venue.latitude}
            longitude={venue.longitude}
            className="font-semibold text-accent-strong"
          />
        </p>

        {venue.description ? (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground">
            {venue.description}
          </p>
        ) : null}

        <p className="mt-8 font-display text-xs font-bold tracking-wide text-faint uppercase">
          Facilities
        </p>
        {venueFacilities.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-line bg-surface-2 p-4">
            <p className="text-sm text-muted">
              Bookable courts and pitches for this venue aren&apos;t listed yet.
            </p>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-2.5">
            {facilitiesWithAvailability.map(({ facility, todaySlots }, i) => {
              const openCount = todaySlots.filter((s) => s.available).length;
              const availabilityLabel =
                todaySlots.length === 0
                  ? 'Closed today'
                  : openCount === 0
                    ? 'Fully booked today'
                    : `${openCount} of ${todaySlots.length} slots open today`;
              return (
                <li
                  key={facility.id}
                  className="animate-rise-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <Link
                    href={`/venues/${slug}/book/${facility.id}`}
                    className="focus-visible:outline-accent group flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-wash text-accent-strong transition-colors group-hover:bg-accent group-hover:text-white">
                      <SportIcon code={facility.sportCode} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-display text-sm font-bold text-foreground group-hover:text-accent-strong">
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
                        className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${
                          openCount > 0 ? 'text-accent-strong' : 'text-faint'
                        }`}
                      >
                        {openCount > 0 ? (
                          <span
                            className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-accent"
                            aria-hidden
                          />
                        ) : null}
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
