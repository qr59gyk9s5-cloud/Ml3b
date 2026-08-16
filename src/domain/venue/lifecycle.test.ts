import { describe, expect, it } from 'vitest';
import { canTransitionVenue, findVenueTransitionRule } from './lifecycle';
import { VENUE_STATUS, type VenueStatus } from '@/lib/config/constants';
import type { VenueAuthzContext } from '@/domain/authz/venue';

function ctx(overrides: Partial<VenueAuthzContext> = {}): VenueAuthzContext {
  return { userId: 'user-1', isPlatformAdmin: false, venueRole: null, ...overrides };
}

const owner = ctx({ venueRole: 'OWNER' });
const manager = ctx({ venueRole: 'MANAGER' });
const receptionist = ctx({ venueRole: 'RECEPTIONIST' });
const admin = ctx({ isPlatformAdmin: true });
const stranger = ctx();

describe('venue lifecycle transitions', () => {
  it('ARCHIVED is terminal — no transition leaves it', () => {
    for (const to of VENUE_STATUS) {
      expect(findVenueTransitionRule('ARCHIVED', to)).toBeUndefined();
    }
  });

  it('DRAFT -> PENDING_REVIEW is allowed for owner/manager, not receptionist or a stranger', () => {
    expect(canTransitionVenue(owner, 'DRAFT', 'PENDING_REVIEW')).toBe(true);
    expect(canTransitionVenue(manager, 'DRAFT', 'PENDING_REVIEW')).toBe(true);
    expect(canTransitionVenue(receptionist, 'DRAFT', 'PENDING_REVIEW')).toBe(false);
    expect(canTransitionVenue(stranger, 'DRAFT', 'PENDING_REVIEW')).toBe(false);
  });

  it('only an admin can approve PENDING_REVIEW -> ACTIVE — not even the owner', () => {
    expect(canTransitionVenue(admin, 'PENDING_REVIEW', 'ACTIVE')).toBe(true);
    expect(canTransitionVenue(owner, 'PENDING_REVIEW', 'ACTIVE')).toBe(false);
    expect(canTransitionVenue(manager, 'PENDING_REVIEW', 'ACTIVE')).toBe(false);
  });

  it('only an admin can suspend or reinstate an ACTIVE venue', () => {
    expect(canTransitionVenue(admin, 'ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionVenue(owner, 'ACTIVE', 'SUSPENDED')).toBe(false);
    expect(canTransitionVenue(admin, 'SUSPENDED', 'ACTIVE')).toBe(true);
    expect(canTransitionVenue(owner, 'SUSPENDED', 'ACTIVE')).toBe(false);
  });

  it('a SUSPENDED venue can only be archived by an admin, not the owner', () => {
    expect(canTransitionVenue(admin, 'SUSPENDED', 'ARCHIVED')).toBe(true);
    expect(canTransitionVenue(owner, 'SUSPENDED', 'ARCHIVED')).toBe(false);
  });

  it('the owner can archive their own DRAFT, PENDING_REVIEW, or ACTIVE venue', () => {
    for (const from of ['DRAFT', 'PENDING_REVIEW', 'ACTIVE'] as VenueStatus[]) {
      expect(canTransitionVenue(owner, from, 'ARCHIVED')).toBe(true);
      expect(canTransitionVenue(manager, from, 'ARCHIVED')).toBe(false);
    }
  });

  it('there is no rule for nonsensical jumps, e.g. DRAFT straight to ACTIVE', () => {
    expect(findVenueTransitionRule('DRAFT', 'ACTIVE')).toBeUndefined();
    expect(canTransitionVenue(admin, 'DRAFT', 'ACTIVE')).toBe(false);
  });

  it('a platform admin can always withdraw a PENDING_REVIEW venue back to DRAFT', () => {
    expect(canTransitionVenue(admin, 'PENDING_REVIEW', 'DRAFT')).toBe(true);
    expect(canTransitionVenue(owner, 'PENDING_REVIEW', 'DRAFT')).toBe(true);
    expect(canTransitionVenue(receptionist, 'PENDING_REVIEW', 'DRAFT')).toBe(false);
  });
});
