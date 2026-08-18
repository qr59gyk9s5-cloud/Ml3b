/**
 * Keeps an open game's status in sync with its underlying booking when
 * something *other than this module* changes the booking — the venue
 * confirming/rejecting via the normal dashboard, the expiry cron timing
 * it out, or a human venue staff member cancelling a CONFIRMED hold
 * directly. Called from src/domain/booking/transition.ts after every
 * successful transition of an OPEN_GAME-source booking.
 *
 * Always checks open_games's *current* status before acting — see
 * finalize.ts's doc comment for why that's what keeps this from
 * double-processing a cancellation finalize.ts's own cancelOpenGame()
 * already handled (it updates open_games.status before ever touching
 * the booking, so by the time this hook runs for that case, the guard
 * below is already false).
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { openGamePlayers, openGames, type Booking } from '@/lib/db/schema';
import type { VenueCancellationReason } from '@/lib/config/constants';
import { releaseOpenGamePlayerPayment } from '@/domain/payments/service';

export async function handleOpenGameBookingCascade(
  updated: Booking,
  reason: VenueCancellationReason | undefined,
): Promise<void> {
  if (updated.source !== 'OPEN_GAME') return;

  const db = getDb();
  const [openGame] = await db.select().from(openGames).where(eq(openGames.bookingId, updated.id));
  if (!openGame) return;

  if (updated.status === 'CONFIRMED' && openGame.status === 'AWAITING_VENUE') {
    await db
      .update(openGames)
      .set({ status: 'FILLING', updatedAt: new Date() })
      .where(eq(openGames.id, openGame.id));
    return;
  }

  if (
    (updated.status === 'REJECTED' || updated.status === 'EXPIRED') &&
    openGame.status === 'AWAITING_VENUE'
  ) {
    // Only the organizer (player #1) could have joined this early —
    // see create-open-game.ts.
    const [organizerPlayer] = await db
      .select()
      .from(openGamePlayers)
      .where(eq(openGamePlayers.openGameId, openGame.id));
    if (organizerPlayer?.status === 'JOINED') {
      await releaseOpenGamePlayerPayment(organizerPlayer);
    }
    await db
      .update(openGames)
      .set({ status: 'VENUE_REJECTED', updatedAt: new Date() })
      .where(eq(openGames.id, openGame.id));
    return;
  }

  if (
    updated.status === 'CANCELLED_BY_VENUE' &&
    (openGame.status === 'FILLING' || openGame.status === 'MINIMUM_REACHED')
  ) {
    const players = (
      await db.select().from(openGamePlayers).where(eq(openGamePlayers.openGameId, openGame.id))
    ).filter((p) => p.status === 'JOINED');
    for (const player of players) {
      await releaseOpenGamePlayerPayment(player);
    }
    await db
      .update(openGames)
      .set({
        status: 'VENUE_CANCELLED',
        cancelledReason: reason ?? openGame.cancelledReason,
        updatedAt: new Date(),
      })
      .where(eq(openGames.id, openGame.id));
  }
}
