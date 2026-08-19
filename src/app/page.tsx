import Link from 'next/link';
import { MapPin, Search } from 'lucide-react';
import {
  listActiveVenuesWithSummary,
  listAreaCategories,
  listSportCategories,
} from '@/domain/venue/queries';
import { SportIcon, sportTone } from '@/components/sport-icon';
import { VenueGrid } from '@/components/venue-grid';
import { LocateButton } from '@/components/locate-button';

/**
 * Public venue browse: hero, real "browse by sport" / "browse by area"
 * categories (src/domain/venue/queries.ts — counted from actual live
 * venues, never a fixed list), and the venue grid, sorted by distance
 * client-side once the visitor's location is known
 * (src/components/venue-grid.tsx). ?sport=&district= filter server-side
 * — real filters, not decorative chips.
 */
type Props = {
  searchParams: Promise<{ sport?: string; district?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const sp = await searchParams;
  const [venues, sportCategories, areaCategories] = await Promise.all([
    listActiveVenuesWithSummary(),
    listSportCategories(),
    listAreaCategories(),
  ]);

  const filtered = venues.filter((v) => {
    if (sp.sport && !v.sportCodes.includes(sp.sport)) return false;
    if (sp.district && (v.venue.district ?? v.venue.city) !== sp.district) return false;
    return true;
  });

  return (
    <main>
      <section className="relative overflow-hidden border-b border-line bg-surface-2">
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute -top-16 right-[-40px] h-56 w-56 rounded-full opacity-40 blur-[2px]"
          style={{
            background:
              'radial-gradient(circle at 32% 30%, var(--accent-glow), var(--accent-strong))',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute top-24 right-24 h-28 w-28 rounded-full opacity-30 blur-[2px]"
          style={{
            background:
              'radial-gradient(circle at 32% 30%, var(--floodlight), var(--floodlight-strong))',
            animationDelay: '0.6s',
            animationDuration: '9s',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute -bottom-10 left-10 h-24 w-24 rounded-full opacity-30 blur-[2px]"
          style={{
            background: 'radial-gradient(circle at 32% 30%, var(--lime), var(--lime-strong))',
            animationDelay: '1.4s',
            animationDuration: '8s',
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="mb-2 flex items-center gap-1.5 font-display text-xs font-bold tracking-wide text-accent-strong uppercase">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Cairo, Egypt
          </p>
          <h1 className="max-w-xl font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Find your court, and play in seconds
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
            <LocateButton />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {sportCategories.length > 0 ? (
          <section className="pt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-sm font-bold tracking-wide text-faint uppercase">
                Browse by sport
              </h2>
              {sp.sport ? (
                <Link href="/" className="text-xs font-bold text-accent">
                  Clear
                </Link>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {sportCategories.map((cat) => {
                const active = sp.sport === cat.code;
                const tone = sportTone(cat.code);
                const href = active
                  ? '/'
                  : `/?sport=${cat.code}${sp.district ? `&district=${sp.district}` : ''}`;
                return (
                  <Link
                    key={cat.code}
                    href={href}
                    className={`focus-visible:outline-accent flex flex-col items-center gap-2 rounded-2xl border p-3.5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      active
                        ? 'border-transparent bg-lime text-lime-ink shadow-md'
                        : 'border-line bg-surface text-foreground hover:border-transparent hover:shadow-md'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        active ? 'bg-lime-ink/10 text-lime-ink' : `${tone.bg} ${tone.text}`
                      }`}
                    >
                      <SportIcon code={cat.code} className="h-4 w-4" />
                    </span>
                    <span className="font-display text-xs font-bold">{cat.displayName}</span>
                    <span
                      className={`text-[10px] font-semibold ${active ? 'text-lime-ink/70' : 'text-faint'}`}
                    >
                      {cat.venueCount} venue{cat.venueCount === 1 ? '' : 's'}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {areaCategories.length > 0 ? (
          <section className="pt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-sm font-bold tracking-wide text-faint uppercase">
                Browse by area
              </h2>
              {sp.district ? (
                <Link href="/" className="text-xs font-bold text-accent">
                  Clear
                </Link>
              ) : null}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {areaCategories.map((area, i) => {
                const active = sp.district === area.name;
                const href = active
                  ? '/'
                  : `/?district=${encodeURIComponent(area.name)}${sp.sport ? `&sport=${sp.sport}` : ''}`;
                const tones = [
                  'pitch-thumb',
                  'pitch-thumb tone-flood',
                  'pitch-thumb tone-ink',
                  'pitch-thumb tone-sky',
                  'pitch-thumb tone-lime',
                ];
                return (
                  <Link
                    key={area.name}
                    href={href}
                    className={`focus-visible:outline-accent relative flex h-24 w-40 flex-none flex-col justify-end overflow-hidden rounded-2xl p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tones[i % tones.length]} ${active ? 'ring-2 ring-accent ring-offset-2' : ''}`}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent"
                    />
                    <span className="relative font-display text-sm font-bold text-white">
                      {area.name}
                    </span>
                    <span className="relative text-[10px] font-semibold text-white/85">
                      {area.venueCount} venue{area.venueCount === 1 ? '' : 's'}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="py-8">
          <h2 className="mb-4 font-display text-sm font-bold tracking-wide text-faint uppercase">
            {filtered.length > 0
              ? `${filtered.length} venue${filtered.length === 1 ? '' : 's'}${sp.sport || sp.district ? ' match' : ' open now'}`
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
            <VenueGrid venues={filtered} />
          )}
        </section>
      </div>
    </main>
  );
}
