import { describe, expect, it } from 'vitest';
import { computeBookingPricing } from './pricing';
import { DEFAULT_COMMISSION_MINOR } from '@/lib/config/constants';

describe('computeBookingPricing', () => {
  it('prices a 60-minute booking at the full hourly rate', () => {
    const pricing = computeBookingPricing(50000, 60);
    expect(pricing.subtotalMinor).toBe(50000);
    expect(pricing.totalMinor).toBe(50000);
  });

  it('prices a 90-minute booking proportionally', () => {
    const pricing = computeBookingPricing(40000, 90);
    expect(pricing.subtotalMinor).toBe(60000);
  });

  it('prices a 120-minute (2-slot) booking at double the hourly rate', () => {
    const pricing = computeBookingPricing(50000, 120);
    expect(pricing.subtotalMinor).toBe(100000);
  });

  it('total always equals subtotal — the platform fee is not added on top', () => {
    const pricing = computeBookingPricing(50000, 60);
    expect(pricing.totalMinor).toBe(pricing.subtotalMinor);
  });

  it('records the flat platform commission', () => {
    const pricing = computeBookingPricing(50000, 60);
    expect(pricing.platformFeeMinor).toBe(DEFAULT_COMMISSION_MINOR);
  });

  it('rejects a non-positive duration', () => {
    expect(() => computeBookingPricing(50000, 0)).toThrow();
    expect(() => computeBookingPricing(50000, -60)).toThrow();
  });

  it('rejects a negative price', () => {
    expect(() => computeBookingPricing(-1, 60)).toThrow();
  });
});
