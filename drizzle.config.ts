import type { Config } from 'drizzle-kit';

// drizzle-kit needs a raw DATABASE_URL at config-eval time — it reads
// process.env directly here rather than through src/lib/config/env.ts
// (that module is for application code, not tooling config).
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://app_user:app_password@localhost:5432/sports_marketplace';

export default {
  schema: './src/lib/db/schema/index.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  // Only the `public` schema is Drizzle's to manage. `auth` belongs to
  // Supabase — see src/lib/db/schema/profiles.ts for how we reference it
  // without letting drizzle-kit try to generate DDL for it.
  schemaFilter: ['public'],
} satisfies Config;
