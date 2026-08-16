# Local Development

## Requirements

- Node.js 22.x
- pnpm (`corepack enable` will pick up the pinned version in `package.json`)
- Supabase CLI (added in Phase 2, for local Postgres + Auth)

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in values once Supabase project exists (Phase 2)
```

## Commands

```bash
pnpm dev            # start the Next.js dev server
pnpm build           # production build
pnpm start           # run the production build

pnpm lint             # ESLint
pnpm format           # Prettier — write
pnpm format:check     # Prettier — check only (used in CI)
pnpm typecheck        # tsc --noEmit

pnpm test             # Vitest, single run (used in CI)
pnpm test:watch       # Vitest, watch mode
```

## Not yet available

Database migrations, seed data, and a worker process don't exist yet —
they land in Phase 2 (`supabase/migrations`, `supabase/seed`). This doc
will be extended with `supabase start`, `pnpm db:migrate`, and
`pnpm db:seed` at that point.
