import Link from 'next/link';
import {
  CalendarCheck,
  MapPin,
  MousePointerClick,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import {
  listActiveVenuesWithSummary,
  listAreaCategories,
  listSportCategories,
} from '@/domain/venue/queries';
import { SportIcon, sportSolidTone, sportTone } from '@/components/sport-icon';
import { VenueGrid } from '@/components/venue-grid';
import { LocateButton } from '@/components/locate-button';

// Compact, single-row version — a full section with body copy per step
// read as too long for what it's saying; icon + word carries the same
// "find → request → play" idea inline, right in the hero.
const HOW_IT_WORKS = [
  { icon: MousePointerClick, label: 'Find a slot' },
  { icon: Zap, label: 'Send a request' },
  { icon: CalendarCheck, label: 'Play' },
] as const;

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

  const totalVenues = venues.length;
  const totalSports = sportCategories.length;

  return (
    <main>
      <section className="relative overflow-hidden border-b border-line bg-surface-2">
        {/* Mesh backdrop — a wash of color across the whole hero, not just
         * three small dots, so the first screen reads as vivid rather
         * than mostly white with a little decoration in the corner. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(ellipse 700px 420px at 15% -10%, var(--accent-wash), transparent 60%), radial-gradient(ellipse 600px 400px at 100% 0%, var(--floodlight-wash), transparent 50%), radial-gradient(ellipse 500px 500px at 90% 100%, var(--lime-wash), transparent 55%), radial-gradient(ellipse 400px 400px at 0% 100%, var(--spectrum-sky-wash), transparent 55%)',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute -top-20 right-[-50px] h-64 w-64 rounded-full opacity-50 blur-[2px]"
          style={{
            background:
              'radial-gradient(circle at 32% 30%, var(--accent-glow), var(--accent-strong))',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute top-20 right-32 h-32 w-32 rounded-full opacity-40 blur-[2px]"
          style={{
            background:
              'radial-gradient(circle at 32% 30%, var(--floodlight), var(--floodlight-strong))',
            animationDelay: '0.6s',
            animationDuration: '9s',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute -bottom-14 left-6 h-32 w-32 rounded-full opacity-40 blur-[2px]"
          style={{
            background: 'radial-gradient(circle at 32% 30%, var(--lime), var(--lime-strong))',
            animationDelay: '1.4s',
            animationDuration: '8s',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute top-1/2 left-1/3 h-20 w-20 rounded-full opacity-25 blur-[2px]"
          style={{
            background:
              'radial-gradient(circle at 32% 30%, var(--spectrum-sky), var(--spectrum-sky))',
            animationDelay: '2.2s',
            animationDuration: '10s',
          }}
        />

        <div className="animate-rise-up relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="mb-3 flex items-center gap-1.5 font-display text-xs font-bold tracking-wide text-accent-strong uppercase">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Cairo, Egypt
          </p>
          <h1 className="max-w-2xl font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Find your court, and{' '}
            <span className="bg-gradient-to-br from-accent via-floodlight to-lime-strong bg-clip-text text-transparent">
              play in seconds
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
            Real-time availability from venues across Cairo — send a request, the venue confirms,
            you play.
          </p>

          <div className="mt-6 flex max-w-md items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 shadow-md">
            <Search className="ml-2 h-4 w-4 flex-none text-faint" aria-hidden />
            <input
              type="text"
              disabled
              placeholder="Search by venue or district (coming soon)"
              className="w-full bg-transparent px-1 py-1.5 text-sm text-foreground placeholder:text-faint focus:outline-none"
            />
            <LocateButton />
          </div>

          {/* Compact "how it works" + trust stats, one row, icons carrying
           * the color instead of a whole separate section below. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            {HOW_IT_WORKS.map(({ icon: Icon, label }, i) => (
              <span
                key={label}
                className="flex items-center gap-1.5 text-xs font-bold text-foreground-soft"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-lg text-white ${
                    ['bg-accent-strong', 'bg-floodlight-strong', 'bg-spectrum-violet'][i]
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                {label}
                {i < HOW_IT_WORKS.length - 1 ? (
                  <span aria-hidden className="text-faint">
                    →
                  </span>
                ) : null}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line/70 pt-4">
            <span className="flex items-center gap-1.5 text-xs font-bold text-foreground-soft">
              <ShieldCheck className="h-4 w-4 text-accent-strong" aria-hidden />
              {totalVenues} live venue{totalVenues === 1 ? '' : 's'}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-bold text-foreground-soft">
              <Sparkles className="h-4 w-4 text-floodlight" aria-hidden />
              {totalSports} sport{totalSports === 1 ? '' : 's'}
            </span>
            <Link
              href="/games"
              className="flex items-center gap-1.5 text-xs font-bold text-spectrum-violet transition-colors hover:underline"
            >
              <Users className="h-4 w-4" aria-hidden />
              Open games — join a match
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {sportCategories.length > 0 ? (
          <section className="pt-6">
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
                    className={`focus-visible:outline-accent flex flex-col items-center gap-2 rounded-2xl border p-3.5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      active
                        ? 'border-transparent bg-lime text-lime-ink shadow-md'
                        : `border-line ${tone.bg} text-foreground hover:border-transparent hover:shadow-lg`
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${
                        active ? 'bg-lime-ink/10 text-lime-ink' : sportSolidTone(cat.code)
                      }`}
                    >
                      <SportIcon code={cat.code} className="h-5 w-5" />
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
          <section className="pt-6">
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

        <section className="pt-6">
          <Link
            href="/games"
            className="focus-visible:outline-accent group relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-spectrum-violet to-[#4f3591] p-6 shadow-lg transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span
              aria-hidden
              className="animate-float pointer-events-none absolute -top-8 right-8 h-28 w-28 rounded-full bg-white/10 blur-[2px]"
            />
            <span
              aria-hidden
              className="animate-float pointer-events-none absolute -bottom-10 right-32 h-20 w-20 rounded-full bg-white/10 blur-[2px]"
              style={{ animationDelay: '1s' }}
            />
            <div className="relative flex items-start gap-3 sm:items-center">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-white/15 text-white">
                <Users className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <p className="font-display text-lg font-extrabold text-white">
                  Don&apos;t have a full team?
                </p>
                <p className="mt-0.5 max-w-sm text-sm text-white/80">
                  Join an open game — split the cost, meet other players, only pay if the roster
                  fills.
                </p>
              </div>
            </div>
            <span className="btn-sheen relative flex-none rounded-xl bg-white px-4 py-2.5 font-display text-sm font-bold text-[#4f3591] transition-transform group-hover:-translate-y-0.5">
              Browse open games
            </span>
          </Link>
        </section>

        <section className="py-6">
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
