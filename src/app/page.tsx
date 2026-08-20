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

// One consistent row of icon-chip + label items — how-it-works and the
// trust stats used to be two separate rows with two different icon
// treatments (chips vs. bare colored glyphs); merged into one so the
// hero reads as one deliberate strip, not two competing ones. `href` is
// only set on the items that actually link somewhere.
const HERO_CHIPS = [
  { icon: MousePointerClick, label: 'Find a slot', tone: 'bg-accent' },
  { icon: Zap, label: 'Send a request', tone: 'bg-floodlight' },
  { icon: CalendarCheck, label: 'Play', tone: 'bg-spectrum-violet' },
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
  // Live sports only — sportCategories now also includes "coming soon"
  // ones (zero venues), which shouldn't inflate this trust stat.
  const totalSports = sportCategories.filter((c) => c.venueCount > 0).length;
  const hasSelection = Boolean(sp.sport || sp.district);

  return (
    <main>
      <section className="relative overflow-hidden bg-ink">
        {/* Glow backdrop — saturated color (not pale washes, which read
         * as near-invisible on a dark surface) so the dark hero still
         * feels vivid rather than just "a dark box". */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse 650px 420px at 10% -10%, color-mix(in oklch, var(--accent) 55%, transparent), transparent 65%), radial-gradient(ellipse 550px 400px at 100% 0%, color-mix(in oklch, var(--floodlight) 45%, transparent), transparent 60%), radial-gradient(ellipse 500px 500px at 85% 100%, color-mix(in oklch, var(--spectrum-violet) 45%, transparent), transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute -top-20 right-[-50px] h-64 w-64 rounded-full opacity-45 blur-[2px]"
          style={{
            background:
              'radial-gradient(circle at 32% 30%, var(--accent-glow), var(--accent-strong))',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute top-20 right-32 h-32 w-32 rounded-full opacity-35 blur-[2px]"
          style={{
            background:
              'radial-gradient(circle at 32% 30%, var(--floodlight), var(--floodlight-strong))',
            animationDelay: '0.6s',
            animationDuration: '9s',
          }}
        />
        <div
          aria-hidden
          className="animate-float pointer-events-none absolute -bottom-14 left-6 h-32 w-32 rounded-full opacity-35 blur-[2px]"
          style={{
            background:
              'radial-gradient(circle at 32% 30%, var(--spectrum-violet), var(--spectrum-violet))',
            animationDelay: '1.4s',
            animationDuration: '8s',
          }}
        />
        {/* Eases into the light page below instead of a hard dark-to-light
         * cut — softens how much of the first screen reads as "dark". */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--background))' }}
        />

        <div className="animate-rise-up relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
          <p className="mb-3 flex items-center gap-1.5 font-display text-xs font-bold tracking-wide text-accent-bright uppercase">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Cairo, Egypt
          </p>
          <h1 className="max-w-2xl font-display text-4xl font-extrabold tracking-tight text-on-ink sm:text-5xl">
            Find your court, and{' '}
            <span className="bg-gradient-to-br from-accent-bright via-floodlight to-spectrum-violet bg-clip-text text-transparent">
              play in seconds
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-on-ink-muted">
            Real-time availability from venues across Cairo — send a request, the venue confirms,
            you play.
          </p>

          <div className="mt-6 flex max-w-md items-center gap-2 rounded-2xl bg-surface p-1.5 shadow-lg">
            <Search className="ml-2 h-4 w-4 flex-none text-faint" aria-hidden />
            <input
              type="text"
              disabled
              placeholder="Search by venue or district (coming soon)"
              className="w-full bg-transparent px-1 py-1.5 text-sm text-foreground placeholder:text-faint focus:outline-none"
            />
            <LocateButton />
          </div>

          {/* One row: how-it-works + trust stats, same icon-chip
           * treatment throughout instead of two visually different rows. */}
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            {HERO_CHIPS.map(({ icon: Icon, label, tone }, i) => (
              <span key={label} className="flex items-center gap-1.5">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-lg text-white ${tone}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="text-xs font-bold text-on-ink">{label}</span>
                {i < HERO_CHIPS.length - 1 ? (
                  <span aria-hidden className="text-on-ink-muted">
                    →
                  </span>
                ) : null}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-4">
            <span className="flex items-center gap-1.5 text-xs font-bold text-on-ink-muted">
              <ShieldCheck className="h-4 w-4 text-accent-bright" aria-hidden />
              {totalVenues} live venue{totalVenues === 1 ? '' : 's'}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-bold text-on-ink-muted">
              <Sparkles className="h-4 w-4 text-accent-bright" aria-hidden />
              {totalSports} sport{totalSports === 1 ? '' : 's'}
            </span>
            <Link
              href="/games"
              className="flex items-center gap-1.5 text-xs font-bold text-on-ink transition-colors hover:text-accent-bright"
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
                if (cat.venueCount === 0) {
                  // Not a filter link — nothing to browse to yet. Shown
                  // as a real platform sport, just not live, rather than
                  // silently omitted (see listSportCategories's doc
                  // comment).
                  return (
                    <div
                      key={cat.code}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-surface-2/60 p-3.5 text-center opacity-70"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-faint">
                        <SportIcon code={cat.code} className="h-5 w-5" />
                      </span>
                      <span className="font-display text-xs font-bold text-muted">
                        {cat.displayName}
                      </span>
                      <span className="rounded-full bg-surface px-2 py-0.5 text-[9px] font-bold tracking-wide text-faint uppercase">
                        Coming soon
                      </span>
                    </div>
                  );
                }
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
          {venues.length === 0 ? (
            <>
              <h2 className="mb-4 font-display text-sm font-bold tracking-wide text-faint uppercase">
                Venues
              </h2>
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
                <span aria-hidden className="text-2xl">
                  🏟️
                </span>
                <p className="text-sm font-medium text-foreground">No venues are live yet</p>
                <p className="max-w-sm text-xs text-muted">
                  Venues appear here once a platform admin approves them. Check back soon.
                </p>
              </div>
            </>
          ) : hasSelection ? (
            <>
              <h2 className="mb-4 font-display text-sm font-bold tracking-wide text-faint uppercase">
                {filtered.length} venue{filtered.length === 1 ? '' : 's'} match
              </h2>
              <VenueGrid venues={filtered} />
            </>
          ) : (
            // Nothing renders until a sport or area is picked above —
            // browsing is guided through the category cards rather than
            // dumping the full venue list on first load.
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-wash text-accent-strong">
                <MousePointerClick className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-sm font-bold text-foreground">Pick a sport or area above</p>
              <p className="max-w-sm text-xs text-muted">
                Venues show up here once you choose a sport or area to browse.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
