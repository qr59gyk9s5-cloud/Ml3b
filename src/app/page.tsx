import Link from 'next/link';
import { MapPin, Search } from 'lucide-react';
import { listActiveVenuesWithSummary } from '@/domain/venue/queries';
import { SportIcon } from '@/components/sport-icon';
import { formatPriceMinor } from '@/lib/format/money';

/**
 * Public venue listing. Real data from the database (listActiveVenuesWithSummary
 * explicitly filters status=ACTIVE — see src/domain/venue/queries.ts) — no
 * mocked venues, no fabricated ratings. Search/filters are visual only for
 * now (no query params wired yet) — never fake results behind them.
 */
export default async function Home() {
  const venues = await listActiveVenuesWithSummary();

  return (
    <main>
      <section className="border-b border-line bg-surface-2">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-accent-strong uppercase">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Cairo, Egypt
          </p>
          <h1 className="max-w-xl text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Find a pitch or court, and request it in seconds
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
            Real-time availability from venues across Cairo. Send a request, the venue confirms, you
            play — no phone calls, no guesswork.
          </p>

          <div className="mt-6 flex max-w-md items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 shadow-sm">
            <Search className="ml-2 h-4 w-4 flex-none text-faint" aria-hidden />
            <input
              type="text"
              disabled
              placeholder="Search by venue or district (coming soon)"
              className="w-full bg-transparent px-1 py-1.5 text-sm text-foreground placeholder:text-faint focus:outline-none"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h2 className="mb-4 text-sm font-bold tracking-wide text-faint uppercase">
          {venues.length > 0
            ? `${venues.length} venue${venues.length === 1 ? '' : 's'} open now`
            : 'Venues'}
        </h2>

        {venues.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <span aria-hidden className="text-2xl">
              🏟️
            </span>
            <p className="text-sm font-medium text-foreground">No venues are live yet</p>
            <p className="max-w-sm text-xs text-muted">
              Venues appear here once a platform admin approves them. Check back soon.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {venues.map(({ venue, sportCodes, facilityCount, minPriceMinor, currency }) => (
              <li key={venue.id}>
                <Link
                  href={`/venues/${venue.slug}`}
                  className="focus-visible:outline-accent group flex gap-3.5 rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <div
                    aria-hidden
                    className="venue-thumb flex h-20 w-20 flex-none items-center justify-center rounded-xl text-2xl"
                  >
                    🏟️
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <span className="truncate text-sm font-bold text-foreground group-hover:text-accent-strong">
                      {venue.name}
                    </span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted">
                      <MapPin className="h-3 w-3 flex-none" aria-hidden />
                      {[venue.district, venue.city].filter(Boolean).join(', ')}
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      {sportCodes.length > 0 && (
                        <div className="flex items-center gap-1">
                          {sportCodes.slice(0, 4).map((code) => (
                            <span
                              key={code}
                              className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-wash text-accent-strong"
                              title={code}
                            >
                              <SportIcon code={code} className="h-3 w-3" />
                            </span>
                          ))}
                        </div>
                      )}
                      {facilityCount > 0 && (
                        <span className="text-[11px] text-faint">
                          {facilityCount} facilit{facilityCount === 1 ? 'y' : 'ies'}
                        </span>
                      )}
                    </div>
                    {minPriceMinor !== null && currency && (
                      <span className="mt-0.5 text-xs font-bold text-accent-strong">
                        From {formatPriceMinor(minPriceMinor, currency)}/hr
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
