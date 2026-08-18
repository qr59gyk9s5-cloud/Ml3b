'use client';

import { useLocation } from './location-provider';
import { distanceKm, formatDistanceKm } from '@/lib/geo/distance';

/** Renders "2.4 km away" once the visitor's location is known, nothing
 * otherwise — never blocks or reflows the server-rendered card around
 * it. See location-provider.tsx for how the coordinates get here. */
export function VenueDistance({
  latitude,
  longitude,
  className = '',
  prefix = ' · ',
}: {
  latitude: number | null;
  longitude: number | null;
  className?: string;
  /** Separator prepended before the distance text, since this renders
   * inline after other location text — pass '' to suppress it. */
  prefix?: string;
}) {
  const { coords } = useLocation();
  if (!coords || latitude === null || longitude === null) return null;

  const km = distanceKm(coords, { lat: latitude, lng: longitude });
  return (
    <span className={className}>
      {prefix}
      {formatDistanceKm(km)} away
    </span>
  );
}
