# Monitoring (planned — not yet active)

To be wired up starting Phase 12 (Production Readiness). Placeholder so the
`docs/operations/` structure exists and this doesn't get forgotten.

## What must be visible before production traffic

- Server errors
- Failed background jobs (`outbox_events` stuck in `FAILED`)
- Failed notifications
- Database errors
- Booking conflicts (rate of `BOOKING_CONFLICT`, not just that they're
  handled — a spike indicates a UX or availability-data problem)
- Authentication failures
- AI agent errors (once Phase 13 exists)

None of this should require reading raw production database rows to detect
an incident.
