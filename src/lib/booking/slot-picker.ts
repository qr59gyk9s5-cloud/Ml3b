/**
 * Shared, pure slot-picker math for both booking UIs (the customer flow
 * at src/app/venues/[slug]/book and the staff walk-in flow at
 * src/app/dashboard/[venueId]/manual) — kept in one place so the two
 * pickers can't quietly drift into disagreeing about what a valid
 * duration or a valid start time is. This is display logic only; the
 * real validation is still createBookingRequest()/createManualBooking()
 * server-side regardless of what this computes.
 */
import type { AvailabilitySlot } from '@/domain/availability/compute-slots';
import type { Facility } from '@/lib/db/schema';

/** Every duration a facility allows, as whole multiples of its slot
 * length between minimumDurationMinutes and maximumDurationMinutes. */
export function computeDurationOptions(
  facility: Pick<
    Facility,
    'slotDurationMinutes' | 'minimumDurationMinutes' | 'maximumDurationMinutes'
  >,
): number[] {
  const options: number[] = [];
  for (
    let d = facility.minimumDurationMinutes;
    d <= facility.maximumDurationMinutes;
    d += facility.slotDurationMinutes
  ) {
    options.push(d);
  }
  return options;
}

/** Indexes into `slots` where a contiguous, fully-available run of
 * `slotsNeeded` slots starts. Slots are generated in chronological,
 * fixed-duration order (compute-slots.ts), so adjacent array indices are
 * adjacent in time — no separate time-continuity check needed. */
export function computeValidStartIndexes(slots: AvailabilitySlot[], slotsNeeded: number): number[] {
  const validStarts: number[] = [];
  for (let i = 0; i + slotsNeeded <= slots.length; i++) {
    let allAvailable = true;
    for (let k = 0; k < slotsNeeded; k++) {
      if (!slots[i + k].available) {
        allAvailable = false;
        break;
      }
    }
    if (allAvailable) validStarts.push(i);
  }
  return validStarts;
}

export function formatSlotTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(date);
}

/** date is a plain 'YYYY-MM-DD' local calendar date — parsed at noon UTC
 * purely so Intl picks the right weekday, never as a real instant. */
export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Same 'YYYY-MM-DD' parsing as formatDateLabel, split into weekday +
 * day-of-month for a two-line calendar chip instead of one compact
 * string — the customer booking page's clearer date picker. */
export function formatDayChip(date: string): { weekday: string; day: string } {
  const [y, m, d] = date.split('-').map(Number);
  const instant = new Date(Date.UTC(y, m - 1, d, 12));
  return {
    weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(instant),
    day: new Intl.DateTimeFormat('en-GB', { day: 'numeric' }).format(instant),
  };
}

/** "August 2026" — the calendar strip's month/year header. */
export function formatMonthYear(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}
