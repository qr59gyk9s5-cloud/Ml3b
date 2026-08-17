import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { getTestDb, closeTestDatabase, resetTestDatabase } from '@/testing/db';
import { createTestUser } from '@/testing/factories';
import { notifications } from '@/lib/db/schema';
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from './queries';

async function seedNotification(userId: string, overrides: { readAt?: Date | null } = {}) {
  const db = getTestDb();
  const [row] = await db
    .insert(notifications)
    .values({
      userId,
      type: 'BOOKING_CONFIRMED',
      channel: 'IN_APP',
      status: 'SENT',
      readAt: overrides.readAt,
    })
    .returning();
  return row;
}

describe('notification queries (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('lists only the caller-relevant IN_APP notifications, most recent first', async () => {
    const user = await createTestUser('User');
    const other = await createTestUser('Other');
    await seedNotification(user.id);
    await seedNotification(other.id);

    const list = await listNotificationsForUser(user.id);
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe(user.id);
  });

  it('counts only unread notifications', async () => {
    const user = await createTestUser('User');
    await seedNotification(user.id, { readAt: null });
    await seedNotification(user.id, { readAt: new Date() });

    expect(await countUnreadNotifications(user.id)).toBe(1);
  });

  it('marks a notification read, only for its owner', async () => {
    const user = await createTestUser('User');
    const stranger = await createTestUser('Stranger');
    const notification = await seedNotification(user.id, { readAt: null });

    await expect(markNotificationRead(notification.id, stranger.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await markNotificationRead(notification.id, user.id);
    const list = await listNotificationsForUser(user.id);
    expect(list.find((n) => n.id === notification.id)?.readAt).not.toBeNull();
  });

  it('marks every notification read for a user in one call', async () => {
    const user = await createTestUser('User');
    await seedNotification(user.id, { readAt: null });
    await seedNotification(user.id, { readAt: null });

    await markAllNotificationsRead(user.id);

    expect(await countUnreadNotifications(user.id)).toBe(0);
  });
});
