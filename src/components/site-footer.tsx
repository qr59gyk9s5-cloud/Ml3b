export function SiteFooter() {
  return (
    <footer className="border-t border-line py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-sm">
            🏟️
          </span>
          <span className="text-xs font-bold text-foreground">PlayCairo</span>
        </div>
        <p className="text-xs text-faint">
          Cairo, Egypt — pitches and courts, request-to-book, confirmed by the venue.
        </p>
      </div>
    </footer>
  );
}
