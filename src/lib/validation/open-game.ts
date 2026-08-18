/**
 * Structural validation only — business rules (min <= target, cutoff
 * before start, slot actually available) are src/domain/open-games's
 * job, not this file's, same split as src/lib/validation/booking.ts.
 */
import { z } from 'zod';
import { SKILL_LEVEL, VENUE_CANCELLATION_REASON } from '@/lib/config/constants';

export const createOpenGameSchema = z.object({
  facilityId: z.uuid(),
  startAt: z.coerce.date(),
  durationMinutes: z.int().positive(),
  targetPlayers: z.int().min(2).max(50),
  minPlayers: z.int().min(2).max(50),
  pricePerPlayerMinor: z.int().positive(),
  joinCutoffAt: z.coerce.date(),
  autoConfirmIfMinMet: z.boolean().default(false),
});
export type CreateOpenGameInput = z.infer<typeof createOpenGameSchema>;

const positionSchema = z.string().trim().min(1).max(60);

export const joinOpenGameSchema = z.object({
  position: positionSchema.optional(),
  skillLevel: z.enum(SKILL_LEVEL).optional(),
});
export type JoinOpenGameInput = z.infer<typeof joinOpenGameSchema>;

export const cancelOpenGameSchema = z.object({
  reason: z.enum(VENUE_CANCELLATION_REASON),
});
export type CancelOpenGameInput = z.infer<typeof cancelOpenGameSchema>;
