/**
 * Resolves what src/domain/authz/booking.ts needs to know about an actor
 * *for one specific booking*: are they the customer it belongs to, what's
 * their role (if any) at the booking's venue, are they a platform admin,
 * is this a system-initiated call (e.g. the expiry job). Fetched fresh
 * from the database every time — mirrors src/domain/venue/authz-context.ts.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { venueMembers, type Booking } from '@/lib/db/schema';
import type { BookingAuthzContext } from '@/domain/authz/booking';

export interface BookingActor {
  /** null for an unauthenticated caller or a pure system job. */
  userId: string | null;
  isPlatformAdmin: boolean;
  /** True only for background-job/system-initiated calls (e.g. expiry). Never
   * set this from anything a client can influence. */
  isSystem?: boolean;
}

export async function resolveBookingAuthzContext(
  booking: Pick<Booking, 'venueId' | 'customerId'>,
  actor: BookingActor,
): Promise<BookingAuthzContext> {
  const isOwningCustomer = actor.userId !== null && actor.userId === booking.customerId;

  let venueRole: BookingAuthzContext['venueRole'] = null;
  if (actor.userId) {
    const db = getDb();
    const [membership] = await db
      .select()
      .from(venueMembers)
      .where(and(eq(venueMembers.venueId, booking.venueId), eq(venueMembers.userId, actor.userId)));
    venueRole = membership?.role ?? null;
  }

  return {
    isOwningCustomer,
    venueRole,
    isPlatformAdmin: actor.isPlatformAdmin,
    isSystem: actor.isSystem ?? false,
  };
}
