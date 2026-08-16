import Link from 'next/link';
import { listActiveVenues } from '@/domain/venue/queries';

/**
 * Public venue listing. Real data from the database (listActiveVenues
 * explicitly filters status=ACTIVE — see src/domain/venue/queries.ts) —
 * no mocked venues, no fabricated ratings. Search/filters and facility
 * pricing land with the venue domain (Phase 3) and availability (Phase 4)
 * work; this page is intentionally minimal until that data exists.
 */
export default async function Home() {
  const venues = await listActiveVenues();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          Find a pitch or court
        </h1>
        <p className="text-sm text-muted">Cairo, Egypt · request to book, confirmed by the venue</p>
      </div>

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
          {venues.map((venue) => (
            <li key={venue.id}>
              <Link
                href={`/venues/${venue.slug}`}
                className="focus-visible:outline-accent flex gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <div aria-hidden className="venue-thumb h-16 w-16 flex-none rounded-xl" />
                <div className="flex min-w-0 flex-col justify-center gap-0.5">
                  <span className="truncate text-sm font-bold text-foreground">{venue.name}</span>
                  <span className="truncate text-xs text-muted">
                    {[venue.district, venue.city].filter(Boolean).join(', ')}
                  </span>
                  <span className="text-[11px] text-faint">No reviews yet</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
