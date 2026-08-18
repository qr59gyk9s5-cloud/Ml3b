/**
 * The two ways an open game stops actively being pursued:
 *
 *   - finalizeOpenGame(): roster is good enough (target reached, or
 *     minimum reached with auto_confirm_if_min_met) — capture every
 *     joined player's held payment, status -> CONFIRMED. Only valid
 *     from FILLING/MINIMUM_REACHED (the booking is already CONFIRMED
 *     by then, a provisional hold — nothing to do to it).
 *   - cancelOpenGame(): the request never got a venue accept, the
 *     roster never got there, or the organizer/venue called it off —
 *     release every joined player's hold, status -> VENUE_REJECTED /
 *     FAILED_TO_FILL / ORGANIZER_CANCELLED / VENUE_CANCELLED. Valid
 *     from AWAITING_VENUE, FILLING, or MINIMUM_REACHED.
 *
 * Both are "internal" — callers (join.ts's threshold checks, cutoff.ts,
 * organizer-actions.ts) are expected to have already verified it's
 * legitimate to call these; these functions do the mechanical work, not
 * the authorization decision. See docs/architecture/open-games.md.
 *
 * cancelOpenGame() updates open_games.status BEFORE transitioning the
 * underlying booking, deliberately — booking-cascade.ts's generic hook
 * (fired from every booking transition, not just ones this module
 * triggers) checks open_games's *current* status before acting, so this
 * ordering is what stops the hook from redundantly re-processing a
 * cancellation this module already handled. Don't reorder without
 * re-reading booking-cascade.ts.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { bookings, openGamePlayers, openGames, type OpenGame } from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';
import { isTerminalBookingStatus } from '@/domain/booking/state-machine';
import { transitionBooking } from '@/domain/booking/transition';
import type { VenueCancellationReason } from '@/lib/config/constants';
import {
  captureOpenGamePlayerPayment,
  releaseOpenGamePlayerPayment,
} from '@/domain/payments/service';

/** A synthetic system actor — see this module's doc comment for why
 * "isSystem" here means "the caller already authorized this," not
 * literally "no human involved." */
export const OPEN_GAMES_SYSTEM_ACTOR = { userId: null, isPlatformAdmin: false, isSystem: true };

const FILLING_STATUSES: ReadonlySet<OpenGame['status']> = new Set(['FILLING', 'MINIMUM_REACHED']);
const NON_TERMINAL_STATUSES: ReadonlySet<OpenGame['status']> = new Set([
  'AWAITING_VENUE',
  'FILLING',
  'MINIMUM_REACHED',
]);

async function getJoinedPlayers(openGameId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(openGamePlayers)
    .where(eq(openGamePlayers.openGameId, openGameId));
  return rows.filter((p) => p.status === 'JOINED');
}

export async function finalizeOpenGame(openGameId: string): Promise<OpenGame> {
  const db = getDb();
  const [openGame] = await db.select().from(openGames).where(eq(openGames.id, openGameId));
  if (!openGame) {
    throw new DomainError('NOT_FOUND', 'Open game not found.');
  }
  if (!FILLING_STATUSES.has(openGame.status)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `An open game cannot be finalized from status ${openGame.status}.`,
    );
  }

  for (const player of await getJoinedPlayers(openGameId)) {
    await captureOpenGamePlayerPayment(player);
  }

  const [updated] = await db
    .update(openGames)
    .set({ status: 'CONFIRMED', updatedAt: new Date() })
    .where(eq(openGames.id, openGameId))
    .returning();
  return updated;
}

export type OpenGameCancelStatus =
  | 'VENUE_REJECTED'
  | 'FAILED_TO_FILL'
  | 'ORGANIZER_CANCELLED'
  | 'VENUE_CANCELLED';

export async function cancelOpenGame(
  openGameId: string,
  targetStatus: OpenGameCancelStatus,
  reason: VenueCancellationReason,
): Promise<OpenGame> {
  const db = getDb();
  const [openGame] = await db.select().from(openGames).where(eq(openGames.id, openGameId));
  if (!openGame) {
    throw new DomainError('NOT_FOUND', 'Open game not found.');
  }
  if (!NON_TERMINAL_STATUSES.has(openGame.status)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `An open game cannot be cancelled from status ${openGame.status}.`,
    );
  }

  for (const player of await getJoinedPlayers(openGameId)) {
    await releaseOpenGamePlayerPayment(player);
  }

  // Deliberately before the booking transition below — see this
  // module's doc comment.
  const [updated] = await db
    .update(openGames)
    .set({ status: targetStatus, cancelledReason: reason, updatedAt: new Date() })
    .where(eq(openGames.id, openGameId))
    .returning();

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, openGame.bookingId));
  if (booking && !isTerminalBookingStatus(booking.status)) {
    if (booking.status === 'REQUESTED') {
      // No REQUESTED -> CANCELLED_BY_VENUE edge exists; EXPIRED is the
      // existing isSystem-allowed edge closest to "withdrawn."
      await transitionBooking({
        bookingId: openGame.bookingId,
        targetStatus: 'EXPIRED',
        actor: OPEN_GAMES_SYSTEM_ACTOR,
      });
    } else if (booking.status === 'CONFIRMED') {
      await transitionBooking({
        bookingId: openGame.bookingId,
        targetStatus: 'CANCELLED_BY_VENUE',
        actor: OPEN_GAMES_SYSTEM_ACTOR,
        reason,
      });
    }
  }

  return updated;
}
