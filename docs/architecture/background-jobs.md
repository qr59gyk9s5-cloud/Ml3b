# Background Jobs

No standalone worker service in MVP (see
[ADR-001](../adr/ADR-001-modular-monolith-single-nextjs-app.md)). Jobs run
as **Vercel Cron → authenticated internal route handlers**, calling the
exact same domain services as interactive requests — no parallel business
logic to keep in sync.

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
