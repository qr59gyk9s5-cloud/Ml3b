# Notifications

Event-driven, reliable-delivery, provider-abstracted. A booking transaction
must never fail — or silently lose a notification — because an email
provider is temporarily down.

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
