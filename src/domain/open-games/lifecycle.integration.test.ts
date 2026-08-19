import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDatabase, getTestDb, resetTestDatabase } from '@/testing/db';
import {
  createTestAvailabilityRule,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { bookings, openGamePlayers, openGames } from '@/lib/db/schema';
import { transitionBooking } from '@/domain/booking/transition';
import { createOpenGame } from './create-open-game';
import { joinOpenGame, leaveOpenGame } from './join';
import { organizerCancelOpenGame } from './organizer-actions';
import { resolveOpenGamesPastCutoff } from './cutoff';
import { getOpenGameById } from './queries';

async function setUpBookableFacility(overrides: { basePriceMinor?: number } = {}) {
  const owner = await createTestUser('Owner');
  const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
  const sport = await createTestSport(`sport-${venue.id}`);
  const facility = await createTestFacility(venue.id, sport.id, {
    slotDurationMinutes: 60,
    basePriceMinor: overrides.basePriceMinor ?? 20000,
  });
  // Every day, 00:00-23:00 — avoids day-of-week fragility (see this
  // file's doc comment) while still respecting the compute-slots model.
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    await createTestAvailabilityRule(facility.id, {
      dayOfWeek,
      startTime: '00:00',
      endTime: '23:00',
    });
  }
  return { owner, venue, facility };
}

/** At least 6 hours out (clears OPEN_GAME_MIN_LEAD_TIME_HOURS=4),
 * rounded to the next hour boundary to land on a real slot. */
