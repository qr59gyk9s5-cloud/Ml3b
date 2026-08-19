'use client';

/**
 * Auto-detects the visitor's location via the browser Geolocation API,
 * once, shared app-wide through context so the header's location pill
 * and any page that sorts/labels by distance (src/lib/geo/distance.ts)
 * read the same value instead of each prompting separately.
 *
 * Never a source of truth for anything: this is a convenience the
 * visitor can always override or deny, purely presentational (nearest
 * venues first, a "Nasr City, Cairo" label) — never gates browsing,
 * booking, or any business rule. Denied/unsupported/failed all degrade
 * to the same thing: no coordinates, fall back to the plain "Cairo,
 * Egypt" default the app already shows everyone.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Coordinates } from '@/lib/geo/distance';

type LocationStatus = 'idle' | 'detecting' | 'granted' | 'denied' | 'unsupported' | 'error';

interface LocationState {
  status: LocationStatus;
  coords: Coordinates | null;
  label: string | null;
  /** Re-request location — the header's "Change" control. */
  detect: () => void;
}

const LocationContext = createContext<LocationState>({
  status: 'idle',
  coords: null,
  label: null,
  detect: () => {},
});

const STORAGE_KEY = 'playcairo:location';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — coordinates go stale, not the whole session

interface CachedLocation {
  coords: Coordinates;
  label: string | null;
  storedAt: number;
}

function readCache(): CachedLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedLocation;
    if (Date.now() - parsed.storedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry: CachedLocation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Best-effort — private browsing / storage disabled just means no
    // cache, not a broken feature.
  }
}

async function reverseGeocode(coords: Coordinates): Promise<string | null> {
  try {
    const res = await fetch(`/api/geo/reverse?lat=${coords.lat}&lng=${coords.lng}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { locality: string | null; city: string | null };
    if (data.locality && data.city) return `${data.locality}, ${data.city}`;
    return data.locality ?? data.city ?? null;
  } catch {
    return null;
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  // Lazy initializers (not an effect) so a cache hit never causes an
  // extra render — the state starts correct on the very first paint.
  const [status, setStatus] = useState<LocationStatus>(() => (readCache() ? 'granted' : 'idle'));
  const [coords, setCoords] = useState<Coordinates | null>(() => readCache()?.coords ?? null);
  const [label, setLabel] = useState<string | null>(() => readCache()?.label ?? null);

  const detect = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const next: Coordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCoords(next);
        setStatus('granted');
        const resolvedLabel = await reverseGeocode(next);
        setLabel(resolvedLabel);
        writeCache({ coords: next, label: resolvedLabel, storedAt: Date.now() });
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: CACHE_TTL_MS },
    );
  }, []);

  useEffect(() => {
    // Only kick off a fresh browser prompt if the lazy initializers above
    // didn't already find a cached location — never re-prompted on every
    // navigation, and "Change" (detect()) is the only other trigger.
    //
    // react-hooks/set-state-in-effect flags this because detect() sets
    // status='detecting' synchronously before the (inherently async)
    // browser permission prompt — legitimate here, not the
    // cascading-render footgun the rule targets: this is exactly
    // "synchronize with an external system" (the browser's geolocation
    // API), a one-time transition, not a loop.
    if (status === 'idle') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      detect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LocationContext.Provider value={{ status, coords, label, detect }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation(): LocationState {
  return useContext(LocationContext);
}
