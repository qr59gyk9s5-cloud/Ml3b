import { describe, expect, it } from 'vitest';
import {
  isBookingOwner,
  isPlatformAdminCtx,
  isSystemActor,
  isVenueStaffForBooking,
  type BookingAuthzContext,
} from './booking';

function ctx(overrides: Partial<BookingAuthzContext> = {}): BookingAuthzContext {
  return {
    isOwningCustomer: false,
    venueRole: null,
    isPlatformAdmin: false,
    isSystem: false,
    ...overrides,
  };
}

describe('booking authz', () => {
  it('a stranger owns nothing, is not staff, is not system, is not admin', () => {
    const c = ctx();
    expect(isBookingOwner(c)).toBe(false);
    expect(isVenueStaffForBooking(c)).toBe(false);
    expect(isSystemActor(c)).toBe(false);
    expect(isPlatformAdminCtx(c)).toBe(false);
  });

  it('the owning customer passes isBookingOwner but not staff checks', () => {
    const c = ctx({ isOwningCustomer: true });
    expect(isBookingOwner(c)).toBe(true);
    expect(isVenueStaffForBooking(c)).toBe(false);
  });

  it('any venue role (including RECEPTIONIST) counts as staff for the booking', () => {
    const c = ctx({ venueRole: 'RECEPTIONIST' });
    expect(isVenueStaffForBooking(c)).toBe(true);
    expect(isBookingOwner(c)).toBe(false);
  });

  it('the system actor passes isSystemActor only', () => {
    const c = ctx({ isSystem: true });
    expect(isSystemActor(c)).toBe(true);
    expect(isBookingOwner(c)).toBe(false);
    expect(isVenueStaffForBooking(c)).toBe(false);
  });

  it('a platform admin passes every check', () => {
    const c = ctx({ isPlatformAdmin: true });
    expect(isBookingOwner(c)).toBe(true);
    expect(isVenueStaffForBooking(c)).toBe(true);
    expect(isSystemActor(c)).toBe(true);
    expect(isPlatformAdminCtx(c)).toBe(true);
  });
});
