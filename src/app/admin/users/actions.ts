'use server';

import { redirect } from 'next/navigation';
import { getSessionActor } from '@/lib/auth/session';
import { suspendUser, unsuspendUser } from '@/domain/admin/users';
import { DomainError } from '@/domain/errors';

export async function suspendUserAction(formData: FormData) {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/users');
  if (!actor.isPlatformAdmin) redirect('/');

  const email = String(formData.get('email') ?? '');
  const targetUserId = String(formData.get('targetUserId') ?? '');
  const reason = String(formData.get('reason') ?? '');

  try {
    await suspendUser({
      targetUserId,
      reason,
      actor: { userId: actor.userId, isPlatformAdmin: true },
    });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(
      `/admin/users?email=${encodeURIComponent(email)}&error=${encodeURIComponent(message)}`,
    );
  }
  redirect(`/admin/users?email=${encodeURIComponent(email)}&done=1`);
}

export async function unsuspendUserAction(formData: FormData) {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/users');
  if (!actor.isPlatformAdmin) redirect('/');

  const email = String(formData.get('email') ?? '');
  const targetUserId = String(formData.get('targetUserId') ?? '');

  try {
    await unsuspendUser({ targetUserId, actor: { userId: actor.userId, isPlatformAdmin: true } });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(
      `/admin/users?email=${encodeURIComponent(email)}&error=${encodeURIComponent(message)}`,
    );
  }
  redirect(`/admin/users?email=${encodeURIComponent(email)}&done=1`);
}
