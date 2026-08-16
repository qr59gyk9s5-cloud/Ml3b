import { z } from 'zod';
import { AVAILABILITY_EXCEPTION_KIND } from '@/lib/config/constants';

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export const createAvailabilityRuleSchema = z
  .object({
    dayOfWeek: z.int().min(0).max(6),
    startTime: z.string().regex(timePattern, 'Expected HH:mm or HH:mm:ss.'),
    endTime: z.string().regex(timePattern, 'Expected HH:mm or HH:mm:ss.'),
    isClosed: z.boolean().default(false),
  })
  .refine((v) => v.isClosed || v.startTime !== v.endTime, {
    message: 'startTime and endTime cannot be equal for an open rule — use isClosed for a day off.',
    path: ['endTime'],
  });
export type CreateAvailabilityRuleInput = z.infer<typeof createAvailabilityRuleSchema>;

export const createAvailabilityExceptionSchema = z
  .object({
    kind: z.enum(AVAILABILITY_EXCEPTION_KIND),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    isClosed: z.boolean().default(true),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.startsAt.getTime() < v.endsAt.getTime(), {
    message: 'startsAt must be before endsAt.',
    path: ['endsAt'],
  });
export type CreateAvailabilityExceptionInput = z.infer<typeof createAvailabilityExceptionSchema>;
