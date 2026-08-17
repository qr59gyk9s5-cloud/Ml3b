/**
 * Real Fawry integration — INTENTIONALLY NOT IMPLEMENTED YET.
 *
 * ADR-007 records the founder's explicit choice of Fawry as the payment
 * provider. But Fawry's merchant onboarding is a signed-agreement
 * process, not self-serve signup — there is no sandbox credential yet to
 * build and test a real integration against. Fawry's exact current API
 * shape (endpoint URLs, signature/hash scheme, whether a true
 * authorize-then-capture split is even exposed vs. a single charge API)
 * is not something to fabricate from memory for a system that moves real
 * money. CLAUDE.md is explicit: never trust the client, money
 * correctness outranks feature velocity, and refund execution requires
 * explicit human approval before it's ever enabled.
 *
 * So every method below throws a clear, honest "not implemented" error
 * instead of faking a success response. src/domain/payments/service.ts
 * never even reaches these methods today — it gates every call behind
 * isPaymentProviderConfigured() (see ./index.ts), which is false until
 * FAWRY_MERCHANT_CODE and FAWRY_SECURITY_KEY are actually set. That keeps
 * the (real, tested) booking engine working exactly as before with
 * payments fully wired in but dormant.
 *
 * See docs/architecture/payments.md for what's real vs. stubbed here and
 * what's needed to finish this file.
 */
import type { AuthorizePaymentParams, AuthorizePaymentResult, PaymentProvider } from './provider';

const NOT_IMPLEMENTED =
  'Fawry integration is not implemented yet — needs a signed Fawry merchant ' +
  'agreement, real sandbox credentials, and current Fawry API documentation. ' +
  'See docs/architecture/payments.md.';

export class FawryPaymentProvider implements PaymentProvider {
  constructor(
    private readonly merchantCode: string,
    private readonly securityKey: string,
  ) {
    void this.merchantCode;
    void this.securityKey;
  }

  async authorize(_params: AuthorizePaymentParams): Promise<AuthorizePaymentResult> {
    throw new Error(`FawryPaymentProvider.authorize: ${NOT_IMPLEMENTED}`);
  }

  async capture(_providerRef: string): Promise<void> {
    throw new Error(`FawryPaymentProvider.capture: ${NOT_IMPLEMENTED}`);
  }

  async release(_providerRef: string): Promise<void> {
    throw new Error(`FawryPaymentProvider.release: ${NOT_IMPLEMENTED}`);
  }

  async refund(_providerRef: string, _amountMinor: number): Promise<void> {
    throw new Error(`FawryPaymentProvider.refund: ${NOT_IMPLEMENTED}`);
  }
}
