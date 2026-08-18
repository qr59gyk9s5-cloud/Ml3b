# Open Games

**Implementation status:** built (ADR-011) — domain logic, tests, and UI
complete (browse, organize, join/leave, organizer cancel). This doc
describes the shipped flow.

A "need players" layer: an organizer posts an open game against a real
venue/facility slot and joins it themselves as the first player; other
customers join individually, each paying their own share, until the
roster fills — or the game is automatically called off and everyone's
money is released if it doesn't.

## Why this exists

The founder's own framing: "I would not let one organizer pay the
entire field cost for an open game and hope 21 strangers eventually
join. That creates too much risk and will discourage people from
creating games." Per-player payment is what makes an open game a real
commitment instead of a WhatsApp group where half the "I'm coming"s
don't show up. The organizer joining and paying their own share too —
rather than just posting a request — is what keeps the feature from
being spammable.

## Flow

```
Organizer picks venue/facility/time, target players, minimum players,
price per player, a join cutoff, and whether to auto-confirm at minimum
        ↓
Same request-to-book path as any booking: availability validated,
booking created status=REQUESTED, source=OPEN_GAME —
AND the organizer is immediately joined as player #1, their own
share authorized. Status: AWAITING_VENUE.
        ↓
Venue staff accepts or rejects — same 30-minute operational window
as every other request. Only the organizer has paid anything so far.
       ↙                                              ↘
  ACCEPT                                            REJECT
     ↓                                                  ↓
Status: FILLING — other players may now join       Status: VENUE_REJECTED,
     ↓                                              organizer's hold released
Each join authorizes that player's share
(held, not charged) and adds them to the roster
with an optional position and skill level
     ↓
  ┌──────────────────────────────┬───────────────────────────────┐
  │ Roster reaches target        │ Join cutoff arrives            │
  │ (before cutoff)               │                                 │
  ↓                                ↓                                 ↓
Finalize immediately          Below minimum          At/above minimum,
— capture every player's      → FAILED_TO_FILL,        below target
payment, status CONFIRMED     release every hold           ↓
                                                    auto_confirm_if_min_met?
                                                     ↙                  ↘
                                                   yes                  no
                                                    ↓                    ↓
                                          Finalize with the      Status stays
                                          current roster,        MINIMUM_REACHED
                                          status CONFIRMED       until target or
                                                                  cutoff resolves it
```

The organizer can call the whole thing off at any point before it's
resolved (`ORGANIZER_CANCELLED`), and venue staff can cancel an accepted
hold directly (`VENUE_CANCELLED`) — both release every player's hold,
nobody is ever charged for a game that didn't happen.

## Rules

- **The organizer is always the first player, automatically, and pays
  their own share too.** Creating an open game is not a free spam-able
  action — it's the same commitment every other player makes.
- **A player can only join once the venue has accepted the slot as a
  provisional hold** — never before. It means no player's money (beyond
  the organizer's own) is ever held against a slot the venue might still
  reject.
- **Venue acceptance and the game being financially locked in are two
  different moments.** Accepting starts the fill window; it doesn't
  guarantee the game happens. The venue is provisionally holding real
  inventory from the moment it accepts, which is why that hold is
  time-bounded (see below) rather than open-ended.
- **Minimum must be reached by the cutoff, or everyone's held payment is
  released automatically** — no organizer action required, no money
  ever actually charged for a game that didn't happen.
- **Reaching the target roster finalizes the game immediately**, the
  instant the qualifying join happens — no reason to make a full team
  wait for a batch job.
- A player who leaves before the game is finalized has their hold
  released, same as never having joined.
- Position is free text (e.g. "Goalkeeper", "Center back") — not yet a
  fixed per-sport taxonomy; see ADR-011's disadvantages. Skill level is
  a small fixed list (`BEGINNER` / `INTERMEDIATE` / `ADVANCED` /
  `COMPETITIVE`) shared across every sport.
- **A game can't hold a venue's slot indefinitely while waiting for
  strangers to join** — creation enforces a minimum lead time before the
  match and a maximum provisional-hold window before the cutoff (fixed
  platform constants for MVP; see `docs/architecture/open-games.md`).
- Once finalized (`CONFIRMED`), an open game behaves like any other
  confirmed booking for the venue — same check-in QR flow, same
  cancellation-policy conversation, though cancelling a fully-rostered
  open game is a multi-party problem the MVP does not yet solve
  (see `docs/architecture/open-games.md`'s known gaps).

## What this is not

Not a chat/social feed, not a friend/follow graph, not a skill-rating or
reputation system, not a per-sport position taxonomy, not a per-venue
configurable hold policy (yet — fixed constants today). All plausible
future extensions once the core "reliably fill a roster and everyone
actually pays their share" mechanic is proven — not built now, not
silently assumed.
