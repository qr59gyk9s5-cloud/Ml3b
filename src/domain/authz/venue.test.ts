import { describe, expect, it } from 'vitest';
import {
  canManageVenueStaff,
  canRemoveVenueMember,
  isVenueOwner,
  isVenueOwnerOrManager,
  isVenueStaff,
  type VenueAuthzContext,
} from './venue';

function ctx(overrides: Partial<VenueAuthzContext> = {}): VenueAuthzContext {
  return { userId: 'user-1', isPlatformAdmin: false, venueRole: null, ...overrides };
}

describe('venue authz', () => {
  it('an unrelated user has no venue role and no staff/owner permissions', () => {
    const c = ctx();
    expect(isVenueStaff(c)).toBe(false);
    expect(isVenueOwnerOrManager(c)).toBe(false);
    expect(isVenueOwner(c)).toBe(false);
  });

  it('a role at a different venue must not leak in — venueRole is per-venue by construction', () => {
    // The caller is responsible for resolving venueRole for *this* venue;
    // this test documents that null (not a member here) behaves like "no
    // role", not like "trust any role the user has anywhere."
    const c = ctx({ venueRole: null });
    expect(isVenueStaff(c)).toBe(false);
  });

  it('RECEPTIONIST is staff but not owner/manager', () => {
    const c = ctx({ venueRole: 'RECEPTIONIST' });
    expect(isVenueStaff(c)).toBe(true);
    expect(isVenueOwnerOrManager(c)).toBe(false);
  });

  it('MANAGER counts as owner-or-manager but is not the owner', () => {
    const c = ctx({ venueRole: 'MANAGER' });
    expect(isVenueOwnerOrManager(c)).toBe(true);
    expect(isVenueOwner(c)).toBe(false);
  });

  it('OWNER passes every venue-staff check', () => {
    const c = ctx({ venueRole: 'OWNER' });
    expect(isVenueStaff(c)).toBe(true);
    expect(isVenueOwnerOrManager(c)).toBe(true);
    expect(isVenueOwner(c)).toBe(true);
  });

  it('a platform admin passes every check regardless of venue membership', () => {
    const c = ctx({ isPlatformAdmin: true, venueRole: null });
    expect(isVenueStaff(c)).toBe(true);
    expect(isVenueOwnerOrManager(c)).toBe(true);
    expect(isVenueOwner(c)).toBe(true);
  });

  describe('staff management', () => {
    it('only OWNER (or admin) can manage staff in general', () => {
      expect(canManageVenueStaff(ctx({ venueRole: 'OWNER' }))).toBe(true);
      expect(canManageVenueStaff(ctx({ isPlatformAdmin: true }))).toBe(true);
      expect(canManageVenueStaff(ctx({ venueRole: 'MANAGER' }))).toBe(false);
      expect(canManageVenueStaff(ctx({ venueRole: 'RECEPTIONIST' }))).toBe(false);
    });

    it('a MANAGER may remove a RECEPTIONIST but not another MANAGER or the OWNER', () => {
      const manager = ctx({ venueRole: 'MANAGER' });
      expect(canRemoveVenueMember(manager, 'RECEPTIONIST')).toBe(true);
      expect(canRemoveVenueMember(manager, 'MANAGER')).toBe(false);
      expect(canRemoveVenueMember(manager, 'OWNER')).toBe(false);
    });

    it('a RECEPTIONIST may not remove anyone', () => {
      const receptionist = ctx({ venueRole: 'RECEPTIONIST' });
      expect(canRemoveVenueMember(receptionist, 'RECEPTIONIST')).toBe(false);
    });

    it('the OWNER may remove any role, including another OWNER', () => {
      const owner = ctx({ venueRole: 'OWNER' });
      expect(canRemoveVenueMember(owner, 'MANAGER')).toBe(true);
      expect(canRemoveVenueMember(owner, 'OWNER')).toBe(true);
    });
  });
});
