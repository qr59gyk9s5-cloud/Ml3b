import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeTestDatabase, getRawTestClient, getTestDb, resetTestDatabase } from '@/testing/db';
import { profiles } from '@/lib/db/schema';

describe('handle_new_user trigger', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('creates a profile row when a new auth.users row is inserted', async () => {
    const sql = getRawTestClient();
    const id = randomUUID();
    await sql`
      insert into auth.users (id, email, phone, raw_user_meta_data)
      values (${id}, 'ahmed@example.test', '+201000000000', ${sql.json({ full_name: 'Ahmed M.' })})
    `;

    const db = getTestDb();
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));

    expect(profile).toBeDefined();
    expect(profile.fullName).toBe('Ahmed M.');
    expect(profile.phone).toBe('+201000000000');
  });

  it('falls back to an empty name when signup metadata has none', async () => {
    const sql = getRawTestClient();
    const id = randomUUID();
    await sql`insert into auth.users (id, email) values (${id}, 'noname@example.test')`;

    const db = getTestDb();
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));

    expect(profile).toBeDefined();
    expect(profile.fullName).toBe('');
  });

  it('deletes the profile when the auth.users row is deleted (cascade)', async () => {
    const sql = getRawTestClient();
    const id = randomUUID();
    await sql`insert into auth.users (id, email) values (${id}, 'temp@example.test')`;
    await sql`delete from auth.users where id = ${id}`;

    const db = getTestDb();
    const rows = await db.select().from(profiles).where(eq(profiles.id, id));
    expect(rows).toHaveLength(0);
  });
});
