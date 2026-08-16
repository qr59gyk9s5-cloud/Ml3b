import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicVenueBySlug } from '@/domain/venue/queries';
import { countryDisplayName } from '@/lib/config/constants';

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

      <div className="mt-6 rounded-2xl border border-line bg-surface-2 p-4">
        <p className="text-xs font-bold tracking-wide text-faint uppercase">Facilities</p>
        <p className="mt-1 text-sm text-muted">
          Bookable courts and pitches for this venue aren&apos;t listed yet — that&apos;s next.
        </p>
      </div>
    </main>
  );
}
