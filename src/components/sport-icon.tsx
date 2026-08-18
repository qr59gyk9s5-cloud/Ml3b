/**
 * A glyph per sport, for venue/facility cards. Lucide doesn't ship
 * sport-specific icons (no literal football/basketball/tennis-ball
 * icons) — these are close visual stand-ins, not literal depictions.
 * Falls back to a generic activity icon for any sport code not listed
 * here, so a newly added sport never breaks rendering.
 *
 * A real, statically-declared component (not a variable holding a
 * dynamically-resolved component type) — react-hooks/static-components
 * requires that, even though every branch here is a stable, module-level
 * icon reference and would have been safe either way.
 */
import { Activity, CircleDot, Goal, Volleyball } from 'lucide-react';

export function SportIcon({ code, className }: { code: string; className?: string }) {
  switch (code) {
    case 'football':
      return <Goal className={className} aria-hidden />;
    case 'basketball':
      return <Volleyball className={className} aria-hidden />;
    case 'padel':
    case 'tennis':
      return <CircleDot className={className} aria-hidden />;
    default:
      return <Activity className={className} aria-hidden />;
  }
}

/**
 * A tone (wash background + matching text) per sport, cycled from the
 * palette's spectrum tokens (src/app/globals.css) purely so a grid of
 * sport badges reads as colorful and alive rather than one flat green
 * wash — never meaningful (a sport isn't "the coral one"), just a
 * stable per-code assignment. Any code not listed falls back to the
 * brand accent, so a newly added sport never breaks styling.
 */
const SPORT_TONES: Record<string, { bg: string; text: string }> = {
  football: { bg: 'bg-lime-wash', text: 'text-lime-ink' },
  basketball: { bg: 'bg-spectrum-coral-wash', text: 'text-spectrum-coral' },
  padel: { bg: 'bg-spectrum-sky-wash', text: 'text-spectrum-sky' },
  tennis: { bg: 'bg-spectrum-violet-wash', text: 'text-spectrum-violet' },
};

export function sportTone(code: string): { bg: string; text: string } {
  return SPORT_TONES[code] ?? { bg: 'bg-accent-wash', text: 'text-accent-strong' };
}
