/**
 * Applies supabase/migrations/*.sql, in order, to DATABASE_URL — tracking
 * what's already run in a `_migrations` table so re-running is a no-op.
 *
 * This does NOT apply src/testing/sql/local-auth-shim.sql — that file is
 * test-only and must never touch a real Supabase project, which already
 * provides `auth.users`. Running this against local raw Postgres (no
 * Supabase) requires applying the shim yourself first; see
 * docs/operations/local-development.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');

async function main() {
  const sql = postgres(databaseUrl!, { max: 1 });
  try {
    await sql`create table if not exists public._migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )`;

    const applied = new Set(
      (await sql`select filename from public._migrations`).map((r) => r.filename),
    );

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }
      console.log(`apply ${file}`);
      const contents = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await sql.unsafe(contents);
      await sql`insert into public._migrations (filename) values (${file})`;
    }

    console.log('Migrations up to date.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
