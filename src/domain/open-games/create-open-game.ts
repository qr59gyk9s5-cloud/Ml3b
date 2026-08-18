/**
 * Creates an open game: validates the slot exactly like a normal
 * booking request would (ADR-011 — one real booking underneath, not a
 * parallel system), creates that booking with source='OPEN_GAME', the
 * open_games coordination row on top of it (status=AWAITING_VENUE), and
 * immediately joins the organizer as player #1 — they authorize their
 * own share right away, same as anyone else who joins once the game
 * reaches FILLING. This is the one deliberate exception to "players can
 * only join once FILLING": the organizer's commitment happens up front,
 * both to prove real intent (not spam) and to give them skin in the
 * game they're asking strangers to join. See docs/architecture/open-games.md.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import {
  bookingEvents,
  bookings,
  facilities,
  openGamePlayers,
  openGames,
  venues,
  type OpenGame,
} from '@/lib/db/schema';
import { isUniqueViolation } from '@/lib/db/errors';
import { DomainError } from '@/domain/errors';
import {
  OPEN_GAME_MAX_HOLD_HOURS,
  OPEN_GAME_MIN_LEAD_TIME_HOURS,
} from '@/lib/config/constants';
import { assertSpanIsAvailable } from '@/domain/booking/availability-check';
import { computeBookingPricing } from '@/domain/booking/pricing';
import { generateBookingReference } from '@/domain/booking/reference';
import { isUserSuspended } from '@/domain/admin/suspension';
import { enqueueBookingEvent } from '@/domain/notifications/outbox';
import { authorizePaymentForOpenGamePlayer } from '@/domain/payments/service';
import { createOpenGameSchema, type CreateOpenGameInput } from '@/lib/validation/open-game';

const MAX_REFERENCE_ATTEMPTS = 5;
const HOUR_MS = 60 * 60_000;

export interface OpenGameActor {
  userId: string | null;
}

export async function createOpenGame(
  actor: OpenGameActor,
  rawInput: CreateOpenGameInput,
): Promise<OpenGame> {
  if (!actor.userId) {
    throw new DomainError('FORBIDDEN', 'Sign in to organize an open game.');
  }
  if (await isUserSuspended(actor.userId)) {
    throw new DomainError('FORBIDDEN', 'Your account has been suspended.');
  }

  const parsed = createOpenGameSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message ?? 'Invalid open game input.',
    );
  }
  const input = parsed.data;

  if (input.minPlayers > input.targetPlayers) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'The minimum player count cannot be greater than the target.',
    );
  }

  const db = getDb();

  const [facility] = await db.select().from(facilities).where(eq(facilities.id, input.facilityId));
  if (!facility || !facility.isActive) {
    throw new DomainError('NOT_FOUND', 'Facility not found.');
  }

  const [venue] = await db.select().from(venues).where(eq(venues.id, facility.venueId));
  if (!venue || venue.status !== 'ACTIVE') {
    throw new DomainError('NOT_FOUND', 'Venue not found.');
  }

  if (input.durationMinutes % facility.slotDurationMinutes !== 0) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Duration must be a whole number of ${facility.slotDurationMinutes}-minute slots.`,
    );
  }
  if (
    input.durationMinutes < facility.minimumDurationMinutes ||
    input.durationMinutes > facility.maximumDurationMinutes
  ) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Duration must be between ${facility.minimumDurationMinutes} and ${facility.maximumDurationMinutes} minutes.`,
    );
  }

  const endAt = new Date(input.startAt.getTime() + input.durationMinutes * 60_000);
  if (endAt <= input.startAt) {
    throw new DomainError('VALIDATION_FAILED', 'Invalid booking time.');
  }

  if (input.joinCutoffAt.getTime() >= input.startAt.getTime()) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'The join cutoff must be before the game starts.',
    );
  }
  if (input.joinCutoffAt.getTime() <= Date.now()) {
    throw new DomainError('VALIDATION_FAILED', 'The join cutoff must be in the future.');
  }
  // Global MVP constants, not yet a per-venue setting — see
  // docs/architecture/open-games.md.
  if (input.startAt.getTime() - Date.now() < OPEN_GAME_MIN_LEAD_TIME_HOURS * HOUR_MS) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `An open game must be created at least ${OPEN_GAME_MIN_LEAD_TIME_HOURS} hours before it starts.`,
    );
  }
  if (input.joinCutoffAt.getTime() - Date.now() > OPEN_GAME_MAX_HOLD_HOURS * HOUR_MS) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `The join cutoff can be at most ${OPEN_GAME_MAX_HOLD_HOURS} hours from now — a venue can't hold a slot indefinitely.`,
    );
  }

  await assertSpanIsAvailable(
    facility.id,
    venue.timezone,
    input.startAt,
    endAt,
    facility.slotDurationMinutes,
  );

  const pricing = computeBookingPricing(facility.basePriceMinor, input.durationMinutes);
  const requestedAt = new Date();
  // Open games don't use the normal 30-minute request-expiry window for
  // the venue's own response — that's still exactly 30 minutes (the
  // venue is answering "is this slot available", not "will the roster
  // fill"), so expiresAt is set the same way a normal request's is.
  const expiresAt = new Date(requestedAt.getTime() + 30 * 60_000);

  let bookingId: string | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
    try {
      const [booking] = await db
        .insert(bookings)
        .values({
          reference: generateBookingReference(),
          venueId: venue.id,
          facilityId: facility.id,
          customerId: actor.userId,
          status: 'REQUESTED',
          source: 'OPEN_GAME',
          startAt: input.startAt,
          endAt,
          requestedAt,
          expiresAt,
          subtotalMinor: pricing.subtotalMinor,
          platformFeeMinor: pricing.platformFeeMinor,
          totalMinor: pricing.totalMinor,
          currency: facility.currency,
          createdBy: actor.userId,
        })
        .returning();

      await db.insert(bookingEvents).values({
        bookingId: booking.id,
        eventType: 'BOOKING_REQUESTED',
        actorType: 'CUSTOMER',
        actorId: actor.userId,
      });

      bookingId = booking.id;
      // Best-effort — never throws, never blocks. See
      // src/domain/notifications/outbox.ts's doc comment.
      await enqueueBookingEvent('BOOKING_REQUESTED', booking.id);
      break;
    } catch (err) {
      lastError = err;
      if (isUniqueViolation(err, 'bookings_reference_unique')) continue;
      throw err;
    }
  }
  if (!bookingId) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Could not generate a unique booking reference.');
  }

  const [openGame] = await db
    .insert(openGames)
    .values({
      bookingId,
      organizerId: actor.userId,
      targetPlayers: input.targetPlayers,
      minPlayers: input.minPlayers,
      pricePerPlayerMinor: input.pricePerPlayerMinor,
      currency: facility.currency,
      joinCutoffAt: input.joinCutoffAt,
      autoConfirmIfMinMet: input.autoConfirmIfMinMet,
    })
    .returning();

  // Organizer is player #1 — see this module's doc comment. Inserted
  // directly (not via join.ts's joinOpenGame) because that function
  // requires status=FILLING, which this game isn't yet.
  const [organizerPlayer] = await db
    .insert(openGamePlayers)
    .values({ openGameId: openGame.id, userId: actor.userId })
    .returning();

  // Best-effort — never throws, never blocks. See
  // src/domain/payments/service.ts's doc comment.
  await authorizePaymentForOpenGamePlayer(
    organizerPlayer,
    bookingId,
    openGame.pricePerPlayerMinor,
    openGame.currency,
  );

  return openGame;
}
