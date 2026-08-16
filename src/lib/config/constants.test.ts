import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUS,
  CANCELLATION_CUTOFF_HOURS,
  CANCELLATION_REFUND_RATE,
  VENUE_CANCELLATION_REASON,
} from './constants';

describe('domain constants', () => {
  it('defines every booking status exactly once', () => {
    expect(new Set(BOOKING_STATUS).size).toBe(BOOKING_STATUS.length);
  });

  it('encodes the approved cancellation policy', () => {
    expect(CANCELLATION_CUTOFF_HOURS).toBe(2);
    expect(CANCELLATION_REFUND_RATE).toBe(0.5);
  });

  it('only allows template cancellation reasons (no free text)', () => {
    expect(VENUE_CANCELLATION_REASON).toContain('OTHER');
    expect(VENUE_CANCELLATION_REASON.length).toBeGreaterThan(1);
  });
});
