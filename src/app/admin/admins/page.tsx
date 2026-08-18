import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldPlus, ShieldMinus } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { listPlatformAdmins } from '@/domain/admin/users';
import { grantAdminAction, revokeAdminAction } from './actions';

export const metadata: Metadata = { title: 'Admin — Admins' };

type Props = { searchParams: Promise<{ error?: string; done?: string }> };

export default async function AdminAdminsPage({ searchParams }: Props) {
  const { error, done } = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/admins');
  if (!actor.isPlatformAdmin) redirect('/');

  const admins = await listPlatformAdmins({ userId: actor.userId, isPlatformAdmin: true });

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="rounded-xl bg-danger-wash px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="rounded-xl bg-accent-wash px-3 py-2 text-xs font-semibold text-accent-strong">
          Done.
        </p>
      ) : null}

      <section>
        <h2 className="mb-2.5 text-sm font-bold text-foreground">Grant admin access</h2>
        <form action={grantAdminAction} className="flex gap-2">
          <input
            type="email"
            name="email"
            required
            placeholder="user@example.com — must already have an account"
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint"
          />
          <button
            type="submit"
            className="focus-visible:outline-accent flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <ShieldPlus className="h-4 w-4" aria-hidden />
            Grant
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2.5 text-sm font-bold text-foreground">
          Current admins ({admins.length})
        </h2>
        <ul className="flex flex-col gap-2.5">
          {admins.map(({ profile, grantedAt, grantedByName }) => (
            <li
              key={profile.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-sm"
            >
              <div>
                <p className="text-sm font-bold text-foreground">{profile.fullName}</p>
                <p className="text-xs text-muted">
                  Granted{' '}
                  {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(grantedAt)}
                  {grantedByName ? ` by ${grantedByName}` : ''}
                </p>
              </div>
              {profile.id === actor.userId ? (
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-faint">
                  You
                </span>
              ) : (
                <form action={revokeAdminAction}>
                  <input type="hidden" name="targetUserId" value={profile.id} />
                  <button
                    type="submit"
                    className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <ShieldMinus className="h-3.5 w-3.5" aria-hidden />
                    Revoke
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
