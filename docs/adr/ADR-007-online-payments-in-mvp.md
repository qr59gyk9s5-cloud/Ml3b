# ADR-007: Online Payments Pulled Into MVP Scope

**Date:** 2026-08-16
**Status:** Accepted

## Context

The founder spec's default guidance was "integrated payments are NOT MVP
priority" — customers pay venues directly, platform commission tracked
manually. During Phase 0 the founder specified a cancellation policy that
only makes sense if the platform is actually holding the customer's money:
booking takes the full amount, cancelling a confirmed booking refunds 50%
and forfeits 50%. That policy cannot be enforced or collected if payment
happens offline between customer and venue.

This is flagged explicitly, per the founder spec's own rule that payment
architecture must never be locked in silently.

## Decision

Online payment moves into MVP scope, using an **authorize-then-capture**
flow:

1. Customer requests a booking → payment **authorized** (held, not
   charged).
2. Venue **confirms** → hold is **captured** (customer is actually
   charged the total).
3. Venue **rejects** or the request **expires** → hold released, customer
   charged nothing.
4. Customer cancels a **confirmed** booking outside the 2-hour cutoff →
   50% refunded, 50% forfeited (split between venue payout and platform
   commission).
5. Cancellation inside the 2-hour cutoff is blocked entirely.
6. Platform commission is deducted automatically from the captured amount
   before the venue's payout is recorded — replacing manual commission
   tracking.

Provider (Paymob vs. Fawry, or both) is not yet selected — decided when
this phase is actually implemented, informed by Egyptian market
integration maturity and fee structure at that time.

## Alternatives considered

- **Keep payments fully out of MVP, enforce cancellation policy as an
  unenforced written policy only** — rejected: the founder's answer was
  specific about actually taking payment and applying a real penalty, not
  a policy the venue has to chase manually.
- **Charge the full amount immediately at request time, before venue
  confirmation** — rejected: would charge customers for requests venues
  go on to reject, a bad experience and a refund-volume problem. Hold+
  capture avoids this while still guaranteeing funds exist by
  confirmation time.

## Advantages

Cancellation policy is actually enforceable and collectible. Commission
collection stops being a manual, error-prone step. Matches what the
founder explicitly asked for rather than a weaker approximation.

## Disadvantages

Materially larger MVP scope than the original "payments later" plan:
payment gateway integration, webhook handling, refund flows, and a
`payments` table (see `docs/architecture/database.md`) are now on the
critical path rather than deferred. Adds a genuine security/compliance
surface (§69 of the founder spec: webhook verification, idempotent
processing, never trusting a frontend-reported payment status, integer
minor units, reconciliation).

## Consequences

The booking transition service (`src/domain/booking`) must call out to a
payment side effect on `CONFIRMED` (capture), `REJECTED`/`EXPIRED`
(release), and cancellation (partial refund) — documented in
`docs/product/booking-flow.md`. Payment provider selection and the exact
`payments`/webhook implementation happen in their own dedicated phase
(scheduled alongside/after the booking engine, before the MVP is
considered launch-ready), not silently squeezed into Phase 5.
