import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="border-line/80 sticky top-0 z-10 border-b bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span aria-hidden className="text-lg">
            🏟️
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-foreground">
            Sports Venue Marketplace
          </span>
        </Link>
        <span className="hidden text-xs font-medium text-faint sm:inline">Cairo, Egypt</span>
      </div>
    </header>
  );
}
