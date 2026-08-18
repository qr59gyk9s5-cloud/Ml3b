# ADR-011: Open Games — Social Matchmaking, Per-Player Payment

**Date:** 2026-08-18
**Status:** Accepted

## Context

Not in the original founder spec's phase plan — raised mid-build by the
founder as a new feature: a "need players" layer where someone posts an
open game (e.g. "Football 5v5, New Cairo, Thursday 10pm, 7/10 joined,
120 EGP/player") and strangers join individually to fill the roster,
optionally picking a position and skill level. The founder named
Yalla Hagz and Playmaker as competitors already proving demand for this
matchmaking layer specifically (not just booking), and was explicit that
this is a genuinely new, large scope addition — flagged rather than
silently squeezed into an existing phase, per CLAUDE.md.

The founder was also explicit about the one failure mode this must not
repeat: an organizer pre-paying for the whole pitch and hoping enough
strangers show up and reimburse them, which is what makes ad-hoc
WhatsApp-group games unreliable today. Their own proposed mechanic —
each player authorizes their own share on joining, captured only once a
minimum roster is reached by a cutoff, released/refunded otherwise — is
what actually solves that, not just a cosmetic "players needed" post.

After a first version was built, the founder reviewed it and pushed back
on two points, both adopted in full (see "Revision" below): collapsing
"venue accepted" and "roster locked in" into one `CONFIRMED` state hides
a real business question (how long can an open game hold prime-time
inventory while strangers trickle in?), and an organizer who posts "need
22 players" without joining their own game is unaccountable and
indistinguishable from spam.

## Decision

**One real booking underneath every open game — no parallel booking
system.** An organizer creates an open game exactly like a normal
booking request (same facility/time-slot validation, same venue
confirm-or-reject flow, same `bookings_no_overlap` exclusion constraint
protecting the slot); `bookings.source = 'OPEN_GAME'` is the only new
booking-table concept. `open_games` and `open_game_players` sit on top
of that one booking as a coordination layer, not a second source of
truth for the slot itself.

**Players can only join after the venue has accepted the slot as a
provisional hold**, never before — zero player payment is ever
authorized against a slot the venue might still reject. But venue
acceptance is not the same event as the game being financially
confirmed (see Revision) — it starts the fill window, it doesn't end
the game's lifecycle.

**Per-player payment reuses the existing `PaymentProvider` abstraction**
(`src/lib/payments`) — authorize on join, capture at confirmation
(target reached early, or minimum reached and either
auto-confirmed or resolved at cutoff), release on cancellation.
`payments.booking_id` becomes nullable and `payments.open_game_player_id`
is added (exactly one of the two set) — one payments table for both
booking-level and per-player payment records, not a duplicate schema.
Same honest consequence as ADR-007: this is all real, wired, and dormant
until Fawry is actually live — nothing here fakes a charge.

**Position is free text; skill level is a small fixed enum
(`SKILL_LEVEL`)** shared across every sport. A real per-sport position
taxonomy (goalkeeper/defender/midfielder/forward for football looks
nothing like padel or basketball) is real, valuable work deferred
deliberately, not an oversight — free text ships the feature now without
locking in a taxonomy that would need redesigning per sport later.

## Revision — founder feedback after the first build

Three changes, all adopted:

1. **Granular status, not a collapsed `OPEN/CONFIRMED/CANCELLED`.**
   `AWAITING_VENUE → FILLING → MINIMUM_REACHED → CONFIRMED`, with
   distinct terminal failure states (`VENUE_REJECTED`, `FAILED_TO_FILL`,
   `ORGANIZER_CANCELLED`, `VENUE_CANCELLED`) instead of one shared
   `CANCELLED`. The founder's reasoning, verbatim in substance: a venue
   accepting the slot and a game being financially locked in are
   different events with different consequences — the venue has blocked
   real inventory the moment it accepts, well before any roster
   guarantee exists. Collapsing them made it impossible to represent
   "held but not yet committed" at all. See
   `docs/architecture/open-games.md` for the full state machine.
2. **The organizer is always Player #1.** `createOpenGame` inserts the
   organizer into `open_game_players` and authorizes their own share in
   the same call that creates the game — never a bystander posting "need
   22 players" without joining. Prevents spam, gives the creator
   financial skin in their own game.
3. **Real-time cutoff resolution is the goal; the daily cron is the
   backup, not the primary mechanism.** The founder was explicit that a
   game whose cutoff passes at 2pm must not sit unresolved until a
   midnight batch job gets to it. `join.ts` resolves a game the instant
   a join crosses `target_players` or (`min_players` and
   `auto_confirm_if_min_met`) — no waiting for any job. The maintenance
   cron's cutoff sweep (`resolveOpenGamesPastCutoff`) is the
   reconciliation safety net for the case that trigger can't cover: a
   cutoff arriving with nobody left to join and cross a threshold. A
   true per-game exact-timestamp trigger (a paid Vercel cron tier, or a
   third-party at-time scheduler like QStash) is flagged as a real infra
   decision in `docs/architecture/open-games.md`'s known gaps, not
   silently picked here.

The founder also raised, and explicitly accepted an MVP simplification
for: how long a venue's inventory can be held provisionally by an
unfilled open game. `OPEN_GAME_MAX_HOLD_HOURS` and
`OPEN_GAME_MIN_LEAD_TIME_HOURS` (`src/lib/config/constants.ts`) are fixed
platform-wide constants for now, not per-venue configurable settings —
the founder's own words: "For MVP, I would make the fill window
reasonably short... that gives venue owners control" describes a
venue-settings feature that does not exist yet. Fixed constants ship the
underlying protection (a game can't hold a slot indefinitely) now;
per-venue configurability is a real follow-up, flagged, not built.

## Alternatives considered

- **A separate "interest list" with no payment, no roster commitment** —
  rejected by the founder explicitly: "I would not let one organizer pay
  the entire field cost... free coordination creates the wrong
  behavior... payment creates real commitment." This is the founder's
  stated reasoning, not a technical judgment call.
- **A parallel booking/slot-holding system for open games** — rejected:
  would duplicate the exclusion-constraint guarantee, the state machine,
  and the payment wiring instead of reusing all three, and would create
  a second place double-booking could slip through.
- **Letting players join before venue acceptance** — rejected: would
  authorize real holds against a slot that might never be confirmed, and
  would need a cascade-cancel-and-refund-everyone path for the reject
  case that the accept-first ordering avoids needing at all.
- **Collapsing "venue accepted" and "roster confirmed" into one status**
  (the original build) — rejected on founder review: hides the business
  question of how long a provisional hold is allowed to block prime-time
  inventory, and makes "held but not yet committed" unrepresentable.

## Advantages

Solves the founder's stated problem (games falling through because
"I'm coming" isn't a real commitment) without inventing a second
booking engine — every correctness guarantee the core product already
has (no double-booking, no silent admin edits, no client-trusted
payment status) applies to open games for free. Matches validated
competitor demand (Yalla Hagz, Playmaker) for the matchmaking layer
specifically, not just venue booking. The granular status model gives
the founder a real lever (hold-duration constants today, per-venue
settings later) over how much prime-time inventory open games are
allowed to tie up.

## Disadvantages

Real scope growth mid-build, on top of the already-complete 12-phase
MVP — a large new domain (two tables, a background job extension, new
UI) rather than a small addition, made larger still by the granular
status revision. The join-after-venue-acceptance-only ordering means an
open game can't start collecting players the instant it's posted if the
venue is slow to respond, trading a short delay for avoiding wasted
authorizations. No per-sport position taxonomy at launch — position is a
cosmetic/informational field for now, not a matching-quality feature.
Cutoff timeliness depends on the maintenance cron's cadence until a real
at-time scheduler is chosen — a flagged, not hidden, gap.

## Consequences

`src/domain/open-games/` becomes a new domain module, following the same
one-domain-service-owns-the-state-machine discipline as
`src/domain/booking` and `src/domain/venue`. The booking maintenance
cron (`docs/architecture/background-jobs.md`) gains a new responsibility
— reconciling open games past their join cutoff — alongside expiry and
completion, but is explicitly the backup path, not the primary
confirmation mechanism (see Revision above). `VENUE_CANCELLATION_REASON`
gains `INSUFFICIENT_PLAYERS` for the automatic below-minimum-at-cutoff
cancellation path, and the `CONFIRMED -> CANCELLED_BY_VENUE`
state-machine edge gains a `SYSTEM` actor allowance for that same
automatic case — see `docs/architecture/open-games.md` for the full
mechanics.
