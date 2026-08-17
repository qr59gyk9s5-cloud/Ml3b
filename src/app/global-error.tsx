'use client';

/**
 * Root-layout-level error boundary (Next.js file convention — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md's
 * "Global Error" section). Must be a Client Component and define its own
 * <html>/<body>; it replaces the root layout entirely when active, so it
 * can't rely on globals.css or the app's normal components. Without a
 * custom one, a crashed root layout falls back to Next's bare default
 * error UI — this gives users something on-brand instead.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          background: '#0f172a',
          color: '#f1f5f9',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
            We hit an unexpected error. Please try again — if it keeps happening, contact support.
          </p>
          {error.digest ? (
            <p style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '1.5rem' }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              background: '#22c55e',
              color: '#052e16',
              fontWeight: 600,
              padding: '0.6rem 1.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
