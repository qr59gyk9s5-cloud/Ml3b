'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionActor } from '@/lib/auth/session';
import { markAllNotificationsRead, markNotificationRead } from '@/domain/notifications/queries';
import { DomainError } from '@/domain/errors';

export async function markNotificationReadAction(formData: FormData) {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/notifications');

  const notificationId = String(formData.get('notificationId') ?? '');
  try {
    await markNotificationRead(notificationId, actor.userId);
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    // Not worth surfacing an error banner for a "mark read" click — just
    // leave the list as-is and let the next page load reflect reality.
  }
  // 'layout' (not just '/notifications'): the unread-count badge lives in
  // SiteHeader and BottomTabBar, both rendered from the root layout on
  // every route — a path-only revalidation wouldn't touch it.
  revalidatePath('/', 'layout');
  redirect('/notifications');
}

export async function markAllNotificationsReadAction() {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/notifications');

  await markAllNotificationsRead(actor.userId);
  revalidatePath('/', 'layout');
  redirect('/notifications');
}
