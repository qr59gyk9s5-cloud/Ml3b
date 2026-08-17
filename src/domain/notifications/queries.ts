/**
 * Read/write access to a signed-in user's own notifications. Every
 * function takes the caller's userId and only ever touches that user's
 * rows — there's no "view someone else's notifications" case, not even
 * for admins (RLS in 0009_notifications_rls.sql mirrors this, but
 * getDb() doesn't go through RLS — this check is the real one).
 */
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { notifications, type Notification } from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';

export async function listNotificationsForUser(userId: string): Promise<Notification[]> {
  const db = getDb();
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.channel, 'IN_APP')))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.channel, 'IN_APP'),
        isNull(notifications.readAt),
      ),
    );
  return row?.value ?? 0;
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(notifications).where(eq(notifications.id, notificationId));
  if (!row) throw new DomainError('NOT_FOUND', 'Notification not found.');
  if (row.userId !== userId) throw new DomainError('FORBIDDEN', 'Not your notification.');

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, notificationId));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.channel, 'IN_APP')));
}
