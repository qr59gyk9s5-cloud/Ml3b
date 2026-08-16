/**
 * Shared Zod schemas for facility input — the same schema validates on
 * the server (source of truth) and can back client-side form validation
 * later. Never trust that the client enforced these.
 */
import { z } from 'zod';
import { BOOKING_MODE } from '@/lib/config/constants';

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const facilityBaseSchema = z.object({
  sportId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugPattern, 'Use lowercase letters, numbers, and hyphens only.'),
  description: z.string().trim().max(2000).optional(),
  capacity: z.int().positive().optional(),
  bookingMode: z.enum(BOOKING_MODE).default('REQUEST_TO_BOOK'),
  slotDurationMinutes: z.int().positive().default(60),
  minimumDurationMinutes: z.int().positive().default(60),
  maximumDurationMinutes: z.int().positive().default(120),
  basePriceMinor: z.int().nonnegative(),
  currency: z.string().length(3).default('EGP'),
});

function checkDurations(v: { minimumDurationMinutes: number; maximumDurationMinutes: number }) {
  return v.minimumDurationMinutes <= v.maximumDurationMinutes;
}

export const createFacilitySchema = facilityBaseSchema.refine(checkDurations, {
  message: 'minimumDurationMinutes cannot exceed maximumDurationMinutes.',
  path: ['minimumDurationMinutes'],
});
export type CreateFacilityInput = z.infer<typeof createFacilitySchema>;

export const updateFacilitySchema = facilityBaseSchema.partial();
export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>;
