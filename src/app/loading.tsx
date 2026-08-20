/**
 * Next's route-level Suspense fallback — automatically shown while this
 * segment's async Server Component (page.tsx) is fetching, including
 * client-side navigations that hit the same route with new searchParams
 * (e.g. picking a sport/area filter on the home page). No JS wiring
 * needed: the framework mounts/unmounts this on its own. Root-level so
 * it covers every route in the app, not just one page.
 */
export default function Loading() {
  return <div aria-hidden className="route-loading-bar" />;
}
