import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicVenueBySlug, listActiveFacilities } from '@/domain/venue/queries';
import { getAvailableSlots } from '@/domain/availability/queries';
import { todayInTimeZone } from '@/domain/availability/time';
import { countryDisplayName } from '@/lib/config/constants';
import { formatPriceMinor } from '@/lib/format/money';

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
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-accent">
        ‹ All venues
      </Link>

      <div aria-hidden className="venue-thumb mb-4 h-40 w-full rounded-2xl sm:h-56" />

      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{venue.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {[venue.district, venue.city, countryDisplayName(venue.country)].filter(Boolean).join(', ')}
      </p>
      <p className="mt-0.5 text-xs text-faint">No reviews yet</p>

      {venue.description && (
        <p className="mt-4 text-sm leading-relaxed text-foreground">{venue.description}</p>
      )}

      <p className="mt-6 text-xs font-bold tracking-wide text-faint uppercase">Facilities</p>
      {venueFacilities.length === 0 ? (
        <div className="mt-2 rounded-2xl border border-line bg-surface-2 p-4">
          <p className="text-sm text-muted">
            Bookable courts and pitches for this venue aren&apos;t listed yet.
          </p>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {facilitiesWithAvailability.map(({ facility, todaySlots }) => {
            const openCount = todaySlots.filter((s) => s.available).length;
            const availabilityLabel =
              todaySlots.length === 0
                ? 'Closed today'
                : openCount === 0
                  ? 'Fully booked today'
                  : `${openCount} of ${todaySlots.length} slots open today`;
            return (
              <li key={facility.id} className="rounded-2xl border border-line bg-surface p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{facility.name}</p>
                    <p className="text-xs text-muted">
                      {facility.slotDurationMinutes}-minute slots
                    </p>
                  </div>
                  <p className="flex-none font-mono text-sm font-bold tabular-nums text-accent-strong">
                    {formatPriceMinor(facility.basePriceMinor, facility.currency)}/hr
                  </p>
                </div>
                <p
                  className={`mt-2 text-xs font-semibold ${openCount > 0 ? 'text-accent-strong' : 'text-faint'}`}
                >
                  {availabilityLabel}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 rounded-2xl border border-dashed border-line p-4">
        <p className="text-xs text-muted">
          Availability shown above is real — computed from each facility&apos;s actual schedule.
          Picking a slot and requesting a booking isn&apos;t live yet — that&apos;s next (the
          booking engine).
        </p>
      </div>
    </main>
  );
}
