/**
 * Server-side reverse-geocoding proxy: turns the browser's raw lat/lng
 * (src/components/location-provider.tsx) into a human-readable "Nasr
 * City, Cairo"-style label for the location pill. Proxied through our
 * own route rather than called directly from client JS for two reasons:
 * it keeps next.config.ts's CSP connect-src scoped to 'self' (no
 * third-party fetch destination to allow-list from the browser), and it
 * keeps the third-party dependency swappable/mockable from one place.
 *
 * Uses BigDataCloud's free client-side reverse-geocode endpoint — no API
 * key, generous free tier, built for exactly this use case. This is a
 * real external dependency for a cosmetic label only: never used for
 * anything booking- or availability-related, and failure always
 * degrades to "no label" rather than an error the page has to handle.
 */
import { NextResponse } from 'next/server';

interface BigDataCloudResponse {
  locality?: string;
  city?: string;
  principalSubdivision?: string;
  countryName?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'Invalid coordinates.' }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!upstream.ok) {
      return NextResponse.json({ locality: null, city: null });
    }
    const data = (await upstream.json()) as BigDataCloudResponse;
    return NextResponse.json({
      locality: data.locality ?? null,
      city: data.city || data.principalSubdivision || null,
    });
  } catch (err) {
    // Best-effort — a slow/unreachable geocoder degrades to "no label",
    // never an error the caller has to handle specially.
    console.error('[geo] reverse geocode failed:', err);
    return NextResponse.json({ locality: null, city: null });
  }
}
