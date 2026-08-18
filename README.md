# PlayCairo

A marketplace connecting customers with sports facilities (football
pitches, padel/tennis courts, and more) at real venues in Cairo, Egypt.
Customers request a booking; venues confirm or reject; a
database-enforced booking engine guarantees no double-booking. Also
includes Open Games — post a "need players" game, others join and pay
their own share, auto-cancelled and refunded if it doesn't fill. See
`docs/product/product-overview.md` for the full picture and `CLAUDE.md`
for the operational contract this codebase follows.

**Status:** live prototype. Booking, venue dashboard, notifications,
payments wiring, the admin console, and Open Games are all built and
tested — see `CLAUDE.md`'s "Where to look next" for the phase-by-phase
detail. Real customer payments are still off (Fawry integration is a
stub pending a live merchant account); everything else is real.

## Requirements

- Node.js 22.x
- pnpm

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

See `docs/operations/local-development.md` for the full command reference.

## Documentation

|                      |                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs/product/`      | What we're building — terminology, roles, booking flow, Open Games                                           |
| `docs/architecture/` | How it's built — system design, database, authorization, notifications, background jobs, AI agent boundaries |
| `docs/security/`     | Threat model, secrets handling                                                                               |
| `docs/operations/`   | Local dev, deployment, monitoring, backup/recovery, incident response                                        |
| `docs/adr/`          | Architecture Decision Records — why, not just what                                                           |

## Contributing

Feature branches off `main`, PRs reviewed via `.github/pull_request_template.md`,
CI (`.github/workflows/ci.yml`) must pass. See `CLAUDE.md` for the full
engineering contract.