function farEnoughStartAt(): Date {
  const start = new Date(Date.now() + 6 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  return start;
}

async function createGame(
  organizerId: string,
  facilityId: string,
  overrides: Partial<{
    targetPlayers: number;
    minPlayers: number;
    pricePerPlayerMinor: number;
    autoConfirmIfMinMet: boolean;
    joinCutoffAt: Date;
  }> = {},
) {
  const startAt = farEnoughStartAt();
  return createOpenGame(
    { userId: organizerId },
    {
      facilityId,
      startAt,
      durationMinutes: 60,
      targetPlayers: overrides.targetPlayers ?? 4,
      minPlayers: overrides.minPlayers ?? 2,
      pricePerPlayerMinor: overrides.pricePerPlayerMinor ?? 5000,
      joinCutoffAt: overrides.joinCutoffAt ?? new Date(startAt.getTime() - 60 * 60 * 1000),
      autoConfirmIfMinMet: overrides.autoConfirmIfMinMet ?? false,
    },
  );
}

async function confirmUnderlyingBooking(openGameId: string, ownerId: string) {
  const db = getTestDb();
  const [openGame] = await db.select().from(openGames).where(eq(openGames.id, openGameId));
  await transitionBooking({
    bookingId: openGame.bookingId,
    targetStatus: 'CONFIRMED',
    actor: { userId: ownerId, isPlatformAdmin: false },
  });
}

/**
 * Inserts a JOINED player row directly, bypassing joinOpenGame()'s own
 * immediate-finalize-on-threshold logic. Real sequential joins always
 * resolve a game (finalize or MINIMUM_REACHED) the instant a threshold
 * is crossed, so "full/at-minimum but still sitting in FILLING" is only
 * reachable in practice via a genuine concurrent-join race. This
 * simulates that race outcome directly at the DB layer so the
 * capacity-guard and cutoff-safety-net branches — which exist
 * specifically to defend against that race — can be exercised in
 * isolation.
 */
async function insertPlayerDirectly(openGameId: string, userId: string) {
  const db = getTestDb();
  const [player] = await db
    .insert(openGamePlayers)
    .values({ openGameId, userId, status: 'JOINED' })
    .returning();
  return player;
}

describe('open games lifecycle (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('createOpenGame', () => {
    it('creates an AWAITING_VENUE game and joins the organizer as player #1', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');

      const openGame = await createGame(organizer.id, facility.id);
      expect(openGame.status).toBe('AWAITING_VENUE');

      const db = getTestDb();
      const players = await db
        .select()
        .from(openGamePlayers)
        .where(eq(openGamePlayers.openGameId, openGame.id));
      expect(players).toHaveLength(1);
      expect(players[0].userId).toBe(organizer.id);
      expect(players[0].status).toBe('JOINED');
      void owner;
    });

    it('refuses a start time inside the minimum lead time', async () => {
      const { facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const startAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour out
      startAt.setMinutes(0, 0, 0);

      await expect(
        createOpenGame(
          { userId: organizer.id },
          {
            facilityId: facility.id,
            startAt,
            durationMinutes: 60,
            targetPlayers: 4,
            minPlayers: 2,
            pricePerPlayerMinor: 5000,
            joinCutoffAt: new Date(startAt.getTime() - 30 * 60 * 1000),
            autoConfirmIfMinMet: false,
          },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('refuses minPlayers greater than targetPlayers', async () => {
      const { facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');

      await expect(
        createGame(organizer.id, facility.id, { targetPlayers: 4, minPlayers: 6 }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('booking cascade', () => {
    it('AWAITING_VENUE -> FILLING when the venue confirms', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id);

      await confirmUnderlyingBooking(openGame.id, owner.id);

      const db = getTestDb();
      const [updated] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      expect(updated.status).toBe('FILLING');
    });

    it('AWAITING_VENUE -> VENUE_REJECTED when the venue rejects, releasing the organizer’s hold', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id);

      const db = getTestDb();
      const [before] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      await transitionBooking({
        bookingId: before.bookingId,
        targetStatus: 'REJECTED',
        actor: { userId: owner.id, isPlatformAdmin: false },
        reason: 'VENUE_CLOSED',
      });

      const [updated] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      expect(updated.status).toBe('VENUE_REJECTED');
    });

    it('FILLING -> VENUE_CANCELLED when venue staff cancels the hold directly', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id);
      await confirmUnderlyingBooking(openGame.id, owner.id);

      const db = getTestDb();
      const [filling] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      await transitionBooking({
        bookingId: filling.bookingId,
        targetStatus: 'CANCELLED_BY_VENUE',
        actor: { userId: owner.id, isPlatformAdmin: false },
        reason: 'MAINTENANCE',
      });

      const [updated] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      expect(updated.status).toBe('VENUE_CANCELLED');
    });
  });

  describe('joinOpenGame', () => {
    it('refuses joining while AWAITING_VENUE', async () => {
      const { facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id);
      const player = await createTestUser('Player');

      await expect(joinOpenGame({ userId: player.id }, openGame.id, {})).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
      });
    });

    it('reaching the target finalizes immediately (captures every joined player)', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id, {
        targetPlayers: 2,
        minPlayers: 2,
      });
      await confirmUnderlyingBooking(openGame.id, owner.id);

      const player2 = await createTestUser('Player 2');
      await joinOpenGame({ userId: player2.id }, openGame.id, { position: 'Striker' });

      const db = getTestDb();
      const [updated] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      expect(updated.status).toBe('CONFIRMED');
    });

    it('reaching minimum without auto-confirm just flips to MINIMUM_REACHED', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id, {
        targetPlayers: 4,
        minPlayers: 2,
        autoConfirmIfMinMet: false,
      });
      await confirmUnderlyingBooking(openGame.id, owner.id);

      const player2 = await createTestUser('Player 2');
      await joinOpenGame({ userId: player2.id }, openGame.id, {});

      const db = getTestDb();
      const [updated] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      expect(updated.status).toBe('MINIMUM_REACHED');
    });

    it('reaching minimum with auto-confirm finalizes immediately', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id, {
        targetPlayers: 4,
        minPlayers: 2,
        autoConfirmIfMinMet: true,
      });
      await confirmUnderlyingBooking(openGame.id, owner.id);

      const player2 = await createTestUser('Player 2');
      await joinOpenGame({ userId: player2.id }, openGame.id, {});

      const db = getTestDb();
      const [updated] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      expect(updated.status).toBe('CONFIRMED');
    });

    it('refuses joining a full game', async () => {
      // Under normal sequential play, crossing targetPlayers always
      // finalizes synchronously inside joinOpenGame() itself, so a
      // "full but still joinable" state never actually exists for a
      // later join to bump into — except as the outcome of two joins
      // racing each other. Simulate that race outcome directly (bypass
      // joinOpenGame's finalize trigger) so the capacity guard itself —
      // the thing that protects against that exact race — gets tested.
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id, {
        targetPlayers: 2,
        minPlayers: 2,
      });
      await confirmUnderlyingBooking(openGame.id, owner.id);
      const player2 = await createTestUser('Player 2');
      await insertPlayerDirectly(openGame.id, player2.id);

      const player3 = await createTestUser('Player 3');
      await expect(joinOpenGame({ userId: player3.id }, openGame.id, {})).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('refuses joining twice', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id, {
        targetPlayers: 5,
        minPlayers: 2,
      });
      await confirmUnderlyingBooking(openGame.id, owner.id);
      const player2 = await createTestUser('Player 2');
      await joinOpenGame({ userId: player2.id }, openGame.id, {});

      await expect(joinOpenGame({ userId: player2.id }, openGame.id, {})).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });

  describe('leaveOpenGame', () => {
    it('lets a player leave while FILLING, releasing their hold', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id, {
        targetPlayers: 5,
        minPlayers: 2,
      });
      await confirmUnderlyingBooking(openGame.id, owner.id);
      const player2 = await createTestUser('Player 2');
      const joined = await joinOpenGame({ userId: player2.id }, openGame.id, {});

      const left = await leaveOpenGame({
        openGamePlayerId: joined.id,
        actor: { userId: player2.id },
      });
      expect(left.player.status).toBe('LEFT');
      expect(left.outcome).toBe('released');
    });

    it('refuses leaving on someone else’s behalf', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id, {
        targetPlayers: 5,
        minPlayers: 2,
      });
      await confirmUnderlyingBooking(openGame.id, owner.id);
      const player2 = await createTestUser('Player 2');
      const joined = await joinOpenGame({ userId: player2.id }, openGame.id, {});
      const stranger = await createTestUser('Stranger');

      await expect(
        leaveOpenGame({ openGamePlayerId: joined.id, actor: { userId: stranger.id } }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('organizerCancelOpenGame', () => {
    it('cancels a FILLING game, releasing every held payment', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id, {
        targetPlayers: 5,
        minPlayers: 2,
      });
      await confirmUnderlyingBooking(openGame.id, owner.id);

      const updated = await organizerCancelOpenGame({ userId: organizer.id }, openGame.id, {
        reason: 'OTHER',
      });
      expect(updated.status).toBe('ORGANIZER_CANCELLED');

      const db = getTestDb();
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, updated.bookingId));
      expect(booking.status).toBe('CANCELLED_BY_VENUE');
    });

    it('refuses a non-organizer', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id);
      const stranger = await createTestUser('Stranger');

      await expect(
        organizerCancelOpenGame({ userId: stranger.id }, openGame.id, { reason: 'OTHER' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      void owner;
    });
  });

  describe('resolveOpenGamesPastCutoff', () => {
    it('cancels FAILED_TO_FILL when below minimum at cutoff, releasing the organizer’s hold', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const startAt = farEnoughStartAt();
      const openGame = await createOpenGame(
        { userId: organizer.id },
        {
          facilityId: facility.id,
          startAt,
          durationMinutes: 60,
          targetPlayers: 4,
          minPlayers: 2,
          pricePerPlayerMinor: 5000,
          joinCutoffAt: new Date(Date.now() + 1000), // 1 second out
          autoConfirmIfMinMet: false,
        },
      );
      await confirmUnderlyingBooking(openGame.id, owner.id);

      const result = await resolveOpenGamesPastCutoff(new Date(Date.now() + 2000));
      expect(result.failedCount).toBeGreaterThanOrEqual(1);

      const db = getTestDb();
      const [updated] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      expect(updated.status).toBe('FAILED_TO_FILL');
      expect(updated.cancelledReason).toBe('INSUFFICIENT_PLAYERS');

      const [booking] = await db.select().from(bookings).where(eq(bookings.id, updated.bookingId));
      expect(booking.status).toBe('CANCELLED_BY_VENUE');
    });

    it('finalizes as a safety net when at/above minimum with auto-confirm', async () => {
      // Reaching minPlayers with autoConfirmIfMinMet set normally
      // finalizes synchronously inside joinOpenGame() itself, so the
      // cutoff job's own defensive finalize branch never actually runs
      // in the ordinary sequential flow. Simulate the race outcome
      // (bypass joinOpenGame) so a game can sit in FILLING at/above its
      // minimum, unresolved, specifically to exercise that safety net.
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const startAt = farEnoughStartAt();
      const openGame = await createOpenGame(
        { userId: organizer.id },
        {
          facilityId: facility.id,
          startAt,
          durationMinutes: 60,
          targetPlayers: 4,
          minPlayers: 2,
          pricePerPlayerMinor: 5000,
          joinCutoffAt: new Date(Date.now() + 1000),
          autoConfirmIfMinMet: true,
        },
      );
      await confirmUnderlyingBooking(openGame.id, owner.id);
      const player2 = await createTestUser('Player 2');
      await insertPlayerDirectly(openGame.id, player2.id);

      const result = await resolveOpenGamesPastCutoff(new Date(Date.now() + 2000));
      expect(result.finalizedCount).toBeGreaterThanOrEqual(1);

      const db = getTestDb();
      const [updated] = await db.select().from(openGames).where(eq(openGames.id, openGame.id));
      expect(updated.status).toBe('CONFIRMED');
    });
  });

  describe('getOpenGameById', () => {
    it('returns the game with venue/facility/booking details and the roster', async () => {
      const { owner, facility } = await setUpBookableFacility();
      const organizer = await createTestUser('Organizer');
      const openGame = await createGame(organizer.id, facility.id);
      await confirmUnderlyingBooking(openGame.id, owner.id);

      const detail = await getOpenGameById(openGame.id);
      expect(detail).not.toBeNull();
      expect(detail?.organizerName).toBe('Organizer');
      expect(detail?.players).toHaveLength(1);
      expect(detail?.joinedCount).toBe(1);
    });

    it('returns null for a game that does not exist', async () => {
      const detail = await getOpenGameById('00000000-0000-0000-0000-000000000000');
      expect(detail).toBeNull();
    });
  });
});
