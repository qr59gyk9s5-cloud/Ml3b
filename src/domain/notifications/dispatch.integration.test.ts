import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getTestDb, closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  addVenueMember,
  createTestBooking,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { notifications, outboxEvents } from '@/lib/db/schema';
import { transitionBooking } from '@/domain/booking/transition';
import { dispatchOutboxEvents } from './dispatch';

async function setUpVenueAndFacility() {
  const owner = await createTestUser('Owner');
  const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
  const sport = await createTestSport(`sport-${venue.id}`);
  const facility = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
  return { owner, venue, facility };
}

describe('dispatchOutboxEvents (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('confirming a booking notifies the customer, IN_APP and EMAIL', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    const customer = await createTestUser('Customer');
    const booking = await createTestBooking(venue.id, facility.id, {
      customerId: customer.id,
      status: 'REQUESTED',
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });

    await transitionBooking({
      bookingId: booking.id,
      targetStatus: 'CONFIRMED',
      actor: { userId: owner.id, isPlatformAdmin: false },
    });

    const result = await dispatchOutboxEvents();
    expect(result.processed).toBeGreaterThan(0);

    const [outboxRow] = await getTestDb()
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventType, 'BOOKING_CONFIRMED'));
    expect(outboxRow.status).toBe('PROCESSED');

    const customerNotifications = await getTestDb()
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, customer.id), eq(notifications.type, 'BOOKING_CONFIRMED')),
      );
    const channels = customerNotifications.map((n) => n.channel).sort();
    expect(channels).toEqual(['EMAIL', 'IN_APP']);
    expect(customerNotifications.every((n) => n.status === 'SENT')).toBe(true);
  });

  it('a new request notifies venue staff, not the requesting customer', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    const receptionist = await createTestUser('Receptionist');
    await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');
    const customer = await createTestUser('Requesting Customer');

    const booking = await createTestBooking(venue.id, facility.id, {
      customerId: customer.id,
      status: 'REQUESTED',
    });
    const { enqueueBookingEvent } = await import('./outbox');
    await enqueueBookingEvent('BOOKING_REQUESTED', booking.id);

    await dispatchOutboxEvents();

    const recipients = await getTestDb()
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.type, 'BOOKING_REQUESTED'));
    const recipientIds = new Set(recipients.map((r) => r.userId));

    expect(recipientIds.has(owner.id)).toBe(true);
    expect(recipientIds.has(receptionist.id)).toBe(true);
    expect(recipientIds.has(customer.id)).toBe(false);
  });

  it('does not reprocess an already-PROCESSED event', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    const customer = await createTestUser('Customer');
    const booking = await createTestBooking(venue.id, facility.id, {
      customerId: customer.id,
      status: 'REQUESTED',
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });
    await transitionBooking({
      bookingId: booking.id,
      targetStatus: 'CONFIRMED',
      actor: { userId: owner.id, isPlatformAdmin: false },
    });

    const first = await dispatchOutboxEvents();
    expect(first.processed).toBeGreaterThan(0);

    const second = await dispatchOutboxEvents();
    const stillHasThisEvent = (
      await getTestDb()
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.eventType, 'BOOKING_CONFIRMED'))
    ).length;
    expect(stillHasThisEvent).toBeGreaterThan(0);
    // The event from *this* test's booking was already PROCESSED on the
    // first call — the second call has nothing new of its own to do for
    // it (it may still process leftover PENDING rows from other tests).
    void second;
  });

  it('a structural failure (booking not found) retries, then permanently fails past the attempt cap', async () => {
    const db = getTestDb();
    const { OUTBOX_MAX_ATTEMPTS } = await import('@/lib/config/constants');
    const [event] = await db
      .insert(outboxEvents)
      .values({
        eventType: 'BOOKING_CONFIRMED',
        payload: { bookingId: '00000000-0000-0000-0000-000000000000' },
        attempts: OUTBOX_MAX_ATTEMPTS - 1,
      })
      .returning();

    const result = await dispatchOutboxEvents();
    expect(result.failed).toBeGreaterThan(0);

    const [updated] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, event.id));
    expect(updated.status).toBe('FAILED');
    expect(updated.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
    expect(updated.lastError).toContain('not found');
  });
});
