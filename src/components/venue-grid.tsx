'use client';

/**
 * Client-side distance sort for the browse pages: the venue list itself
 * is server-fetched real data (src/domain/venue/queries.ts) passed down
 * as plain props — this component only reorders it once the visitor's
 * location is known (src/components/location-provider.tsx) and renders
 * the cards. Falls back to the server's own order (alphabetical) when no
 * location is available, never blocks or refetches.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { useLocation } from './location-provider';
import { distanceKm, formatDistanceKm } from '@/lib/geo/distance';
import { SportIcon, sportTone } from './sport-icon';
import { formatPriceMinor } from '@/lib/format/money';
import type { VenueSummary } from '@/domain/venue/queries';

// Cover-art tone for venues with no real photo yet — cycled per venue
// (stable by id, not by list position, so a venue keeps its color as
// distance-sort reorders the grid) purely for visual variety across the
// grid. Never meaningful: a venue isn't "the sky one".
const THUMB_TONES = ['', 'tone-flood', 'tone-sky', 'tone-lime', 'tone-ink'];
function thumbTone(venueId: string): string {
  let hash = 0;
  for (let i = 0; i < venueId.length; i++) hash = (hash * 31 + venueId.charCodeAt(i)) | 0;
  return THUMB_TONES[Math.abs(hash) % THUMB_TONES.length];
}

export function VenueGrid({ venues }: { venues: VenueSummary[] }) {
  const { coords } = useLocation();

  const sorted = useMemo(() => {
    if (!coords) return venues;
    return [...venues].sort((a, b) => {
      const da =
        a.venue.latitude !== null && a.venue.longitude !== null
          ? distanceKm(coords, { lat: a.venue.latitude, lng: a.venue.longitude })
          : Infinity;
      const db =
        b.venue.latitude !== null && b.venue.longitude !== null
          ? distanceKm(coords, { lat: b.venue.latitude, lng: b.venue.longitude })
          : Infinity;
      return da - db;
    });
  }, [venues, coords]);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <span aria-hidden className="text-2xl">
          🏟️
        </span>
        <p className="font-display text-sm font-bold text-foreground">No venues match yet</p>
        <p className="max-w-sm text-xs text-muted">Try a different sport or area.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {sorted.map(({ venue, sportCodes, facilityCount, minPriceMinor, currency }, i) => {
        const km =
          coords && venue.latitude !== null && venue.longitude !== null
            ? distanceKm(coords, { lat: venue.latitude, lng: venue.longitude })
            : null;
        return (
          <li
            key={venue.id}
            className="animate-rise-up"
            style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
          >
            <Link
              href={`/venues/${venue.slug}`}
              className="focus-visible:outline-accent group flex gap-3.5 rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <div
                className={`${venue.coverPhotoUrl ? '' : `pitch-thumb ${thumbTone(venue.id)}`} relative flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-xl text-2xl`}
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
                  '🏟️'
                )}
                {minPriceMinor !== null && currency && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-lime px-1.5 py-0.5 text-[9px] font-extrabold whitespace-nowrap text-lime-ink shadow-sm">
                    {formatPriceMinor(minPriceMinor, currency)}/hr
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <span className="truncate font-display text-sm font-bold text-foreground group-hover:text-accent-strong">
                  {venue.name}
                </span>
                <span className="flex items-center gap-1 truncate text-xs text-muted">
                  <MapPin className="h-3 w-3 flex-none" aria-hidden />
                  {[venue.district, venue.city].filter(Boolean).join(', ')}
                  {km !== null ? (
                    <span className="font-semibold text-accent-strong">
                      {' '}
                      · {formatDistanceKm(km)}
                    </span>
                  ) : null}
                </span>
                <div className="mt-2 flex items-center gap-2">
                  {sportCodes.length > 0 && (
                    <div className="flex items-center gap-1">
                      {sportCodes.slice(0, 4).map((code) => {
                        const tone = sportTone(code);
                        return (
                          <span
                            key={code}
                            className={`flex h-5 w-5 items-center justify-center rounded-full ${tone.bg} ${tone.text}`}
                            title={code}
                          >
                            <SportIcon code={code} className="h-3 w-3" />
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {facilityCount > 0 && (
                    <span className="text-[11px] text-faint">
                      {facilityCount} facilit{facilityCount === 1 ? 'y' : 'ies'}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
