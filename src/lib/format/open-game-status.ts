/**
 * Same discipline as src/lib/format/booking-status.ts — internal enum
 * names are never shown to players/organizers verbatim.
 */
import type { OpenGameStatus } from '@/lib/config/constants';
import type { StatusTone } from './booking-status';

export const OPEN_GAME_STATUS_LABEL: Record<OpenGameStatus, string> = {
  AWAITING_VENUE: 'Waiting for venue',
  FILLING: 'Filling up',
  MINIMUM_REACHED: 'Minimum reached',
  CONFIRMED: 'Confirmed',
  VENUE_REJECTED: 'Venue declined',
  FAILED_TO_FILL: "Didn't fill in time",
  ORGANIZER_CANCELLED: 'Cancelled by organizer',
  VENUE_CANCELLED: 'Cancelled by venue',
};

export const OPEN_GAME_STATUS_TONE: Record<OpenGameStatus, StatusTone> = {
  AWAITING_VENUE: 'pending',
  FILLING: 'pending',
  MINIMUM_REACHED: 'positive',
  CONFIRMED: 'positive',
  VENUE_REJECTED: 'negative',
  FAILED_TO_FILL: 'negative',
  ORGANIZER_CANCELLED: 'neutral',
  VENUE_CANCELLED: 'negative',
};
