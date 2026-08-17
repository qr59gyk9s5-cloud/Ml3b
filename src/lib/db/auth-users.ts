/**
 * The one place anything reads from Supabase's managed `auth.users`
 * table directly, for the one thing Drizzle's schema deliberately
 * doesn't model (see profiles.ts): email addresses, needed to actually
 * send a notification email. Read-only, never written — profiles is
 * still the real 1:1 app-facing identity table.
 */
import { sql } from 'drizzle-orm';
import { getDb } from './client';

export async function getUserEmails(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const db = getDb();
  // Interpolating the array directly (`id = any(${userIds})`) makes
  // drizzle's sql tag expand it as a parenthesized list of params
  // (`any(($1, $2))`) rather than an array literal — invalid syntax for
  // ANY(). sql.join over one placeholder per id + `in (...)` is what
  // actually works here.
  const idList = sql.join(
    userIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await db.execute<{ id: string; email: string }>(
    sql`select id, email from auth.users where id in (${idList})`,
  );
  return new Map(rows.map((r) => [r.id, r.email]));
}
