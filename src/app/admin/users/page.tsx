import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Search, ShieldOff, ShieldCheck } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { findUserByEmail } from '@/domain/admin/users';
import { suspendUserAction, unsuspendUserAction } from './actions';

export const metadata: Metadata = { title: 'Admin — Users' };

type Props = { searchParams: Promise<{ email?: string; error?: string; done?: string }> };

export default async function AdminUsersPage({ searchParams }: Props) {
  const { email, error, done } = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/users');
  if (!actor.isPlatformAdmin) redirect('/');

  const user = email
    ? await findUserByEmail(email, { userId: actor.userId, isPlatformAdmin: true })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <form className="flex gap-2" action="/admin/users">
        <input
          type="email"
          name="email"
          defaultValue={email ?? ''}
          placeholder="user@example.com"
          className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint"
        />
        <button
          type="submit"
          className="focus-visible:outline-accent flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Search className="h-4 w-4" aria-hidden />
          Search
        </button>
      </form>

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

      {email && !user ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
          No account found for &ldquo;{email}&rdquo;.
        </p>
      ) : null}

      {user ? (
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-sm font-bold text-foreground">{user.fullName}</p>
          <p className="text-xs text-muted">{user.phone ?? 'No phone on file'}</p>

          {user.suspendedAt ? (
            <div className="mt-3 rounded-lg bg-danger-wash p-3">
              <p className="text-xs font-bold text-danger">Suspended</p>
              <p className="mt-0.5 text-xs text-danger/90">{user.suspendedReason}</p>
              <form action={unsuspendUserAction} className="mt-2">
                <input type="hidden" name="targetUserId" value={user.id} />
                <input type="hidden" name="email" value={email ?? ''} />
                <button
                  type="submit"
                  className="focus-visible:outline-accent flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Unsuspend
                </button>
              </form>
            </div>
          ) : (
            <form
              action={suspendUserAction}
              className="mt-4 flex flex-col gap-2 border-t border-line pt-4"
            >
              <input type="hidden" name="targetUserId" value={user.id} />
              <input type="hidden" name="email" value={email ?? ''} />
              <label className="text-xs font-bold text-foreground">Suspend this account</label>
              <textarea
                name="reason"
                required
                placeholder="Why? This is required and permanently recorded in the audit log."
                rows={2}
                className="rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-foreground placeholder:text-faint"
              />
              <button
                type="submit"
                className="focus-visible:outline-accent flex items-center gap-1.5 self-start rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                Suspend
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
