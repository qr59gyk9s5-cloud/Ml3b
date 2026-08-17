import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ScrollText } from 'lucide-react';
import { getSessionActor } from '@/lib/auth/session';
import { listAuditLogs } from '@/domain/admin/queries';

export const metadata: Metadata = { title: 'Admin — Audit log — Sports Venue Marketplace' };

type Props = { searchParams: Promise<{ resourceType?: string }> };

const RESOURCE_TYPES = ['booking', 'venue', 'user'];

export default async function AdminAuditLogPage({ searchParams }: Props) {
  const { resourceType } = await searchParams;
  const actor = await getSessionActor();
  if (!actor) redirect('/sign-in?next=/admin/audit-log');
  if (!actor.isPlatformAdmin) redirect('/');

  const logs = await listAuditLogs(
    { resourceType: resourceType || undefined, limit: 100 },
    { userId: actor.userId, isPlatformAdmin: true },
  );

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2" action="/admin/audit-log">
        <select
          name="resourceType"
          defaultValue={resourceType ?? ''}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">All resource types</option>
          {RESOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="focus-visible:outline-accent rounded-xl bg-accent px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Filter
        </button>
      </form>

      {logs.length === 0 ? (
        <p className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center text-xs text-muted">
          <ScrollText className="h-5 w-5 text-faint" aria-hidden />
          No audit log entries{resourceType ? ` for ${resourceType}` : ''} yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => (
            <li
              key={log.id}
              className="rounded-xl border border-line bg-surface p-3 text-xs shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-foreground">{log.action}</span>
                <span className="text-faint">
                  {new Intl.DateTimeFormat('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(log.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 text-muted">
                {log.resourceType}
                {log.resourceId ? ` · ${log.resourceId}` : ''} — by {log.actorName ?? log.actorType}
              </p>
              {Object.keys(log.metadata as object).length > 0 ? (
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-surface-2 p-2 text-[10px] text-muted">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
