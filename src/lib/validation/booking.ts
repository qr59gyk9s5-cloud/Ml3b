/**
 * Shared Zod schemas for booking input. Structural validation only — "is
 * this slot actually available," "is this within the facility's min/max
 * duration," "is the venue ACTIVE" are business rules checked by the
 * domain services in src/domain/booking, not here.
 */
import { z } from 'zod';
import { VENUE_CANCELLATION_REASON } from '@/lib/config/constants';

const customerNameSchema = z.string().trim().min(1).max(120);
const customerPhoneSchema = z.string().trim().min(1).max(40);
const customerNoteSchema = z.string().trim().max(1000);
const venuePrivateNoteSchema = z.string().trim().max(1000);
const idempotencyKeySchema = z.string().trim().min(1).max(200);

/** A marketplace customer requesting a booking for themselves. */
export const createBookingRequestSchema = z.object({
  facilityId: z.uuid(),
  startAt: z.coerce.date(),
  durationMinutes: z.int().positive(),
  customerName: customerNameSchema.optional(),
  customerPhone: customerPhoneSchema.optional(),
  customerNote: customerNoteSchema.optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
});
export type CreateBookingRequestInput = z.infer<typeof createBookingRequestSchema>;

/** Venue staff entering a booking directly (walk-in / phone booking) — no
 * customer account, so name/phone are captured as plain fields and are
 * mandatory (there's nothing else to identify the customer by). */
export const createManualBookingSchema = z.object({
  facilityId: z.uuid(),
  startAt: z.coerce.date(),
  durationMinutes: z.int().positive(),
  customerName: customerNameSchema,
  customerPhone: customerPhoneSchema.optional(),
  customerNote: customerNoteSchema.optional(),
  venuePrivateNote: venuePrivateNoteSchema.optional(),
});
export type CreateManualBookingInput = z.infer<typeof createManualBookingSchema>;

/** Venue-initiated reject/cancel always carries a reason from the fixed
 * list — never free text (§ booking-flow.md "Cancellation"). */
export const venueCancelBookingSchema = z.object({
  reason: z.enum(VENUE_CANCELLATION_REASON),
});
export type VenueCancelBookingInput = z.infer<typeof venueCancelBookingSchema>;
