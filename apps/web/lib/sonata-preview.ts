/**
 * Free-tier preview rules for Sonata masters, kept pure so the player and its
 * tests share one definition. Nothing here touches the audio element.
 */

/** Seconds of a Sonata master a listener without an active pass may hear. */
export const PREVIEW_SECONDS = 30;

/** Queue entries for Sonata masters carry this URL prefix. */
export const SONATA_MASTER_PREFIX = "/master/";

/**
 * The token id of a Sonata master queue entry, or `null` for anything else.
 * Only `/master/<token>` is a Sonata entry: JioSaavn song URLs keep their full
 * playback.
 */
export function sonataTokenIdFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url || !url.startsWith(SONATA_MASTER_PREFIX)) return null;
  const [token] = url.slice(SONATA_MASTER_PREFIX.length).split(/[/?#]/);
  return token ? token : null;
}

/** A preview seek never passes the free-tier limit. */
export function clampPreviewSeek(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, PREVIEW_SECONDS);
}

/**
 * Whether a cached pass still grants full tracks. `expiresAt` arrives as a
 * `Date` over tRPC (superjson), but accepting a string or number keeps callers
 * and fixtures honest.
 */
export function isPassActive(
  expiresAt: Date | string | number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (expiresAt === null || expiresAt === undefined) return false;
  const expiry =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > now;
}
