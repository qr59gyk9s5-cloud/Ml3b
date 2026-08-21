/**
 * Overrides the root loading.tsx (the sport-ball spinner) for the whole
 * /dashboard subtree. That spinner is right for the customer-facing
 * marketplace, but it flashed on every confirm/reject/add-booking/staff
 * action here — a staff tool that's used dozens of times a shift doesn't
 * want a decorative animation between every click and its result. Next
 * uses the most specific loading.tsx for a route, so this segment (and
 * everything nested under it) renders nothing instead.
 */
export default function DashboardLoading() {
  return null;
}
