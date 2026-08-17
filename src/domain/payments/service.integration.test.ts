import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  createTestBooking,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { payments } from '@/lib/db/schema';
import { CANCELLATION_REFUND_RATE } from '@/lib/config/constants';

const authorize = vi.fn();
const capture = vi.fn();
const release = vi.fn();
const refund = vi.fn();

vi.mock('@/lib/payments', () => ({
  isPaymentProviderConfigured: vi.fn(() => true),
  getPaymentProvider: vi.fn(() => ({ authorize, capture, release, refund })),
}));

import { isPaymentProviderConfigured } from '@/lib/payments';
import {
  authorizePaymentForBooking,
  captureBookingPayment,
  releaseBookingPayment,
  refundBookingCancellationPayment,
} from './service';

async function setUpBooking() {
  const owner = await createTestUser('Owner');
  const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
  const sport = await createTestSport(`sport-${venue.id}`);
  const facility = await createTestFacility(venue.id, sport.id);
  const customer = await createTestUser('Customer');
  const booking = await createTestBooking(venue.id, facility.id, {
    customerId: customer.id,
    status: 'REQUESTED',
    subtotalMinor: 40000,
    totalMinor: 40000,
  });
  return booking;
}

async function paymentFor(bookingId: string) {
  const [row] = await getTestDb().select().from(payments).where(eq(payments.bookingId, bookingId));
  return row;
}

describe('payments domain service (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(() => {
    authorize.mockReset();
    capture.mockReset();
    release.mockReset();
    refund.mockReset();
    vi.mocked(isPaymentProviderConfigured).mockReturnValue(true);
  });

  describe('no provider configured', () => {
    it('every function no-ops — no payments row, no throw, provider never called', async () => {
      vi.mocked(isPaymentProviderConfigured).mockReturnValue(false);
      const booking = await setUpBooking();

      await expect(authorizePaymentForBooking(booking)).resolves.toBeUndefined();
      await expect(captureBookingPayment(booking)).resolves.toBeUndefined();
      await expect(releaseBookingPayment(booking)).resolves.toBeUndefined();
      await expect(refundBookingCancellationPayment(booking)).resolves.toBeUndefined();

      expect(await paymentFor(booking.id)).toBeUndefined();
      expect(authorize).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
      expect(refund).not.toHaveBeenCalled();
    });
  });

  describe('authorizePaymentForBooking', () => {
    it('writes an AUTHORIZED row with the provider ref on success', async () => {
      const booking = await setUpBooking();
      authorize.mockResolvedValue({ providerRef: 'fawry-ref-1' });

      await authorizePaymentForBooking(booking);

      expect(authorize).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: booking.id, amountMinor: 40000, currency: 'EGP' }),
      );
      const payment = await paymentFor(booking.id);
      expect(payment?.status).toBe('AUTHORIZED');
      expect(payment?.providerRef).toBe('fawry-ref-1');
      expect(payment?.amountMinor).toBe(40000);
    });

    it('records a FAILED row and does not throw when the provider rejects', async () => {
      const booking = await setUpBooking();
      authorize.mockRejectedValue(new Error('card declined'));

      await expect(authorizePaymentForBooking(booking)).resolves.toBeUndefined();

      const payment = await paymentFor(booking.id);
      expect(payment?.status).toBe('FAILED');
    });
  });

  describe('captureBookingPayment', () => {
    it('moves an AUTHORIZED payment to CAPTURED on success', async () => {
      const booking = await setUpBooking();
      authorize.mockResolvedValue({ providerRef: 'fawry-ref-2' });
      await authorizePaymentForBooking(booking);

      capture.mockResolvedValue(undefined);
      await captureBookingPayment(booking);

      expect(capture).toHaveBeenCalledWith('fawry-ref-2');
      const payment = await paymentFor(booking.id);
      expect(payment?.status).toBe('CAPTURED');
      expect(payment?.capturedAt).not.toBeNull();
    });

    it('marks the payment FAILED and does not throw when capture fails', async () => {
      const booking = await setUpBooking();
      authorize.mockResolvedValue({ providerRef: 'fawry-ref-3' });
      await authorizePaymentForBooking(booking);

      capture.mockRejectedValue(new Error('gateway timeout'));
      await expect(captureBookingPayment(booking)).resolves.toBeUndefined();

      const payment = await paymentFor(booking.id);
      expect(payment?.status).toBe('FAILED');
    });

    it('no-ops when there is no AUTHORIZED payment to capture', async () => {
      const booking = await setUpBooking();
      await expect(captureBookingPayment(booking)).resolves.toBeUndefined();
      expect(capture).not.toHaveBeenCalled();
    });
  });

  describe('releaseBookingPayment', () => {
    it('moves an AUTHORIZED payment to RELEASED on success', async () => {
      const booking = await setUpBooking();
      authorize.mockResolvedValue({ providerRef: 'fawry-ref-4' });
      await authorizePaymentForBooking(booking);

      release.mockResolvedValue(undefined);
      await releaseBookingPayment(booking);

      expect(release).toHaveBeenCalledWith('fawry-ref-4');
      const payment = await paymentFor(booking.id);
      expect(payment?.status).toBe('RELEASED');
    });
  });

  describe('refundBookingCancellationPayment', () => {
    it('refunds CANCELLATION_REFUND_RATE of a CAPTURED payment and marks it PARTIALLY_REFUNDED', async () => {
      const booking = await setUpBooking();
      authorize.mockResolvedValue({ providerRef: 'fawry-ref-5' });
      await authorizePaymentForBooking(booking);
      capture.mockResolvedValue(undefined);
      await captureBookingPayment(booking);

      refund.mockResolvedValue(undefined);
      await refundBookingCancellationPayment(booking);

      const expectedRefund = Math.round(40000 * CANCELLATION_REFUND_RATE);
      expect(refund).toHaveBeenCalledWith('fawry-ref-5', expectedRefund);
      const payment = await paymentFor(booking.id);
      expect(payment?.status).toBe('PARTIALLY_REFUNDED');
      expect(payment?.refundAmountMinor).toBe(expectedRefund);
      expect(payment?.refundedAt).not.toBeNull();
    });

    it('no-ops when there is no CAPTURED payment to refund', async () => {
      const booking = await setUpBooking();
      await expect(refundBookingCancellationPayment(booking)).resolves.toBeUndefined();
      expect(refund).not.toHaveBeenCalled();
    });
  });
});
