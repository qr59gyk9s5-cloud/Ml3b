# Booking Flow

**Implementation status (Phase 5):** the state machine, request creation,
confirm/reject/cancel/complete/no-show, manual (walk-in) bookings, and
request expiry are real, tested domain services in `src/domain/booking/`
— see `docs/architecture/booking-engine.md` for how. Payment
authorize/capture (the "Payment authorized" / "payment captured" steps
below) is documented here as the target flow but not yet implemented —
its own dedicated phase, ADR-007.

## Request-to-book (the MVP default for every facility)

```
Customer discovers venue → opens venue → chooses facility → chooses a slot
        ↓
Server validates: venue ACTIVE, facility ACTIVE, slot inside availability,
                   no blocking exception, within min/max duration
        ↓
Payment authorized (hold placed, not yet charged)
        ↓
Booking created: status=REQUESTED, source=MARKETPLACE (idempotent on retry)
        ↓
booking_events: BOOKING_REQUESTED · notification → venue staff
        ↓
Venue staff confirms or rejects
       ↙                          ↘
  CONFIRM                       REJECT
     ↓                             ↓
payment captured               hold released, no charge
status=CONFIRMED               status=REJECTED
     ↓                             ↓
notify customer                notify customer
```

A `REQUESTED` booking never guarantees the slot — only a `CONFIRMED` booking
does, enforced by a database exclusion constraint (see
`docs/architecture/database.md`).

## Slot model

Facilities use **fixed pre-set slots** (not freeform start/end times).
Each facility configures its own slot length (`default_duration_minutes`)
and `booking_increment_minutes`; the customer picks from generated slots,
not an arbitrary interval. Price = hourly rate × slots booked.

## Request expiry

A `REQUESTED` booking that the venue doesn't respond to within **30
minutes** auto-expires (`status=EXPIRED`, actor=SYSTEM), releasing the
payment hold and notifying the customer.

## Cancellation

- Blocked entirely within **2 hours** of `start_at`.
- Cancelling a **CONFIRMED** booking outside that window: 50% of the
  captured amount is refunded, 50% is forfeited.
- Venue-initiated cancellation always requires a reason from the fixed
  template list (`VENUE_CANCELLATION_REASON` in `src/lib/config/constants.ts`)
  — never free text.

## Manual bookings

Venue staff can create a booking directly as `CONFIRMED`, `source=MANUAL`,
without the customer having a marketplace account (`customer_id` nullable,
`customer_name`/`customer_phone` captured as plain fields). Same exclusion
constraint blocks the slot against marketplace bookings — one table, one
conflict rule, no separate "manual booking" system to keep in sync.

## Customer-facing status wording

Internal enum names are never shown verbatim to customers:

| Status                  | Customer sees                                      |
| ----------------------- | -------------------------------------------------- |
| `REQUESTED`             | "Waiting for venue confirmation"                   |
| `CONFIRMED`             | "Booking confirmed"                                |
| `REJECTED`              | "Venue could not accept this request"              |
| `EXPIRED`               | "Request expired"                                  |
| `CANCELLED_BY_CUSTOMER` | "Cancelled"                                        |
| `CANCELLED_BY_VENUE`    | "Cancelled by venue" (+ the venue's stated reason) |
| `COMPLETED`             | "Completed"                                        |
| `NO_SHOW`               | "Marked as no-show"                                |

A `REQUEST SENT` state must never be presented as `BOOKING CONFIRMED`.
