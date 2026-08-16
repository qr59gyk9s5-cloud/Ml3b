/**
 * Integration test harness — spins up a real schema (our migrations, plus
 * the local-only auth shim) against a real Postgres, and lets tests act
 * "as" a given user under RLS exactly like a live Supabase request would.
 *
 * This intentionally reads TEST_DATABASE_URL directly rather than through
 * src/lib/config/env.ts — that module validates *application* runtime
 * config; this is test tooling with its own lifecycle.
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/lib/db/schema';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://app_user:app_password@localhost:5432/sports_marketplace_test';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');
const SQL_DIR = path.resolve(process.cwd(), 'src/testing/sql');

let rawClient: postgres.Sql | undefined;

export function getRawTestClient() {
  if (!rawClient) {
    rawClient = postgres(TEST_DATABASE_URL, { max: 5 });
  }
  return rawClient;
}

/** Drizzle client for setup/assertions as the table owner — bypasses RLS,
 * same as the service role would. Use `asUser` below to test RLS itself. */
export function getTestDb() {
  return drizzle(getRawTestClient(), { schema });
}

async function runSqlFile(sql: postgres.Sql, filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  await sql.unsafe(content);
}

/** Drops and rebuilds the test database from scratch: the local auth shim,
 * then every real migration in supabase/migrations in order, then
 * test-only grants. Call once per test file (in beforeAll) — it's not
 * cheap enough to call per test. */
export async function resetTestDatabase() {
  const sql = getRawTestClient();
  await sql.unsafe('drop schema if exists public cascade');
  await sql.unsafe('drop schema if exists auth cascade');
  await sql.unsafe('create schema public');
  await sql.unsafe('create extension if not exists pgcrypto');
  await sql.unsafe('create extension if not exists btree_gist');

  await runSqlFile(sql, path.join(SQL_DIR, 'local-auth-shim.sql'));

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles) {
    await runSqlFile(sql, path.join(MIGRATIONS_DIR, file));
  }

  await runSqlFile(sql, path.join(SQL_DIR, 'local-grants.sql'));
}

export async function closeTestDatabase() {
  if (rawClient) {
    await rawClient.end({ timeout: 5 });
    rawClient = undefined;
  }
}

type Role = 'authenticated' | 'anon';

/**
 * Runs `fn` inside a transaction with the Postgres session switched to
 * `role` and `auth.uid()` returning `userId` — the same mechanism a real
 * Supabase request goes through — then always rolls back so one test's
 * writes never leak into the next. Return whatever `fn` returns; assert
 * on it from the calling test with plain `expect`.
 */
export async function asUser<T>(
  userId: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  role: Role = 'authenticated',
): Promise<T> {
  const sql = getRawTestClient();
  const ROLLBACK = Symbol('test-rollback');
  let result: T | undefined;
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      if (userId) {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role })}, true)`;
      }
      result = await fn(tx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return result as T;
}
