import { z } from 'zod';
import { VENUE_ROLE } from '@/lib/config/constants';

export const addVenueStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  role: z.enum(VENUE_ROLE),
});
export type AddVenueStaffInput = z.infer<typeof addVenueStaffSchema>;
