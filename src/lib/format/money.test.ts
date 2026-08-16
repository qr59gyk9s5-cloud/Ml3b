import { describe, expect, it } from 'vitest';
import { formatPriceMinor } from './money';

describe('formatPriceMinor', () => {
  it('formats a whole amount without decimals', () => {
    expect(formatPriceMinor(50000, 'EGP')).toBe('500 EGP');
  });

  it('formats a fractional amount to two decimal places', () => {
    expect(formatPriceMinor(12345, 'EGP')).toBe('123.45 EGP');
  });

  it('formats zero correctly', () => {
    expect(formatPriceMinor(0, 'EGP')).toBe('0 EGP');
  });
});
