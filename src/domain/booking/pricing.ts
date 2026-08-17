/**
 * The price snapshot taken at request time — never recomputed from live
 * facility pricing later, so a historical booking doesn't silently change
 * if the venue updates its rates (§17.1 of the founder spec).
 *
 * `totalMinor` is what the customer is charged — it equals `subtotalMinor`.
 * `platformFeeMinor` is the flat commission (DEFAULT_COMMISSION_MINOR)
 * the platform is owed out of that amount when the venue is paid out —
 * informational here, not charged to the customer on top of the price.
 * Actual capture/payout execution is its own dedicated phase (ADR-007);
 * this module only computes the numbers.
 */
import { DEFAULT_COMMISSION_MINOR } from '@/lib/config/constants';

export interface BookingPricing {
  subtotalMinor: number;
  platformFeeMinor: number;
  totalMinor: number;
}

export function computeBookingPricing(
  basePriceMinorPerHour: number,
  durationMinutes: number,
): BookingPricing {
  if (!Number.isInteger(basePriceMinorPerHour) || basePriceMinorPerHour < 0) {
    throw new Error('basePriceMinorPerHour must be a non-negative integer.');
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error('durationMinutes must be a positive integer.');
  }
  const subtotalMinor = Math.round((basePriceMinorPerHour * durationMinutes) / 60);
  return {
    subtotalMinor,
    platformFeeMinor: DEFAULT_COMMISSION_MINOR,
    totalMinor: subtotalMinor,
  };
}
