import { describe, expect, it } from 'vitest';
import { FawryPaymentProvider } from './fawry-provider';

// FawryPaymentProvider is an intentional stub (see the file's doc
// comment and docs/architecture/payments.md) — every method must throw a
// clear error rather than fabricate a successful response, since there's
// no real Fawry integration to call yet.
describe('FawryPaymentProvider (stub)', () => {
  const provider = new FawryPaymentProvider('merchant-code', 'security-key');

  it('authorize throws, does not fake success', async () => {
    await expect(
      provider.authorize({
        bookingId: 'booking-1',
        amountMinor: 1000,
        currency: 'EGP',
        customerName: 'Test Customer',
        customerPhone: '+201000000000',
      }),
    ).rejects.toThrow(/not implemented/i);
  });

  it('capture throws', async () => {
    await expect(provider.capture('ref-1')).rejects.toThrow(/not implemented/i);
  });

  it('release throws', async () => {
    await expect(provider.release('ref-1')).rejects.toThrow(/not implemented/i);
  });

  it('refund throws', async () => {
    await expect(provider.refund('ref-1', 500)).rejects.toThrow(/not implemented/i);
  });
});
