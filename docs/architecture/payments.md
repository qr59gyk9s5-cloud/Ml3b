# Payments

Provider-abstracted authorize-then-capture, per ADR-007. Booking domain
services never talk to a payment gateway SDK directly — only the
`PaymentProvider` interface in `src/lib/payments`, same pattern as
`NotificationProvider` in `src/lib/notifications`.

**Implementation status (Phase 10): schema, interface, domain wiring, and
RLS are real. The Fawry provider itself is an intentional stub.**

## What's real

- `payments` table (`src/lib/db/schema/payments.ts`,
  `supabase/migrations/0010_payments_domain.sql`) — matches
  `docs/architecture/database.md`'s design exactly.
- RLS (`supabase/migrations/0011_payments_rls.sql`) — a payment row is
  visible to the booking's customer, staff at its venue, or a platform
  admin. No insert/update/delete policy: payment rows are written only by
  `src/domain/payments/service.ts`, running on the privileged app
  connection (which bypasses RLS entirely), reacting to an actual
  provider call — never directly by a client. A client-reported payment
  status is never trusted (CLAUDE.md).
- `PaymentProvider` interface (`src/lib/payments/provider.ts`):
  `authorize`, `capture`, `release`, `refund`.
- Domain service (`src/domain/payments/service.ts`):
  `authorizePaymentForBooking`, `captureBookingPayment`,
  `releaseBookingPayment`, `refundBookingCancellationPayment` — wired
  into the booking engine exactly per ADR-007:
  - `src/domain/booking/create-request.ts` calls `authorizePaymentForBooking`
    right after a booking is created.
  - `src/domain/booking/transition.ts` calls `captureBookingPayment` on
    `CONFIRMED`, `releaseBookingPayment` on `REJECTED`/`EXPIRED`, and
    `refundBookingCancellationPayment` when a customer cancels a
    previously-`CONFIRMED` booking outside the cutoff (the 50%
    `CANCELLATION_REFUND_RATE`).
- Every one of those calls is **best-effort and non-blocking** — it can
  never throw back into the booking transition/creation that triggered
  it. This is deliberate and mirrors the notifications outbox pattern
  (`docs/architecture/notifications.md`): CLAUDE.md's priority order puts
  booking correctness above any side effect hung off it, and payments
  being unwired must never be able to break the tested, database-enforced
  booking engine.

## What's stubbed, and why

`FawryPaymentProvider` (`src/lib/payments/fawry-provider.ts`) throws a
clear "not implemented" error from every method instead of calling a real
Fawry endpoint. This is intentional, not an oversight:

- Fawry's merchant onboarding is a signed-agreement process, not
  self-serve — there is no sandbox credential yet to build or test a real
  integration against.
- Fawry's exact current API shape (endpoint URLs, signature/hash scheme,
  and whether a true authorize-then-capture split is even exposed as two
  separate calls vs. one) is not something to fabricate from memory for a
  system that moves real money. Guessing wrong here would be a silent
  correctness/trust failure, which CLAUDE.md ranks above shipping
  velocity.

`isPaymentProviderConfigured()` (`src/lib/payments/index.ts`) is `false`
until both `FAWRY_MERCHANT_CODE` and `FAWRY_SECURITY_KEY` are set (they
aren't, anywhere, today). Every domain-service function checks it first
and no-ops — logged, never thrown — when it's false. So right now, in
practice: every booking's `authorizePaymentForBooking` call logs and
returns immediately, no `payments` row is ever written, and the booking
engine behaves exactly as it did before Phase 10.

## Known gap, flagged not silently decided

Because the provider is a stub, this hasn't been exercised against a real
failure yet: **what should happen if a real `authorize` call fails when a
customer requests a booking?** Today, an authorize failure is caught,
logged, recorded as a `FAILED` payments row, and the booking request
still succeeds — consistent with "never block the transition." Once a
real provider is live, that may be the wrong call (a `CONFIRMED` booking
with no successful hold behind it needs manual reconciliation). This is a
real product decision, not a technical one, and it's called out here
rather than picked silently — revisit before Fawry actually goes live.

## What's needed to finish this

1. A signed Fawry merchant agreement and sandbox credentials.
2. Current Fawry API documentation (hosted checkout vs. server-to-server,
   exact authorize/capture semantics, webhook signature verification).
3. Implement `FawryPaymentProvider`'s four methods for real, with webhook
   handling for asynchronous status updates (idempotent — a webhook must
   never apply twice) and reconciliation against `provider_ref`.
4. Decide the authorize-failure question above.
5. **Refund execution requires explicit human approval before it's ever
   enabled** — CLAUDE.md's forbidden-without-approval list includes
   "executing refunds." `refundBookingCancellationPayment` is wired and
   ready but should not be pointed at a live, un-reviewed
   `FawryPaymentProvider.refund` without that sign-off.

## Flow (ADR-007)

```
Booking requested            → authorize (hold placed, nothing charged)
Venue confirms                → capture  (customer actually charged)
Venue rejects / request expires → release (hold dropped, nothing charged)
Customer cancels a CONFIRMED
  booking outside the cutoff  → refund 50% of the captured amount
```

## Money

Always integer minor units (`amount_minor`, `refund_amount_minor` —
piastres for EGP), never floats. Currency defaults to `EGP`, taken from
the booking it belongs to.
