# Open Games

ADR-011. A coordination layer on top of the existing booking engine —
not a second booking system. Read `docs/architecture/booking-engine.md`
and `docs/architecture/payments.md` first; this doc only covers what's
different.

## Schema

```
open_games
  id                      uuid PK
  booking_id              uuid NOT NULL REFERENCES bookings(id)
  organizer_id            uuid NOT NULL REFERENCES profiles(id)
  target_players          int NOT NULL
  min_players             int NOT NULL          -- <= target_players, > 0
  price_per_player_minor  int NOT NULL
  currency                text NOT NULL DEFAULT 'EGP'
  join_cutoff_at          timestamptz NOT NULL   -- must be < booking.start_at,
                                                   -- subject to
                                                   -- OPEN_GAME_MIN_LEAD_TIME_HOURS /
                                                   -- OPEN_GAME_MAX_HOLD_HOURS (see below)
  auto_confirm_if_min_met boolean NOT NULL DEFAULT false
  status                  open_game_status NOT NULL DEFAULT 'AWAITING_VENUE'
                            -- AWAITING_VENUE | FILLING | MINIMUM_REACHED |
                            -- CONFIRMED | VENUE_REJECTED | FAILED_TO_FILL |
                            -- ORGANIZER_CANCELLED | VENUE_CANCELLED
  cancelled_reason        cancellation_reason NULL  -- fixed vocabulary, see below
  created_at, updated_at  timestamptz

open_game_players
  id               uuid PK
  open_game_id     uuid NOT NULL REFERENCES open_games(id)
  user_id          uuid NOT NULL REFERENCES profiles(id)
  position         text NULL                     -- free text, see ADR-011
  skill_level      skill_level NULL               -- fixed enum
  status           open_game_player_status NOT NULL DEFAULT 'JOINED'
                     -- JOINED | LEFT | REMOVED
  joined_at        timestamptz NOT NULL
  left_at          timestamptz NULL
  created_at, updated_at timestamptz

  UNIQUE (open_game_id, user_id) WHERE status = 'JOINED'
```

`payments` gains `open_game_player_id uuid NULL REFERENCES
open_game_players(id)`, and `booking_id` becomes nullable — a CHECK
constraint enforces exactly one of the two is set on every row. One
`payments` table, one `PaymentProvider` abstraction, for both booking-
level and per-player payment records.

## Why `booking_id` on `open_games`, not the other way around

`bookings` doesn't know or care that it's part of an open game —
`source = 'OPEN_GAME'` is the only marker. Every existing guarantee
(the exclusion constraint, the state machine, RLS) applies unmodified.
`open_games` is purely additive metadata layered on top, the same
relationship `booking_events` has to `bookings`.

## The organizer is always Player #1

