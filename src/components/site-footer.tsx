import { Logo } from '@/components/logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 sm:px-6">
        <Logo size={22} />
        <p className="text-xs text-faint">
          Cairo, Egypt — pitches and courts, request-to-book, confirmed by the venue.
        </p>
      </div>
    </footer>
  );
}
