'use client';

/**
 * A native date picker next to the day-chip strip — the chips only cover
 * a short rolling window (see BookFacilityPage), so this is the only way
 * to book something further out. Client-only because it needs
 * onChange-triggered navigation; the chips above stay plain server-
 * rendered <Link>s and keep working with JS disabled.
 */
import { useRouter } from 'next/navigation';

type Props = {
  basePath: string;
  date: string;
  duration: number;
  min: string;
};

export function DateJumpInput({ basePath, date, duration, min }: Props) {
  const router = useRouter();
  return (
    <input
      type="date"
      aria-label="Pick any date"
      defaultValue={date}
      min={min}
      onChange={(e) => {
        if (e.target.value) router.push(`${basePath}?date=${e.target.value}&duration=${duration}`);
      }}
      className="focus-visible:outline-accent rounded-xl border border-line bg-surface px-3 py-2 font-display text-xs font-bold text-foreground-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    />
  );
}
