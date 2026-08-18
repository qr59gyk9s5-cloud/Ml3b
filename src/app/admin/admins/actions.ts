'use server';

import { redirect } from 'next/navigation';
import { getSessionActor } from '@/lib/auth/session';
import { grantPlatformAdmin, revokePlatformAdmin } from '@/domain/admin/users';
import { DomainError } from '@/domain/errors';

export async function grantAdminAction(formData: FormData) {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/admins');
  if (!actor.isPlatformAdmin) redirect('/');

  const email = String(formData.get('email') ?? '');

  try {
    await grantPlatformAdmin({ email, actor: { userId: actor.userId, isPlatformAdmin: true } });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`/admin/admins?error=${encodeURIComponent(message)}`);
  }
  redirect('/admin/admins?done=1');
}

export async function revokeAdminAction(formData: FormData) {
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/admins');
  if (!actor.isPlatformAdmin) redirect('/');

  const targetUserId = String(formData.get('targetUserId') ?? '');

  try {
    await revokePlatformAdmin({
      targetUserId,
      actor: { userId: actor.userId, isPlatformAdmin: true },
    });
  } catch (err) {
    const message =
      err instanceof DomainError ? err.message : 'Something went wrong. Please try again.';
    redirect(`/admin/admins?error=${encodeURIComponent(message)}`);
  }
  redirect('/admin/admins?done=1');
}
