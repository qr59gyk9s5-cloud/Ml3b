/**
 * Read-only venue queries for public-facing pages.
 *
 * IMPORTANT: `getDb()` connects with the app's own Postgres credentials,
 * not a per-request Supabase session — it does not go through Postgres
 * Row Level Security. RLS (supabase/migrations/0001_identity_auth_and_rls.sql)
 * protects direct/client-side access; server code like this must apply
 * its own explicit authorization filter, which is why every query here
 * filters status itself rather than assuming the database will. See
 * docs/architecture/authorization.md.
 *
 * Venue/facility *mutations* and the lifecycle transition rules live in
 * lifecycle.ts and facilities.ts, not here — this file is reads only.
 */
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { facilities, sports, venues, type Facility, type Venue } from '@/lib/db/schema';

/** Venues visible to an anonymous visitor: only ever ACTIVE ones. */
export async function listActiveVenues(): Promise<Venue[]> {
  const db = getDb();
  return db.select().from(venues).where(eq(venues.status, 'ACTIVE')).orderBy(venues.name);
}

export interface VenueSummary {
  venue: Venue;
  /** Distinct sport codes across the venue's active facilities — for a
   * card's sport icons, not exhaustive detail. */
  sportCodes: string[];
  facilityCount: number;
  /** Cheapest active facility's hourly rate, for a "from X EGP/hr" tag.
   * null if the venue has no active facilities yet. */
  minPriceMinor: number | null;
  currency: string | null;
}

export interface SportCategory {
  code: string;
  displayName: string;
  venueCount: number;
}

/** Sports actually offered by at least one active facility at an ACTIVE
 * venue, with a real venue count each — the home page's "browse by
 * sport" cards. Never a fixed/fabricated list: a sport with zero live
 * venues just doesn't appear. */
export async function listSportCategories(): Promise<SportCategory[]> {
  const db = getDb();
  const rows = await db
    .select({
      sportCode: sports.code,
      sportDisplayName: sports.displayName,
      venueId: venues.id,
    })
    .from(facilities)
    .innerJoin(sports, eq(facilities.sportId, sports.id))
    .innerJoin(venues, eq(facilities.venueId, venues.id))
    .where(and(eq(facilities.isActive, true), eq(venues.status, 'ACTIVE')));

  const byCode = new Map<string, { displayName: string; venueIds: Set<string> }>();
  for (const row of rows) {
    const entry = byCode.get(row.sportCode) ?? {
      displayName: row.sportDisplayName,
      venueIds: new Set<string>(),
    };
    entry.venueIds.add(row.venueId);
    byCode.set(row.sportCode, entry);
  }

  return Array.from(byCode.entries())
    .map(([code, { displayName, venueIds }]) => ({ code, displayName, venueCount: venueIds.size }))
    .sort((a, b) => b.venueCount - a.venueCount);
}

export interface AreaCategory {
  /** A venue's district, falling back to its city when no district is
   * set — never a separate "Cairo the country" concept, just the most
   * specific real location string each venue actually has. */
  name: string;
  venueCount: number;
}

/** Real districts/cities at least one ACTIVE venue is in, with counts —
 * the home page's "browse by area" cards. */
export async function listAreaCategories(): Promise<AreaCategory[]> {
  const activeVenues = await listActiveVenues();
  const counts = new Map<string, number>();
  for (const venue of activeVenues) {
    const area = venue.district ?? venue.city;
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, venueCount]) => ({ name, venueCount }))
    .sort((a, b) => b.venueCount - a.venueCount);
}

/** Venue list plus just enough facility summary for a browse-page card.
 * One query per venue is fine at MVP scale (same N+1-is-fine-for-now
 * reasoning as the venue detail page's per-facility availability calls);
 * revisit with a single aggregated query if the venue count grows. */
export async function listActiveVenuesWithSummary(): Promise<VenueSummary[]> {
  const venueList = await listActiveVenues();
  const db = getDb();
  return Promise.all(
    venueList.map(async (venue) => {
      const rows = await db
        .select({
          basePriceMinor: facilities.basePriceMinor,
          currency: facilities.currency,
          sportCode: sports.code,
        })
        .from(facilities)
        .innerJoin(sports, eq(facilities.sportId, sports.id))
        .where(and(eq(facilities.venueId, venue.id), eq(facilities.isActive, true)));

      return {
        venue,
        sportCodes: Array.from(new Set(rows.map((r) => r.sportCode))),
        facilityCount: rows.length,
        minPriceMinor: rows.length > 0 ? Math.min(...rows.map((r) => r.basePriceMinor)) : null,
        currency: rows[0]?.currency ?? null,
      };
    }),
  );
}

/** A single venue's public page — null if it doesn't exist or isn't
 * public yet (DRAFT/PENDING_REVIEW/SUSPENDED/ARCHIVED), never leaking
 * which case it was. */
export async function getPublicVenueBySlug(slug: string): Promise<Venue | null> {
  const db = getDb();
  const [venue] = await db
    .select()
    .from(venues)
    .where(and(eq(venues.slug, slug), eq(venues.status, 'ACTIVE')));
  return venue ?? null;
}

export interface FacilityWithSport extends Facility {
  sportCode: string;
  sportDisplayName: string;
}

/** A single active facility, scoped to its venue — for the booking page,
 * which needs one facility rather than the whole list. */
export async function getActiveFacilityById(
  facilityId: string,
  venueId: string,
): Promise<FacilityWithSport | null> {
  const db = getDb();
  const [row] = await db
    .select({
      ...getTableColumns(facilities),
      sportCode: sports.code,
      sportDisplayName: sports.displayName,
    })
    .from(facilities)
    .innerJoin(sports, eq(facilities.sportId, sports.id))
    .where(
      and(
        eq(facilities.id, facilityId),
        eq(facilities.venueId, venueId),
        eq(facilities.isActive, true),
      ),
    );
  return row ?? null;
}

/** Active facilities at a venue, for the public facility list. Does not
 * check the venue's own status — callers already have a venue in hand
 * (typically from getPublicVenueBySlug, which already filtered to
 * ACTIVE) and shouldn't need a second round trip to re-check it. */
export async function listActiveFacilities(venueId: string): Promise<FacilityWithSport[]> {
  const db = getDb();
  return db
    .select({
      ...getTableColumns(facilities),
      sportCode: sports.code,
      sportDisplayName: sports.displayName,
    })
    .from(facilities)
    .innerJoin(sports, eq(facilities.sportId, sports.id))
    .where(and(eq(facilities.venueId, venueId), eq(facilities.isActive, true)))
    .orderBy(asc(facilities.name));
}
