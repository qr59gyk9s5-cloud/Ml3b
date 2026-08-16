# Sports Venue Booking Marketplace

A marketplace connecting customers with sports facilities (football
pitches, padel/tennis courts, and more) at real venues in Egypt. Customers
request a booking; venues confirm or reject; a database-enforced booking
engine guarantees no double-booking. See `docs/product/product-overview.md`
for the full picture and `CLAUDE.md` for the operational contract this
codebase follows.

**Status:** early foundation (Phase 1 of the roadmap in
`docs/adr/` and `docs/architecture/`). No database, auth, or booking logic
exists yet — this is scaffolding: tooling, docs, and CI.

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
| `docs/product/`      | What we're building — terminology, roles, booking flow                                                       |
| `docs/architecture/` | How it's built — system design, database, authorization, notifications, background jobs, AI agent boundaries |
| `docs/security/`     | Threat model, secrets handling                                                                               |
| `docs/operations/`   | Local dev, deployment, monitoring (deployment/monitoring/backup are placeholders pre-Phase 12)               |
| `docs/adr/`          | Architecture Decision Records — why, not just what                                                           |

## Contributing

Feature branches off `main`, PRs reviewed via `.github/pull_request_template.md`,
CI (`.github/workflows/ci.yml`) must pass. See `CLAUDE.md` for the full
engineering contract.
