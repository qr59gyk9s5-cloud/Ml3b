# Incident Response

**Implementation status (Phase 12): the process is concrete; there is no
real incident history yet** because there is no production traffic yet
(see `docs/operations/deployment.md`'s launch checklist). This is the
real procedure to follow once there is, not a placeholder.

## Detecting an incident

See `docs/operations/monitoring.md` for what's actually watchable today:
Vercel Logs (server errors), `GET /api/health` + an uptime pinger
(database reachability), Supabase's own Auth logs, and — until a
dashboard exists for it — direct queries against `outbox_events`/
`notifications` for stuck `FAILED` rows.

## What every incident writeup should capture

- **What broke** — the actual symptom a user or monitor would have seen.
- **When** — first occurrence, not just when it was noticed (these
  differ, and the gap between them is itself useful data).
- **Who/what noticed it** — a monitor, a user report, a founder
  spot-check. If nothing automated caught it, that's a monitoring gap
  worth its own follow-up.
- **Impact** — bookings/payments/data affected, and how many, not just
  "some." For a booking-correctness or payment incident specifically,
  check whether the double-booking exclusion constraint or the payment
  domain service's FAILED-row recording (`docs/architecture/payments.md`)
  already contained the damage — that's the difference between "briefly
  degraded, fully recovered" and "data needs manual reconciliation."
- **Root cause** — not just the immediate trigger; the actual why.
- **The fix** — what shipped, and how it was verified before shipping
  (per this repo's own no-claiming-success-without-verification rule).
- **Follow-up** — what prevents recurrence: a new test, a new monitor, a
  process change. An incident without a follow-up item is one that will
  happen again.

## Booking-correctness and payment incidents get extra care

Per CLAUDE.md's priority order (booking correctness and security
outrank almost everything else) and `docs/security/threat-model.md`:

- A `CONFIRMED`/`CONFIRMED` overlap should be structurally impossible
  (the `bookings_no_overlap` GiST exclusion constraint —
  `docs/architecture/database.md#concurrency`). If one is ever observed
  in production, that is a severity-1 incident regardless of how minor
  it looks — the constraint is the actual guarantee the whole product
  depends on, and its failing means something bypassed it (a manual DB
  edit, a bug in a migration that dropped it, a role with more DB
  privilege than it should have).
- A payment stuck in a state that doesn't match its booking's status
  (e.g. `CAPTURED` on a booking that's `CANCELLED_BY_VENUE` without a
  corresponding refund) needs manual reconciliation, not an automatic
  fix — see `docs/architecture/payments.md`'s known gap about
  non-blocking payment side effects.
- Never execute a refund, ban a user/venue, or reset/restore the
  production database as part of "fixing" an incident without the
  explicit human approval CLAUDE.md requires for each — an incident
  under time pressure is exactly when that rule matters most, not an
  exception to it.
