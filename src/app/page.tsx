/**
 * Temporary placeholder landing page.
 *
 * The real customer-facing home page (search, venue listings) is built in
 * Phase 6, after the availability and booking domains exist and are tested.
 * This page only exists so the Phase 1 foundation has something real to
 * build, lint, and deploy — it intentionally contains no booking UI or
 * mocked data.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">Sports Venue Booking Marketplace</h1>
      <p className="max-w-md text-sm text-neutral-500">
        Under construction. The booking engine and customer experience are not built yet.
      </p>
    </main>
  );
}
