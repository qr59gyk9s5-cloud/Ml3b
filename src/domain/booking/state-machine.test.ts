import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS, type BookingStatus } from '@/lib/config/constants';
import type { BookingAuthzContext } from '@/domain/authz/booking';
import {
  canTransitionBooking,
  findBookingTransitionRule,
  isTerminalBookingStatus,
} from './state-machine';

function ctx(overrides: Partial<BookingAuthzContext> = {}): BookingAuthzContext {
  return {
    isOwningCustomer: false,
    venueRole: null,
    isPlatformAdmin: false,
    isSystem: false,
    isSuspended: false,
    ...overrides,
  };
}

const customer = ctx({ isOwningCustomer: true });
const receptionist = ctx({ venueRole: 'RECEPTIONIST' });
const owner = ctx({ venueRole: 'OWNER' });
const system = ctx({ isSystem: true });
const admin = ctx({ isPlatformAdmin: true });
const stranger = ctx();

describe('booking state machine', () => {
  it('every terminal status has no outgoing transitions for a non-admin actor', () => {
    const terminal: BookingStatus[] = [
      'REJECTED',
      'EXPIRED',
      'CANCELLED_BY_CUSTOMER',
      'CANCELLED_BY_VENUE',
      'COMPLETED',
      'NO_SHOW',
    ];
    for (const from of terminal) {
      expect(isTerminalBookingStatus(from)).toBe(true);
      for (const to of BOOKING_STATUS) {
        // A rule may exist (the admin override edges below), but never
        // one any non-admin actor — owner, receptionist, customer,
        // system — can use.
        expect(canTransitionBooking(owner, from, to)).toBe(false);
        expect(canTransitionBooking(receptionist, from, to)).toBe(false);
        expect(canTransitionBooking(customer, from, to)).toBe(false);
        expect(canTransitionBooking(system, from, to)).toBe(false);
        expect(canTransitionBooking(stranger, from, to)).toBe(false);
      }
    }
  });

  it('REQUESTED and CONFIRMED are not terminal', () => {
    expect(isTerminalBookingStatus('REQUESTED')).toBe(false);
    expect(isTerminalBookingStatus('CONFIRMED')).toBe(false);
  });

  describe('REQUESTED -> CONFIRMED', () => {
    it('venue staff (any role) may confirm; the customer, a stranger, and the system may not', () => {
      expect(canTransitionBooking(receptionist, 'REQUESTED', 'CONFIRMED')).toBe(true);
      expect(canTransitionBooking(owner, 'REQUESTED', 'CONFIRMED')).toBe(true);
      expect(canTransitionBooking(customer, 'REQUESTED', 'CONFIRMED')).toBe(false);
      expect(canTransitionBooking(stranger, 'REQUESTED', 'CONFIRMED')).toBe(false);
      expect(canTransitionBooking(system, 'REQUESTED', 'CONFIRMED')).toBe(false);
    });

    it('an admin may confirm on the venue’s behalf', () => {
      expect(canTransitionBooking(admin, 'REQUESTED', 'CONFIRMED')).toBe(true);
    });
  });

  describe('REQUESTED -> REJECTED', () => {
    it('venue staff may reject; the customer may not', () => {
      expect(canTransitionBooking(receptionist, 'REQUESTED', 'REJECTED')).toBe(true);
      expect(canTransitionBooking(customer, 'REQUESTED', 'REJECTED')).toBe(false);
    });
  });

  describe('REQUESTED -> EXPIRED', () => {
    it('only the system may expire a request — not even the venue or the customer', () => {
      expect(canTransitionBooking(system, 'REQUESTED', 'EXPIRED')).toBe(true);
      expect(canTransitionBooking(receptionist, 'REQUESTED', 'EXPIRED')).toBe(false);
      expect(canTransitionBooking(customer, 'REQUESTED', 'EXPIRED')).toBe(false);
    });
  });

  describe('customer cancellation', () => {
    it('the owning customer may cancel from REQUESTED or CONFIRMED', () => {
      expect(canTransitionBooking(customer, 'REQUESTED', 'CANCELLED_BY_CUSTOMER')).toBe(true);
      expect(canTransitionBooking(customer, 'CONFIRMED', 'CANCELLED_BY_CUSTOMER')).toBe(true);
    });

    it('venue staff may not cancel on the customer’s behalf via this transition', () => {
      expect(canTransitionBooking(receptionist, 'CONFIRMED', 'CANCELLED_BY_CUSTOMER')).toBe(false);
    });
  });

  describe('CONFIRMED -> CANCELLED_BY_VENUE', () => {
    it('venue staff may cancel; the customer may not use this transition', () => {
      expect(canTransitionBooking(receptionist, 'CONFIRMED', 'CANCELLED_BY_VENUE')).toBe(true);
      expect(canTransitionBooking(customer, 'CONFIRMED', 'CANCELLED_BY_VENUE')).toBe(false);
    });
  });

  describe('CONFIRMED -> COMPLETED', () => {
    it('venue staff or the system may complete a booking; the customer may not', () => {
      expect(canTransitionBooking(receptionist, 'CONFIRMED', 'COMPLETED')).toBe(true);
      expect(canTransitionBooking(system, 'CONFIRMED', 'COMPLETED')).toBe(true);
      expect(canTransitionBooking(customer, 'CONFIRMED', 'COMPLETED')).toBe(false);
    });
  });

  describe('CONFIRMED -> NO_SHOW', () => {
    it('only venue staff may mark a no-show — not the system, not the customer', () => {
      expect(canTransitionBooking(receptionist, 'CONFIRMED', 'NO_SHOW')).toBe(true);
      expect(canTransitionBooking(system, 'CONFIRMED', 'NO_SHOW')).toBe(false);
      expect(canTransitionBooking(customer, 'CONFIRMED', 'NO_SHOW')).toBe(false);
    });
  });

  it('rejects a transition with no rule at all (e.g. REQUESTED straight to COMPLETED)', () => {
    expect(findBookingTransitionRule('REQUESTED', 'COMPLETED')).toBeUndefined();
    expect(canTransitionBooking(admin, 'REQUESTED', 'COMPLETED')).toBe(false);
  });

  describe('admin override edges (Phase 11)', () => {
    it('an admin may reopen EXPIRED, REJECTED, or either cancellation back to REQUESTED', () => {
      for (const from of [
        'EXPIRED',
        'REJECTED',
        'CANCELLED_BY_CUSTOMER',
        'CANCELLED_BY_VENUE',
      ] as const) {
        expect(canTransitionBooking(admin, from, 'REQUESTED')).toBe(true);
      }
    });

    it('an admin may correct a mis-marked completion/no-show either direction', () => {
      expect(canTransitionBooking(admin, 'NO_SHOW', 'COMPLETED')).toBe(true);
      expect(canTransitionBooking(admin, 'COMPLETED', 'NO_SHOW')).toBe(true);
    });

    it('no non-admin actor — including venue staff and the system — gets an override edge', () => {
      expect(canTransitionBooking(owner, 'EXPIRED', 'REQUESTED')).toBe(false);
      expect(canTransitionBooking(receptionist, 'REJECTED', 'REQUESTED')).toBe(false);
      expect(canTransitionBooking(system, 'CANCELLED_BY_CUSTOMER', 'REQUESTED')).toBe(false);
      expect(canTransitionBooking(customer, 'CANCELLED_BY_VENUE', 'REQUESTED')).toBe(false);
    });

    it('CONFIRMED still has no override edge — only genuinely terminal statuses do', () => {
      expect(findBookingTransitionRule('CONFIRMED', 'REQUESTED')).toBeUndefined();
    });
  });
});