`createOpenGame` (`src/domain/open-games/create-open-game.ts`) does three
things in one call: creates the underlying booking (`REQUESTED`,
`source='OPEN_GAME'`), creates the `open_games` row
(`status='AWAITING_VENUE'`), and inserts the organizer directly into
`open_game_players` plus authorizes their player-share payment — bypassing
`joinOpenGame`'s normal "must be `FILLING`/`MINIMUM_REACHED`" gate, the
one deliberate exception to it. An organizer can never post a game
without also committing their own share (ADR-011's Revision).

## State machine

`open_games.status`, not a new booking status. The venue's _acceptance_
of the slot and the game's _financial confirmation_ are different events
— this is the core change from the first build (see ADR-011's Revision):

- **AWAITING_VENUE** — underlying booking is `REQUESTED`; the organizer
  (Player #1) is joined and their share authorized, nobody else can join
  yet. This is a provisional hold on the venue's inventory the instant
  the organizer creates the game, well before any roster guarantee
  exists — bounded by `OPEN_GAME_MIN_LEAD_TIME_HOURS` /
  `OPEN_GAME_MAX_HOLD_HOURS` at creation time (see below).
- **FILLING** — venue confirmed the booking; other players may now join,
  authorizing their own share on each join. Roster below `min_players`.
- **MINIMUM_REACHED** — roster at/above `min_players`, below
  `target_players`, `auto_confirm_if_min_met` is false. Display-only
  status change (the game isn't finalized) — new joins keep landing
  until target is reached or the cutoff arrives.
- **CONFIRMED** — roster finalized (target reached early, or minimum
  reached and either `auto_confirm_if_min_met` or the cutoff job
  resolved it that way), every joined player's payment captured.
- **VENUE_REJECTED** — venue rejected the underlying booking while still
  `AWAITING_VENUE`. Organizer's authorization released, nothing charged.
- **FAILED_TO_FILL** — cutoff arrived below `min_players`. Every
  `AUTHORIZED` player payment released, underlying booking cancelled.
- **ORGANIZER_CANCELLED** — organizer called it off before resolution
  (`organizerCancelOpenGame`). Same release-everything effect.
- **VENUE_CANCELLED** — venue staff cancelled the provisional hold
  directly (same fixed-reason-list cancellation as any other venue
  cancellation). Same release-everything effect.

`VENUE_REJECTED`, `FAILED_TO_FILL`, `ORGANIZER_CANCELLED`, and
`VENUE_CANCELLED` are all terminal — see
`OPEN_GAME_TERMINAL_STATUS` in `src/lib/config/constants.ts`. Only
`FILLING`/`MINIMUM_REACHED` accept joins
(`JOINABLE_STATUSES` in `src/domain/open-games/join.ts`).

## Reusing the booking state machine — one new edge, one cascade hook

The underlying booking transitions independently (venue staff acting on
it directly through the normal booking flow), and `open_games.status`
reacts to it via `handleOpenGameBookingCascade`
(`src/domain/open-games/booking-cascade.ts`), called at the end of every
`transitionBooking` for a `source='OPEN_GAME'` booking:

```
booking CONFIRMED,  open_games AWAITING_VENUE  → open_games FILLING
booking REJECTED/EXPIRED, open_games AWAITING_VENUE
                                                → release organizer's hold,
                                                  open_games VENUE_REJECTED
booking CANCELLED_BY_VENUE, open_games FILLING/MINIMUM_REACHED
                                                → release every JOINED
                                                  player's hold,
                                                  open_games VENUE_CANCELLED
```

The automatic below-minimum-at-cutoff and organizer-cancel paths go the
other direction — `src/domain/open-games/finalize.ts`'s `cancelOpenGame`
updates `open_games.status` to its terminal target _first_, then calls
`transitionBooking` to cancel the underlying booking. That ordering is
deliberate: it's what stops the generic cascade hook above from
double-processing a cancellation `cancelOpenGame` itself triggered — by
the time the hook's booking-status handler fires, `open_games.status` is
already outside `FILLING`/`MINIMUM_REACHED`, so its guard is a no-op for
the self-triggered case while still firing correctly for a genuinely
external one (a human rejecting/cancelling through the booking dashboard
directly).

`src/domain/booking/state-machine.ts`'s `CONFIRMED -> CANCELLED_BY_VENUE`
edge gained `isSystemActor` as an additional `allow`, alongside
`isVenueStaffForBooking` — reasoned as closer to a venue-side
cancellation (the slot doesn't happen through no fault of the customer/
organizer specifically) than a customer one. `VENUE_CANCELLATION_REASON`
gained `INSUFFICIENT_PLAYERS` for the automatic case — the same
fixed-vocabulary discipline as every other cancellation reason, never
free text.

## Real-time resolution vs. the cutoff job

`joinOpenGame` (`src/domain/open-games/join.ts`) resolves a game
synchronously, in the same call, the instant a join crosses a threshold
— this is the primary confirmation mechanism, not the cron:

```
newCount >= target_players           → finalize immediately
newCount >= min_players
  && auto_confirm_if_min_met         → finalize immediately
newCount >= min_players (otherwise)  → status → MINIMUM_REACHED (display only)
```

`resolveOpenGamesPastCutoff` (`src/domain/open-games/cutoff.ts`), run
from `src/app/api/cron/booking-maintenance/route.ts`, is the
reconciliation backup for the case a join-triggered resolution can't
cover — a cutoff arriving with nobody left to cross a threshold:

```
for every open_games row: status IN (FILLING, MINIMUM_REACHED)
                           AND join_cutoff_at <= now()
  re-fetch, re-check still unresolved (another actor may have
  already resolved it between the sweep query and here)
  joined_count >= target_players
    OR (joined_count >= min_players AND auto_confirm_if_min_met)
                                        → finalize (safety net — should
                                          already have happened on the
                                          qualifying join)
  else                                  → cancel: FAILED_TO_FILL,
                                          INSUFFICIENT_PLAYERS,
                                          release every AUTHORIZED payment
```

"Finalize" (`finalizeOpenGame`) = capture every `JOINED` player's
`AUTHORIZED` payment, set `open_games.status = 'CONFIRMED'`. Valid only
from `FILLING`/`MINIMUM_REACHED`.

**This cron-based sweep runs only as often as the maintenance route's own
cadence** (see `docs/architecture/background-jobs.md` — currently a
single daily Vercel Cron Hobby-plan invocation). A game's cutoff can
therefore sit unresolved for up to that long after it actually passes,
in the rare case the join-triggered path didn't already resolve it. This
is a timeliness gap, not a correctness one — nobody is ever charged for
a game that didn't fill, the release just might lag. A real per-game
exact-timestamp trigger (a paid Vercel cron tier, or a third-party
at-time scheduler like QStash/Inngest) is the real fix and a genuine
infra decision, not picked silently here — see Known gaps.

## Hold duration and lead time

`OPEN_GAME_MIN_LEAD_TIME_HOURS` and `OPEN_GAME_MAX_HOLD_HOURS`
(`src/lib/config/constants.ts`) bound `join_cutoff_at` and `startAt` at
creation time (`createOpenGame`'s validation, alongside the normal
facility/availability checks): a game can't be created with a start time
inside the lead-time window, and can't hold a venue's inventory
provisionally for longer than the max-hold window before its cutoff.
Fixed platform-wide constants for MVP, not yet a per-venue setting — see
ADR-011's Revision and Known gaps.

## Known gaps, flagged not hidden

- **Real-time exact-timestamp cutoff resolution isn't built.** The
  join-triggered path covers the common case; the cron sweep is a
  same-day-at-worst backup, not a promise of resolving a cutoff the
  moment it passes. Needs a real infra decision (paid cron tier or a
  third-party scheduler), not a silent choice.
- ~~Cancelling an already-`CONFIRMED` open game~~ — **built.**
  Founder-specified policy (not a silently-picked one): a player leaving
  within `CANCELLATION_CUTOFF_HOURS` of kickoff forfeits, no exceptions.
  Outside that window, if their leaving drops the roster below
  `minPlayers` the game can no longer be played as configured — the
  whole game cancels and _everyone_ (including the player who left) is
  refunded. If the roster still clears `minPlayers` without them, only
  they are refunded and the game continues. The organizer has the same
  option (cancel the whole thing, same cutoff, everyone refunded) —
  see `src/domain/open-games/join.ts`'s `leaveConfirmedOpenGame` and
  `finalize.ts`'s `cancelConfirmedOpenGame`. New terminal status
  `CANCELLED_AFTER_CONFIRMED`, since `CONFIRMED` is no longer itself
  terminal (0016 migration). Refund execution follows the exact same
  dormant-until-a-real-provider-is-configured discipline as
  `refundBookingCancellationPayment` — see `src/domain/payments/
service.ts`'s file-level doc comment.
- **`OPEN_GAME_MAX_HOLD_HOURS`/`OPEN_GAME_MIN_LEAD_TIME_HOURS` are fixed
  constants, not per-venue settings.** The founder explicitly floated
  venue-configurable hold duration/lead time and accepted fixed
  constants as an MVP simplification — see ADR-011's Revision.
- **No per-sport position taxonomy** — see ADR-011 and
  `docs/product/open-games.md`.
