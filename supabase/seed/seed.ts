/**
 * Local development seed data — one venue already live (ACTIVE), one
 * awaiting approval (PENDING_REVIEW) so the admin-approval gate has
 * something to demonstrate, plus staff and a plain customer. Never real
 * customer information (see AGENTS.md / founder spec §61).
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
import { platformAdmins, sports, venueMembers, venues } from '../../src/lib/db/schema';
import { createFacility } from '../../src/domain/venue/facilities';
import { createAvailabilityRule } from '../../src/domain/availability/rules';
import { createAvailabilityException } from '../../src/domain/availability/exceptions';
import { createBookingRequest } from '../../src/domain/booking/create-request';
import { transitionBooking } from '../../src/domain/booking/transition';
import { createManualBooking } from '../../src/domain/booking/manual';
import { closeDb } from '../../src/lib/db/client';

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

    console.log('Seeding sports...');
    const [football] = await db
      .insert(sports)
      .values({ code: 'football', displayName: 'Football' })
      .returning();
    const [padel] = await db
      .insert(sports)
      .values({ code: 'padel', displayName: 'Padel' })
      .returning();
    await db.insert(sports).values({ code: 'tennis', displayName: 'Tennis' });
    await db.insert(sports).values({ code: 'basketball', displayName: 'Basketball' });

    console.log('Seeding admin...');
    const adminId = await seedUser(sql, 'Founder Admin', 'admin@sportsvenue.local');
    await db.insert(platformAdmins).values({ userId: adminId });

    console.log('Seeding venue owner + ACTIVE venue...');
    const ownerId = await seedUser(sql, 'Karim Youssef', 'karim@elnady.local', '+201001234567');
    const [venue] = await db
      .insert(venues)
      .values({
        slug: 'el-nady-sports-club',
        name: 'El Nady Sports Club',
        description: 'Floodlit 5-a-side pitches and padel courts in Nasr City, open until 1am.',
        city: 'Cairo',
        district: 'Nasr City',
        status: 'ACTIVE',
        createdBy: ownerId,
      })
      .returning();
    await db.insert(venueMembers).values({ venueId: venue.id, userId: ownerId, role: 'OWNER' });

    console.log('Seeding facilities (via the real domain service)...');
    const ownerActor = { userId: ownerId, isPlatformAdmin: false };
    const pitch1 = await createFacility(venue.id, ownerActor, {
      sportId: football.id,
      name: 'Football Pitch 1',
      slug: 'football-pitch-1',
      bookingMode: 'REQUEST_TO_BOOK',
      // 30-min granularity (not 60) so 90-minute matches — a standard
      // 5-a-side/7-a-side match length, and the only duration beyond the
      // 60-min minimum football is ever booked for — are a reachable
      // duration option. See computeDurationOptions
      // (src/lib/booking/slot-picker.ts): options step from
      // minimumDurationMinutes by slotDurationMinutes, so a 60-min step
      // could only ever offer 60/120, never the in-between 90.
      slotDurationMinutes: 30,
      minimumDurationMinutes: 60,
      maximumDurationMinutes: 90,
      basePriceMinor: 50000,
      currency: 'EGP',
    });
    const pitch2 = await createFacility(venue.id, ownerActor, {
      sportId: football.id,
      name: 'Football Pitch 2',
      slug: 'football-pitch-2',
      bookingMode: 'REQUEST_TO_BOOK',
      slotDurationMinutes: 30,
      minimumDurationMinutes: 60,
      maximumDurationMinutes: 90,
      basePriceMinor: 50000,
      currency: 'EGP',
    });
    const padelCourt = await createFacility(venue.id, ownerActor, {
      sportId: padel.id,
      name: 'Padel Court 1',
      slug: 'padel-court-1',
      bookingMode: 'REQUEST_TO_BOOK',
      slotDurationMinutes: 90,
      minimumDurationMinutes: 90,
      maximumDurationMinutes: 90,
      basePriceMinor: 40000,
      currency: 'EGP',
    });

    console.log('Seeding weekly availability (09:00 -> 01:00 next day, every day)...');
    for (const facility of [pitch1, pitch2]) {
      for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
        await createAvailabilityRule(facility.id, ownerActor, {
          dayOfWeek,
          startTime: '09:00',
          endTime: '01:00', // crosses midnight — demonstrates ADR-003's midnight-crossing handling
          isClosed: false,
        });
      }
    }
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      await createAvailabilityRule(padelCourt.id, ownerActor, {
        dayOfWeek,
        startTime: '08:00',
        endTime: '23:00',
        isClosed: false,
      });
    }

    console.log('Seeding a maintenance closure on Football Pitch 1 tomorrow morning...');
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(6, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000);
    await createAvailabilityException(pitch1.id, ownerActor, {
      kind: 'MAINTENANCE',
      startsAt: tomorrow,
      endsAt: tomorrowEnd,
      isClosed: true,
      reason: 'Pitch resurfacing',
    });

    console.log('Seeding receptionist...');
    const receptionistId = await seedUser(sql, 'Salma Adel', 'salma@elnady.local', '+201007654321');
    await db
      .insert(venueMembers)
      .values({ venueId: venue.id, userId: receptionistId, role: 'RECEPTIONIST' });

    console.log('Seeding a second venue owner + venue (PENDING_REVIEW)...');
    const secondOwnerId = await seedUser(
      sql,
      'Mona Fathy',
      'mona@victorycourts.local',
      '+201002223344',
    );
    const [secondVenue] = await db
      .insert(venues)
      .values({
        slug: 'victory-courts',
        name: 'Victory Courts',
        description: 'Padel and tennis courts in Heliopolis.',
        city: 'Cairo',
        district: 'Heliopolis',
        status: 'PENDING_REVIEW',
        createdBy: secondOwnerId,
      })
      .returning();
    await db
      .insert(venueMembers)
      .values({ venueId: secondVenue.id, userId: secondOwnerId, role: 'OWNER' });

    console.log('Seeding a plain customer...');
    const customerId = await seedUser(sql, 'Ahmed Mostafa', 'ahmed@example.local', '+201009998888');
    const customerActor = { userId: customerId, isPlatformAdmin: false };

    console.log('Seeding bookings (via the real booking domain services)...');
    const inThreeDays = new Date();
    inThreeDays.setUTCDate(inThreeDays.getUTCDate() + 3);
    inThreeDays.setUTCHours(16, 0, 0, 0); // 18:00 Cairo — well inside pitch2's 09:00-01:00 window

    // A still-open request, demonstrating REQUESTED never blocks the slot for anyone else.
    await createBookingRequest(customerActor, {
      facilityId: pitch2.id,
      startAt: inThreeDays,
      durationMinutes: 60,
      customerName: 'Ahmed Mostafa',
      customerPhone: '+201009998888',
    });

    // A confirmed booking, going through the same transitionBooking() every
    // confirm in the product goes through.
    const inFourDays = new Date(inThreeDays);
    inFourDays.setUTCDate(inFourDays.getUTCDate() + 1);
    const confirmedRequest = await createBookingRequest(customerActor, {
      facilityId: pitch2.id,
      startAt: inFourDays,
      durationMinutes: 60,
      customerName: 'Ahmed Mostafa',
      customerPhone: '+201009998888',
    });
    await transitionBooking({
      bookingId: confirmedRequest.id,
      targetStatus: 'CONFIRMED',
      actor: ownerActor,
    });

    // A walk-in booking the receptionist takes over the counter — no
    // marketplace account, source=MANUAL, straight to CONFIRMED.
    const inFiveDays = new Date(inThreeDays);
    inFiveDays.setUTCDate(inFiveDays.getUTCDate() + 2);
    await createManualBooking(
      venue.id,
      { userId: receptionistId, isPlatformAdmin: false },
      {
        facilityId: padelCourt.id,
        startAt: inFiveDays,
        durationMinutes: 90,
        customerName: 'Walk-in — Youssef Adly',
        customerPhone: '+201005556666',
      },
    );

    console.log('Done.');
  } finally {
    await sql.end({ timeout: 5 });
    // createFacility() above went through getDb() (src/lib/db/client.ts),
    // a second, separate connection pool from this script's own `sql` —
    // without closing it too, the process hangs on an open handle instead
    // of exiting.
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
