/**
 * Booking domain services never talk to a payment gateway SDK directly
 * (same pattern as src/lib/notifications/provider.ts) — only this
 * interface. Swapping/adding a provider never touches
 * src/domain/payments or the booking transition service.
 *
 * Mirrors ADR-007's authorize-then-capture flow:
 *   authorize — place a hold for the full amount when a booking is requested
 *   capture   — actually charge the held amount when the venue confirms
 *   release   — drop the hold, charge nothing, on reject/expire
 *   refund    — return part of a captured amount on a customer cancellation
 */
export interface AuthorizePaymentParams {
  bookingId: string;
  amountMinor: number;
  currency: string;
  /** Nullable — bookings.customer_name/phone are optional (e.g. a manual
   * walk-in booking created by venue staff may not have them). */
  customerName: string | null;
  customerPhone: string | null;
}

export interface AuthorizePaymentResult {
  /** Provider's own transaction/reference id — stored on payments.provider_ref
   * for reconciliation and passed back into capture/release/refund. */
  providerRef: string;
}

export interface PaymentProvider {
  authorize(params: AuthorizePaymentParams): Promise<AuthorizePaymentResult>;
  capture(providerRef: string): Promise<void>;
  release(providerRef: string): Promise<void>;
  refund(providerRef: string, amountMinor: number): Promise<void>;
}
