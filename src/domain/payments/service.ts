/**
 * Payment side effects on booking transitions (ADR-007): authorize on
 * request, capture on confirm, release on reject/expire, partial refund
 * on a customer cancelling a confirmed booking. Called from
 * src/domain/booking/create-request.ts and src/domain/booking/transition.ts.
 * The bottom of this file has the same shape for open games' per-player
 * payments (ADR-011) — called from src/domain/open-games instead.
 *
 * Every function here is best-effort and never throws back into its
 * caller — same contract as src/domain/notifications/outbox.ts's
 * enqueueBookingEvent, and for the same reason (CLAUDE.md's priority
 * order: booking correctness over any side effect hung off it). Two
 * distinct failure modes both end up logged-and-swallowed rather than
 * blocking the booking transition that triggered them:
 *
 *   - No provider configured (true today — see
 *     src/lib/payments/index.ts's isPaymentProviderConfigured()): skipped
 *     entirely, nothing written.
 *   - A configured provider call fails: the attempt is recorded as a
 *     FAILED payments row for follow-up/reconciliation, not silently
 *     dropped, but it still doesn't block the transition — a payment
 *     gateway outage must never be able to jam the double-booking-safe
 *     state machine.
 *
 * This non-blocking behavior is itself a real business-risk tradeoff
 * (a booking could move to CONFIRMED with a FAILED capture behind it,
 * needing manual reconciliation) — documented honestly in
 * docs/architecture/payments.md rather than silently decided, since it's
 * moot until a real provider is actually configured.
 *
 * No function here ever executes a *refund transfer* for real — that
 * requires explicit human approval per CLAUDE.md's forbidden-without-
 * approval list — but the interface is symmetric now so it's a single
 * flag flip, not a redesign, once that approval exists.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { payments, type Booking, type OpenGamePlayer, type Payment } from '@/lib/db/schema';
import { CANCELLATION_REFUND_RATE } from '@/lib/config/constants';
import { getPaymentProvider, isPaymentProviderConfigured } from '@/lib/payments';

async function findPaymentForBooking(bookingId: string): Promise<Payment | undefined> {
  const db = getDb();
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, bookingId))
    .orderBy(payments.createdAt);
  return payment;
}

async function findPaymentForOpenGamePlayer(openGamePlayerId: string): Promise<Payment | undefined> {
  const db = getDb();
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.openGamePlayerId, openGamePlayerId))
    .orderBy(payments.createdAt);
  return payment;
}

export async function authorizePaymentForBooking(booking: Booking): Promise<void> {
  if (!isPaymentProviderConfigured()) {
    console.log(`[payments] no provider configured — skipping authorize for booking ${booking.id}`);
    return;
  }

  const db = getDb();
  try {
    const provider = getPaymentProvider();
    const result = await provider.authorize({
      bookingId: booking.id,
      amountMinor: booking.totalMinor,
      currency: booking.currency,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
    });
    await db.insert(payments).values({
      bookingId: booking.id,
      provider: 'fawry',
      providerRef: result.providerRef,
      status: 'AUTHORIZED',
      amountMinor: booking.totalMinor,
      currency: booking.currency,
      authorizedAt: new Date(),
    });
  } catch (err) {
    console.error(`[payments] authorize failed for booking ${booking.id}:`, err);
    await db
      .insert(payments)
      .values({
        bookingId: booking.id,
        provider: 'fawry',
        status: 'FAILED',
        amountMinor: booking.totalMinor,
        currency: booking.currency,
      })
      .catch((insertErr) =>
        console.error(`[payments] failed to record FAILED authorize for ${booking.id}:`, insertErr),
      );
  }
}

export async function captureBookingPayment(booking: Booking): Promise<void> {
  if (!isPaymentProviderConfigured()) {
    console.log(`[payments] no provider configured — skipping capture for booking ${booking.id}`);
    return;
  }

  try {
    const payment = await findPaymentForBooking(booking.id);
    if (!payment || payment.status !== 'AUTHORIZED' || !payment.providerRef) {
      console.error(
        `[payments] no capturable AUTHORIZED payment found for booking ${booking.id} — skipping capture`,
      );
      return;
    }

    const db = getDb();
    const provider = getPaymentProvider();
    try {
      await provider.capture(payment.providerRef);
      await db
        .update(payments)
        .set({ status: 'CAPTURED', capturedAt: new Date(), updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    } catch (err) {
      console.error(`[payments] capture failed for booking ${booking.id}:`, err);
      await db
        .update(payments)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }
  } catch (err) {
    console.error(`[payments] unexpected error capturing payment for booking ${booking.id}:`, err);
  }
}

export async function releaseBookingPayment(booking: Booking): Promise<void> {
  if (!isPaymentProviderConfigured()) {
    console.log(`[payments] no provider configured — skipping release for booking ${booking.id}`);
    return;
  }

  try {
    const payment = await findPaymentForBooking(booking.id);
    if (!payment || payment.status !== 'AUTHORIZED' || !payment.providerRef) {
      console.error(
        `[payments] no releasable AUTHORIZED payment found for booking ${booking.id} — skipping release`,
      );
      return;
    }

    const db = getDb();
    const provider = getPaymentProvider();
    try {
      await provider.release(payment.providerRef);
      await db
        .update(payments)
        .set({ status: 'RELEASED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    } catch (err) {
      console.error(`[payments] release failed for booking ${booking.id}:`, err);
      await db
        .update(payments)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }
  } catch (err) {
    console.error(`[payments] unexpected error releasing payment for booking ${booking.id}:`, err);
  }
}

/** ADR-007's 50%-refund-on-cancellation-outside-cutoff rule. Only ever
 * called by src/domain/booking/transition.ts for a customer cancelling a
 * previously-CONFIRMED booking (the cutoff check already happened there —
 * this function trusts its caller, it does not re-derive eligibility). */
