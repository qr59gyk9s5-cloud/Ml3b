# Terminology

Use these terms consistently in code, docs, commits, and UI copy.

| Term                | Meaning                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Venue**           | A physical sports business/location (e.g. "Champions Sports Club").                                                                                                                                                  |
| **Facility**        | An individually bookable resource inside a venue (Pitch 1, Padel Court 2). This is what customers actually book — never treat a whole venue as one slot unless it genuinely has a single facility.                   |
| **Availability**    | The rules describing when a facility _could_ be booked. Availability is not a guarantee of a confirmed reservation.                                                                                                  |
| **Booking**         | A customer's reservation record for a facility + time interval. Starts `REQUESTED` for request-to-book facilities.                                                                                                   |
| **Manual booking**  | A reservation entered by venue staff for a customer who booked outside the marketplace (phone, WhatsApp, walk-in). Blocks the same resource/time as a marketplace-confirmed booking — same table, `source = MANUAL`. |
| **Blocking period** | A period a facility can't accept bookings (maintenance, tournament, private event, weather, closure). Modeled as `availability_exceptions`.                                                                          |
| **Sport**           | A taxonomy entity (football, padel, tennis, basketball, …), not a hardcoded string scattered through the codebase.                                                                                                   |
| **Reference**       | The human-readable booking identifier (`BK-7F2K91`). The UUID `id` remains canonical; the reference is what's shown to people.                                                                                       |

## Deliberately avoided terms

- "Reservation" and "booking" are used interchangeably in conversation but
  the code and schema use **booking** exclusively — don't introduce a second
  word for the same entity.
- Don't say "confirmed" when a booking is only `REQUESTED`. See
  `docs/product/booking-flow.md` for the exact customer-facing wording per
  status.
