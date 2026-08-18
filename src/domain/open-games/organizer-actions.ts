/**
 * The organizer's own controls over their open game — calling it off
 * before it's resolved one way or another. See
 * docs/architecture/open-games.md's known gap: cancelling an
 * already-CONFIRMED game (roster locked, payments captured) isn't
 * built — this only covers AWAITING_VENUE/FILLING/MINIMUM_REACHED,
 * where every held payment is still just an authorization, nothing
 * captured yet.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { openGames, type OpenGame } from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';
import { cancelOpenGameSchema, type CancelOpenGameInput } from '@/lib/validation/open-game';
import { cancelOpenGame } from './finalize';

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
    throw new DomainError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'A reason is required.');
  }

  const db = getDb();
  const [openGame] = await db.select().from(openGames).where(eq(openGames.id, openGameId));
  if (!openGame) {
    throw new DomainError('NOT_FOUND', 'Open game not found.');
  }
  if (openGame.organizerId !== actor.userId && !actor.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'Only the organizer can cancel this game.');
  }

  return cancelOpenGame(openGameId, 'ORGANIZER_CANCELLED', parsed.data.reason);
}
