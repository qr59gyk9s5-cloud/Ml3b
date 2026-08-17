import { env } from '@/lib/config/env';
import type { PaymentProvider } from './provider';
import { FawryPaymentProvider } from './fawry-provider';

export type { PaymentProvider, AuthorizePaymentParams, AuthorizePaymentResult } from './provider';

/**
 * True once real provider credentials exist. Every function in
 * src/domain/payments/service.ts checks this first and no-ops (logged,
 * never throws) when it's false — which is the case today, since
 * FawryPaymentProvider is an honest stub pending real merchant
 * credentials (see fawry-provider.ts). That keeps the booking engine's
 * behavior unchanged with payments fully wired in but dormant.
 */
export function isPaymentProviderConfigured(): boolean {
  return Boolean(env.FAWRY_MERCHANT_CODE && env.FAWRY_SECURITY_KEY);
}

/** Throws if called while unconfigured — callers must check
 * isPaymentProviderConfigured() first (src/domain/payments/service.ts does). */
export function getPaymentProvider(): PaymentProvider {
  if (env.FAWRY_MERCHANT_CODE && env.FAWRY_SECURITY_KEY) {
    return new FawryPaymentProvider(env.FAWRY_MERCHANT_CODE, env.FAWRY_SECURITY_KEY);
  }
  throw new Error('getPaymentProvider() called with no provider configured.');
}
