# Background Jobs

No standalone worker service in MVP (see
[ADR-001](../adr/ADR-001-modular-monolith-single-nextjs-app.md)). Jobs run
as **Vercel Cron → authenticated internal route handlers**, calling the
exact same domain services as interactive requests — no parallel business
logic to keep in sync.

**Implementation status (Phase 8):** the expiry and completion jobs are
real — `src/domain/booking/expire.ts` and `complete.ts`, both invoked
from the one route handler
`src/app/api/cron/booking-maintenance/route.ts`, scheduled in
`vercel.json`. The notification-outbox and review-request jobs land with
Phase 9 (notifications), once there's an outbox to process.

`vercel.json`'s schedule is currently `0 3 * * *` (once daily,
03:00 UTC) — **not** the "every few minutes" cadence the table below
describes as the target. Vercel's Hobby plan restricts cron jobs to at
most once per day; this project is on Hobby (see
`docs/operations/deployment.md`). Once on a plan without that
restriction, tighten the schedule to match the table — the route handler
itself doesn't change, it's idempotent and safe to call as often as
you like.

## MVP jobs

| Job                               | Cadence           | Does                                                                                                  |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| Expire stale requests             | every few minutes | `REQUESTED` bookings past `expires_at` (30 min) → `EXPIRED`, releases payment hold, notifies customer |
| Complete past bookings            | hourly            | `CONFIRMED` bookings past `end_at` → `COMPLETED`, unlocks review eligibility                          |
| Process notification outbox       | every minute      | dispatches `outbox_events`, retries failures with backoff                                             |
| Send review-request notifications | daily             | to customers with a recently `COMPLETED` booking                                                      |

## Rules

- Every job is idempotent — a re-run (e.g. after a Vercel Cron retry)
  must not double-process the same row.
- Jobs authenticate via a shared secret header, not left as an open public
  route.
- A job failure is logged and alertable, never silent (see
  `docs/operations/monitoring.md`).
- If job volume or latency ever outgrows Vercel Cron + route handlers,
  promote to a real `apps/worker` — that's the trigger condition for
  revisiting the monorepo decision in ADR-001, not before.
