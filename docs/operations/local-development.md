# Local Development

## Requirements

- Node.js 22.x
- pnpm (`corepack enable` will pick up the pinned version in `package.json`)
- A local PostgreSQL 16 instance with the `pgcrypto` and `btree_gist`
  extensions available (both ship in standard Postgres installs/images —
  nothing extra to install)

A full Supabase local stack (`supabase start`) needs Docker and gives you
real Auth (GoTrue) alongside Postgres. If you have Docker available, that's
the more complete option once you're building auth-dependent UI. Everything
below describes the lighter path this repo actually uses today — a plain
Postgres instance plus a local-only shim — which is enough for all schema,
migration, and RLS work and is exactly what CI uses.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Create the database (adjust to however you run Postgres locally):

```bash
createuser app_user --createdb --createrole --pwprompt   # CREATEROLE is needed by the local auth shim below
createdb sports_marketplace --owner app_user
psql sports_marketplace -c 'create extension if not exists pgcrypto; create extension if not exists btree_gist;'
```

`DATABASE_URL` in `.env.local` should point at it, e.g.
`postgres://app_user:app_password@localhost:5432/sports_marketplace`.

### The local auth shim (dev/test only — never for a real Supabase project)

A real Supabase project already provides a full `auth` schema. A plain
local Postgres doesn't, so our migrations (which reference `auth.users`)
won't apply without it. `src/testing/sql/local-auth-shim.sql` recreates
just enough of it — a minimal `auth.users` table, `auth.uid()`, and the
`authenticated`/`anon` roles — to develop and test against. Apply it once,
before your first migration:

```bash
psql sports_marketplace -f src/testing/sql/local-auth-shim.sql
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

pnpm test             # Vitest, unit/domain tests only (no database needed)
pnpm test:watch       # Vitest, watch mode
pnpm test:integration # Vitest against a real Postgres — migrations, RLS
                       # policies, constraints. Rebuilds TEST_DATABASE_URL
                       # from scratch on every run; never point it at
                       # anything you care about.

pnpm db:generate      # regenerate supabase/migrations/*.sql from the
                       # Drizzle schema (src/lib/db/schema/) after a change
pnpm db:migrate       # apply supabase/migrations/*.sql to DATABASE_URL,
                       # tracked in a _migrations table (idempotent)
pnpm db:seed          # insert local dev seed data (see supabase/seed/seed.ts)
```

## Adding a new table or column

1. Edit the Drizzle schema in `src/lib/db/schema/`.
2. `pnpm db:generate` to produce the migration SQL.
3. If the change needs RLS policies, triggers, or anything else Drizzle
   doesn't express, hand-write a follow-up migration with
   `pnpm exec drizzle-kit generate --custom --name <description>` and fill
   it in (see `supabase/migrations/0001_identity_auth_and_rls.sql` for the
   pattern).
4. `pnpm db:migrate` locally, then add/update integration tests in
   `src/lib/db/*.integration.test.ts` before considering it done — see
   CLAUDE.md's testing expectations.
