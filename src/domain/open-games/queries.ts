/**
 * Read-only open-game queries. Unlike booking queries, open games are
 * intentionally public (see 0015_open_games_rls.sql) — anyone can
 * browse to find a game to join, no actor required. Roster/organizer
 * detail is public too, for the same reason.
 */
import { and, desc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import {
  bookings,
  facilities,
  openGamePlayers,
  openGames,
  profiles,
  sports,
  venues,
  type OpenGame,
  type OpenGamePlayer,
} from '@/lib/db/schema';

const BROWSABLE_STATUSES = ['AWAITING_VENUE', 'FILLING', 'MINIMUM_REACHED'] as const;

export interface OpenGameSummary extends OpenGame {
  venueName: string;
  venueSlug: string;
  facilityName: string;
  sportCode: string;
  sportDisplayName: string;
  startAt: Date;
  endAt: Date;
  joinedCount: number;
}

/** Every not-yet-resolved open game, newest first — the browse page.
 * Includes AWAITING_VENUE ones (not joinable yet, but visible — an
 * organizer's own page needs to show it, and there's no harm in
 * strangers seeing "pending venue approval" too). */
export async function listOpenGames(): Promise<OpenGameSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      ...getTableColumns(openGames),
      venueName: venues.name,
      venueSlug: venues.slug,
      facilityName: facilities.name,
      sportCode: sports.code,
      sportDisplayName: sports.displayName,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
    })
    .from(openGames)
    .innerJoin(bookings, eq(openGames.bookingId, bookings.id))
    .innerJoin(facilities, eq(bookings.facilityId, facilities.id))
    .innerJoin(venues, eq(bookings.venueId, venues.id))
    .innerJoin(sports, eq(facilities.sportId, sports.id))
    .where(inArray(openGames.status, BROWSABLE_STATUSES))
    .orderBy(desc(openGames.createdAt));

  if (rows.length === 0) return [];
  const counts = await countJoinedByOpenGameId(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, joinedCount: counts.get(r.id) ?? 0 }));
}

async function countJoinedByOpenGameId(openGameIds: string[]): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ openGameId: openGamePlayers.openGameId, status: openGamePlayers.status })
    .from(openGamePlayers)
    .where(and(inArray(openGamePlayers.openGameId, openGameIds), eq(openGamePlayers.status, 'JOINED')));
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.openGameId, (counts.get(row.openGameId) ?? 0) + 1);
  }
  return counts;
}

export interface OpenGamePlayerWithName extends OpenGamePlayer {
  fullName: string;
}

export interface OpenGameDetail extends OpenGameSummary {
  organizerName: string;
  players: OpenGamePlayerWithName[];
}

export async function getOpenGameById(openGameId: string): Promise<OpenGameDetail | null> {
  const db = getDb();
  const organizerProfile = profiles;
  const [row] = await db
    .select({
      ...getTableColumns(openGames),
      venueName: venues.name,
      venueSlug: venues.slug,
      facilityName: facilities.name,
      sportCode: sports.code,
      sportDisplayName: sports.displayName,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      organizerName: organizerProfile.fullName,
    })
    .from(openGames)
    .innerJoin(bookings, eq(openGames.bookingId, bookings.id))
    .innerJoin(facilities, eq(bookings.facilityId, facilities.id))
    .innerJoin(venues, eq(bookings.venueId, venues.id))
    .innerJoin(sports, eq(facilities.sportId, sports.id))
    .innerJoin(organizerProfile, eq(openGames.organizerId, organizerProfile.id))
    .where(eq(openGames.id, openGameId));
  if (!row) return null;

  const players = await db
    .select({ ...getTableColumns(openGamePlayers), fullName: profiles.fullName })
    .from(openGamePlayers)
    .innerJoin(profiles, eq(openGamePlayers.userId, profiles.id))
    .where(and(eq(openGamePlayers.openGameId, openGameId), eq(openGamePlayers.status, 'JOINED')))
    .orderBy(openGamePlayers.joinedAt);

  return { ...row, players, joinedCount: players.length };
}

/** Games a user organized or joined, newest first — a "my games" list. */
export async function listOpenGamesForUser(userId: string): Promise<OpenGameSummary[]> {
  const db = getDb();
  const joinedGameIds = await db
    .select({ id: openGamePlayers.openGameId })
    .from(openGamePlayers)
    .where(and(eq(openGamePlayers.userId, userId), eq(openGamePlayers.status, 'JOINED')));

  const organized = await db
    .select({ id: openGames.id })
    .from(openGames)
    .where(eq(openGames.organizerId, userId));

  const relevantIds = [...new Set([...joinedGameIds.map((j) => j.id), ...organized.map((o) => o.id)])];
  if (relevantIds.length === 0) return [];

  const rows = await db
    .select({
      ...getTableColumns(openGames),
      venueName: venues.name,
      venueSlug: venues.slug,
      facilityName: facilities.name,
      sportCode: sports.code,
      sportDisplayName: sports.displayName,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
    })
    .from(openGames)
    .innerJoin(bookings, eq(openGames.bookingId, bookings.id))
    .innerJoin(facilities, eq(bookings.facilityId, facilities.id))
    .innerJoin(venues, eq(bookings.venueId, venues.id))
    .innerJoin(sports, eq(facilities.sportId, sports.id))
    .where(inArray(openGames.id, relevantIds))
    .orderBy(desc(openGames.createdAt));

  const counts = await countJoinedByOpenGameId(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, joinedCount: counts.get(r.id) ?? 0 }));
}
