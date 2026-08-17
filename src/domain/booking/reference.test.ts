import { describe, expect, it } from 'vitest';
import { generateBookingReference } from './reference';

describe('generateBookingReference', () => {
  it('matches the BK-XXXXXX format with no ambiguous characters', () => {
    const ref = generateBookingReference();
    expect(ref).toMatch(/^BK-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('is not obviously deterministic — many calls produce many distinct values', () => {
    const refs = new Set(Array.from({ length: 200 }, () => generateBookingReference()));
    // 200 draws from a 33^6 (~1.3 billion) space should never collide in practice.
    expect(refs.size).toBe(200);
  });
});
