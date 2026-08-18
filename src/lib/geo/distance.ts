/**
 * Straight-line distance between two coordinates (haversine formula) —
 * used only for the "X km away" display and client-side sort-by-distance
 * on the browse pages. Never a source of truth for anything booking- or
 * money-related; purely presentational, computed from a venue's stored
 * lat/lng (src/lib/db/schema/venues.ts) and the visitor's browser-reported
 * location (src/components/location-provider.tsx).
 */
export interface Coordinates {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
