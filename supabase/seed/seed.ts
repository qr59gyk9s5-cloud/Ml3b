/**
 * Local development seed data — 2 sports-adjacent people, one venue awaiting
 * approval, one admin. Never real customer information (see AGENTS.md /
 * founder spec §61).
 *
 * IMPORTANT: this inserts directly into `auth.users`, which only exists
 * because of the local-only shim (src/testing/sql/local-auth-shim.sql). A
 * real Supabase project's auth.users is managed by GoTrue and has columns
 * (encrypted_password, instance_id, aud, …) this script doesn't set — do
 * not point this at a real Supabase project. Seeding a real project means
 * creating users through Supabase Auth (signup or the Admin API with the
 * service-role key) and then inserting the rest of this script's rows
 * against their real ids — not yet wired up since we don't have a
 * Supabase project (see docs/operations/deployment.md).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { platformAdmins, venueMembers, venues } from '../../src/lib/db/schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}

async function seedUser(sql: postgres.Sql, fullName: string, email: string, phone?: string) {
  const [row] = await sql`
    insert into auth.users (email, phone, raw_user_meta_data)
    values (${email}, ${phone ?? null}, ${JSON.stringify({ full_name: fullName })}::jsonb)
    returning id
  `;
  return row.id as string;
}

async function main() {
  const sql = postgres(databaseUrl!, { max: 1 });
  const db = drizzle(sql);

  try {
    const hasAuthUsers = await sql`select to_regclass('auth.users') as reg`;
    if (!hasAuthUsers[0]?.reg) {
      throw new Error(
        'auth.users does not exist. Apply src/testing/sql/local-auth-shim.sql first (local dev only — never on a real Supabase project).',
      );
    }

    console.log('Seeding admin...');
    const adminId = await seedUser(sql, 'Founder Admin', 'admin@sportsvenue.local');
    await db.insert(platformAdmins).values({ userId: adminId });

    console.log('Seeding venue owner + venue (PENDING_REVIEW)...');
    const ownerId = await seedUser(sql, 'Karim Youssef', 'karim@elnady.local', '+201001234567');
    const [venue] = await db
      .insert(venues)
      .values({
        slug: 'el-nady-sports-club',
        name: 'El Nady Sports Club',
        city: 'Cairo',
        district: 'Nasr City',
        status: 'PENDING_REVIEW',
        createdBy: ownerId,
      })
      .returning();
    await db.insert(venueMembers).values({ venueId: venue.id, userId: ownerId, role: 'OWNER' });

    console.log('Seeding receptionist...');
    const receptionistId = await seedUser(sql, 'Salma Adel', 'salma@elnady.local', '+201007654321');
    await db
      .insert(venueMembers)
      .values({ venueId: venue.id, userId: receptionistId, role: 'RECEPTIONIST' });

    console.log('Seeding a plain customer...');
    await seedUser(sql, 'Ahmed Mostafa', 'ahmed@example.local', '+201009998888');

    console.log('Done.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
