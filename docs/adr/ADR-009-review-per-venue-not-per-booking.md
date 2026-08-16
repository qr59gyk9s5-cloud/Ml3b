# ADR-009: One Review Per Customer Per Venue, Not Per Booking

**Date:** 2026-08-16
**Status:** Accepted

## Context

The founder spec's default suggestion was one review per completed
booking (`UNIQUE(booking_id)`), so a repeat customer could leave a new
review after every visit. The founder explicitly chose the simpler,
stricter rule: one review per customer per venue, ever.

## Decision

`reviews.booking_id` remains a required reference to the `COMPLETED`
booking that established eligibility, but the uniqueness constraint is
`UNIQUE (customer_id, venue_id)`, not `UNIQUE (booking_id)`. Server-side
eligibility check: the customer must have at least one `COMPLETED` booking
at that venue, and must not already have a review for that venue.

## Alternatives considered

- **One review per booking** — the original recommendation, allows
  repeat-visit reviews to accumulate over time. Not chosen.

## Advantages

Simpler review-count semantics; matches the founder's explicit choice;
avoids review-count inflation from a single frequent customer dominating
a venue's rating.

## Disadvantages

A customer can't update their impression of a venue after a materially
different later visit — their one review stands regardless of how many
times they return. Acceptable per the founder's explicit preference; can
be revisited if it becomes a real complaint.

## Consequences

Venue rating aggregation (`average_rating`, `review_count`) is naturally
bounded by distinct customer count per venue, not booking count. If a
"customer can edit their existing review" feature is wanted later, it's a
straightforward addition on top of this constraint — not a schema change.