export async function refundBookingCancellationPayment(booking: Booking): Promise<void> {
  if (!isPaymentProviderConfigured()) {
    console.log(`[payments] no provider configured — skipping refund for booking ${booking.id}`);
    return;
  }

  try {
    const payment = await findPaymentForBooking(booking.id);
    if (!payment || payment.status !== 'CAPTURED' || !payment.providerRef) {
      console.error(
        `[payments] no refundable CAPTURED payment found for booking ${booking.id} — skipping refund`,
      );
      return;
    }

    const refundAmountMinor = Math.round(payment.amountMinor * CANCELLATION_REFUND_RATE);
    const db = getDb();
    const provider = getPaymentProvider();
    try {
      await provider.refund(payment.providerRef, refundAmountMinor);
      await db
        .update(payments)
        .set({
          status: 'PARTIALLY_REFUNDED',
          refundedAt: new Date(),
          refundAmountMinor,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
    } catch (err) {
      console.error(`[payments] refund failed for booking ${booking.id}:`, err);
      await db
        .update(payments)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }
  } catch (err) {
    console.error(`[payments] unexpected error refunding payment for booking ${booking.id}:`, err);
  }
}

/**
 * ADR-011's per-player payment lifecycle — same authorize/capture/
 * release contract as the booking-level functions above (best-effort,
 * no-op when unconfigured, never throws), just keyed by
 * open_game_player_id instead of booking_id. Uses booking.id as the
 * PaymentProvider's `bookingId` reference field for now (the interface
 * doesn't have a separate concept — the real per-player identity lives
 * in payments.open_game_player_id, not in what's sent to the provider).
 */
export async function authorizePaymentForOpenGamePlayer(
  player: OpenGamePlayer,
  bookingId: string,
  amountMinor: number,
  currency: string,
): Promise<void> {
  if (!isPaymentProviderConfigured()) {
    console.log(
      `[payments] no provider configured — skipping authorize for open game player ${player.id}`,
    );
    return;
  }

  const db = getDb();
  try {
    const provider = getPaymentProvider();
    const result = await provider.authorize({
      bookingId,
      amountMinor,
      currency,
      customerName: null,
      customerPhone: null,
    });
    await db.insert(payments).values({
      openGamePlayerId: player.id,
      provider: 'fawry',
      providerRef: result.providerRef,
      status: 'AUTHORIZED',
      amountMinor,
      currency,
      authorizedAt: new Date(),
    });
  } catch (err) {
    console.error(`[payments] authorize failed for open game player ${player.id}:`, err);
    await db
      .insert(payments)
      .values({
        openGamePlayerId: player.id,
        provider: 'fawry',
        status: 'FAILED',
        amountMinor,
        currency,
      })
      .catch((insertErr) =>
        console.error(
          `[payments] failed to record FAILED authorize for open game player ${player.id}:`,
          insertErr,
        ),
      );
  }
}

export async function captureOpenGamePlayerPayment(player: OpenGamePlayer): Promise<void> {
  if (!isPaymentProviderConfigured()) {
    console.log(
      `[payments] no provider configured — skipping capture for open game player ${player.id}`,
    );
    return;
  }

  try {
    const payment = await findPaymentForOpenGamePlayer(player.id);
    if (!payment || payment.status !== 'AUTHORIZED' || !payment.providerRef) {
      console.error(
        `[payments] no capturable AUTHORIZED payment found for open game player ${player.id} — skipping capture`,
      );
      return;
    }

    const db = getDb();
    const provider = getPaymentProvider();
    try {
      await provider.capture(payment.providerRef);
      await db
        .update(payments)
        .set({ status: 'CAPTURED', capturedAt: new Date(), updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    } catch (err) {
      console.error(`[payments] capture failed for open game player ${player.id}:`, err);
      await db
        .update(payments)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }
  } catch (err) {
    console.error(
      `[payments] unexpected error capturing payment for open game player ${player.id}:`,
      err,
    );
  }
}

export async function releaseOpenGamePlayerPayment(player: OpenGamePlayer): Promise<void> {
  if (!isPaymentProviderConfigured()) {
    console.log(
      `[payments] no provider configured — skipping release for open game player ${player.id}`,
    );
    return;
  }

  try {
    const payment = await findPaymentForOpenGamePlayer(player.id);
    if (!payment || payment.status !== 'AUTHORIZED' || !payment.providerRef) {
      console.error(
        `[payments] no releasable AUTHORIZED payment found for open game player ${player.id} — skipping release`,
      );
      return;
    }

    const db = getDb();
    const provider = getPaymentProvider();
    try {
      await provider.release(payment.providerRef);
      await db
        .update(payments)
        .set({ status: 'RELEASED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    } catch (err) {
      console.error(`[payments] release failed for open game player ${player.id}:`, err);
      await db
        .update(payments)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }
  } catch (err) {
    console.error(
      `[payments] unexpected error releasing payment for open game player ${player.id}:`,
      err,
    );
  }
}
