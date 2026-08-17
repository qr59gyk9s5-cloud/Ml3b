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
