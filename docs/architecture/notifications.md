# Notifications

Event-driven, reliable-delivery, provider-abstracted. A booking transaction
must never fail — or silently lose a notification — because an email
provider is temporarily down.

**Implementation status (Phase 9):** real, with two honest gaps from the
design below.

1. **Not the same DB transaction.** The flow diagram shows the outbox
   row written in the same transaction as the domain event. In practice,
   `src/domain/notifications/outbox.ts`'s `enqueueBookingEvent()` runs as
   a separate statement immediately after the booking write, wrapped so
   it can never throw (a booking transition must not fail because
   notification plumbing did — CLAUDE.md's priority order puts booking
   correctness above notification delivery). The real, narrow risk this
   accepts: a crash in the split second between the two statements loses
   that one notification, never the booking itself.
2. **No RESEND_API_KEY set yet.** `src/lib/notifications` falls back to
   `ConsoleNotificationProvider` (logs instead of sending) until a real
   Resend account is connected — same honest-degradation pattern as
   Supabase/Vercel elsewhere in this project. `dispatchOutboxEvents()`,
   the `notifications` table, and the IN_APP channel are all fully real
   regardless.

Everything else matches the design: `src/domain/booking/transition.ts`
and `create-request.ts` enqueue on every lifecycle event in
`NOTIFICATION_EVENT_TYPE`; `dispatchOutboxEvents()`
(`src/domain/notifications/dispatch.ts`), invoked from
`src/app/api/cron/booking-maintenance/route.ts`, claims PENDING rows,
resolves recipients (venue staff for `BOOKING_REQUESTED`/
`BOOKING_CANCELLED_BY_CUSTOMER`, the customer for everything else), and
writes one `notifications` row per (recipient, channel). A per-recipient
EMAIL failure is tracked on that row (`status='FAILED'`) without
retrying the whole outbox event — retrying would re-insert a duplicate
IN_APP row for recipients who already got theirs. Outbox-level retry
(`attempts`/`last_error`, capped at `OUTBOX_MAX_ATTEMPTS`) is reserved
for structural failures (the booking an event refers to can't be found),
where nothing was written yet and a retry is safe.

## Flow

```
Domain transition (e.g. booking confirmed)
        ↓  (same DB transaction)
outbox_events row written
        ↓
transaction commits
        ↓
Vercel Cron polls outbox_events
        ↓
NotificationProvider abstraction dispatches by channel
        ↓
notifications row + outbox_events marked PROCESSED, or retried on failure
```

Booking/venue/review services never import a vendor SDK (Resend, Twilio,
WhatsApp Business API, …) directly — they only ever call the
`NotificationProvider` interface in `src/lib/notifications`.

## Channels

- **MVP:** `IN_APP` (always) + `EMAIL`.
- **Confirmed bookings also get a QR code** (encoding the booking
  reference) that venue staff can scan at check-in to verify the
  reservation — generated as part of the confirmation notification, not a
  separate system.
- **Future:** `PUSH`, `WHATSAPP`, `SMS` — added as new implementations of
  the same interface.

## Events (non-exhaustive — extend as flows are built)

`BOOKING_REQUESTED`, `BOOKING_CONFIRMED`, `BOOKING_REJECTED`,
`BOOKING_CANCELLED`, `BOOKING_REMINDER`, `VENUE_RESPONSE_REMINDER`,
`BOOKING_COMPLETED`, `REVIEW_REQUESTED`.

## Failure handling

Notification dispatch failures retry with backoff via `outbox_events`
(`attempts`, `last_error`). A failed notification never rolls back the
booking state change that triggered it — the booking is the source of
truth; the notification is a best-effort side effect with its own retry
loop.
