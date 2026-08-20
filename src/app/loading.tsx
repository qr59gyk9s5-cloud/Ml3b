import { Goal } from 'lucide-react';

/**
 * Next's route-level Suspense fallback — automatically shown while this
 * segment's async Server Component (page.tsx) is fetching, including
 * client-side navigations that hit the same route with new searchParams
 * (e.g. picking a sport/area filter on the home page). No JS wiring
 * needed: the framework mounts/unmounts this on its own. Root-level so
 * it covers every route in the app, not just one page.
 *
 * A spinning ball in a gradient badge, not a generic bar — same
 * icon-badge language used everywhere else in the app (see the
 * sport-icon.tsx tone badges), just animated. Respects
 * prefers-reduced-motion (see globals.css's .route-loading-spin rule).
 */
export default function Loading() {
  return (
    <div aria-hidden className="route-loading-badge">
      <Goal className="route-loading-spin h-5 w-5 text-white" />
    </div>
  );
}
