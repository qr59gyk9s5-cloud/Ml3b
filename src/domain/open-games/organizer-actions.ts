/**
 * The organizer's own controls over their open game — calling it off
 * before it's resolved one way or another. Founder-specified policy
 * (previously docs/architecture/open-games.md's flagged gap): cancelling
 * an already-CONFIRMED game (roster locked, per-player payments
 * captured) is now supported too, subject to the same
 * CANCELLATION_CUTOFF_HOURS window as a player leaving one
 * (join.ts's leaveConfirmedOpenGame) — too close to kickoff and it's the
 * admin console's booking override instead, not a self-service cancel.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { bookings, openGames, type OpenGame } from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';
import { CANCELLATION_CUTOFF_HOURS } from '@/lib/config/constants';
import { cancelOpenGameSchema, type CancelOpenGameInput } from '@/lib/validation/open-game';
import { cancelConfirmedOpenGame, cancelOpenGame } from './finalize';

export interface OrganizerActor {
  userId: string | null;
  isPlatformAdmin?: boolean;
}

export async function organizerCancelOpenGame(
  actor: OrganizerActor,
  openGameId: string,
  rawInput: CancelOpenGameInput,
): Promise<OpenGame> {
  if (!actor.userId) {
    throw new DomainError('FORBIDDEN', 'Sign in to manage this game.');
  }

  const parsed = cancelOpenGameSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message ?? 'A reason is required.',
    );
  }

  const db = getDb();
  const [openGame] = await db.select().from(openGames).where(eq(openGames.id, openGameId));
  if (!openGame) {
    throw new DomainError('NOT_FOUND', 'Open game not found.');
  }
  if (openGame.organizerId !== actor.userId && !actor.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'Only the organizer can cancel this game.');
  }

  if (openGame.status === 'CONFIRMED') {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, openGame.bookingId));
    if (!booking) {
      throw new DomainError('NOT_FOUND', 'The underlying booking for this game is missing.');
    }
    const cutoffPassed =
      booking.startAt.getTime() - Date.now() <= CANCELLATION_CUTOFF_HOURS * 60 * 60_000;
    if (cutoffPassed) {
      throw new DomainError(
        'INVALID_TRANSITION',
        `Too close to kickoff to cancel yourself — within ${CANCELLATION_CUTOFF_HOURS}h of start, contact the venue or platform admin.`,
      );
    }
    return cancelConfirmedOpenGame(openGameId, parsed.data.reason);
  }

  return cancelOpenGame(openGameId, 'ORGANIZER_CANCELLED', parsed.data.reason);
}
