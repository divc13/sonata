import type { SonataListingWithSong } from "@infinitunes/types";

/**
 * Pure market-grid view state. Sort and filter live in the URL (`?sort=` and
 * `?filter=`), so the server grid and the control links agree without client
 * state, and every view can be shared or reloaded as-is.
 */

export const MARKET_SORTS = ["recent", "price", "earnings"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

export const MARKET_FILTERS = ["all", "owned", "created"] as const;
export type MarketFilter = (typeof MARKET_FILTERS)[number];

export const DEFAULT_MARKET_SORT: MarketSort = "recent";
export const DEFAULT_MARKET_FILTER: MarketFilter = "all";

export const MARKET_SORT_LABELS: Record<MarketSort, string> = {
  recent: "Recent",
  price: "Price",
  earnings: "Earnings",
};

export const MARKET_FILTER_LABELS: Record<MarketFilter, string> = {
  all: "All masters",
  owned: "Owned by you",
  created: "Created by you",
};

/** The first value of a repeated query parameter (`?sort=a&sort=b`). */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Unknown or missing values fall back to the default view. */
export function parseMarketSort(value: unknown): MarketSort {
  return typeof value === "string" &&
    (MARKET_SORTS as readonly string[]).includes(value)
    ? (value as MarketSort)
    : DEFAULT_MARKET_SORT;
}

export function parseMarketFilter(value: unknown): MarketFilter {
  return typeof value === "string" &&
    (MARKET_FILTERS as readonly string[]).includes(value)
    ? (value as MarketFilter)
    : DEFAULT_MARKET_FILTER;
}

/** Defaults carry no query string, so `/market` stays the canonical link. */
export function marketHref(sort: MarketSort, filter: MarketFilter): string {
  const params = new URLSearchParams();
  if (sort !== DEFAULT_MARKET_SORT) params.set("sort", sort);
  if (filter !== DEFAULT_MARKET_FILTER) params.set("filter", filter);
  const query = params.toString();
  return query ? `/market?${query}` : "/market";
}

/** Micro-USDC amounts are text; compare as integers, never as floats. */
function compareMicro(a: string, b: string): number {
  try {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left === right) return 0;
    return left < right ? -1 : 1;
  } catch {
    return a.localeCompare(b);
  }
}

/**
 * "Owned by you" is the master's current owner; "Created by you" is the
 * creator account stored when the master was minted.
 */
export function filterMarketListings(
  listings: readonly SonataListingWithSong[],
  filter: MarketFilter,
  viewerAccountId: string,
): SonataListingWithSong[] {
  switch (filter) {
    case "owned":
      return listings.filter(
        (listing) => listing.song.ownerAccountId === viewerAccountId,
      );
    case "created":
      return listings.filter(
        (listing) => listing.song.creatorAccountId === viewerAccountId,
      );
    default:
      return [...listings];
  }
}

/** Newest listing first, cheapest first, or biggest trailing earnings first. */
export function sortMarketListings(
  listings: readonly SonataListingWithSong[],
  sort: MarketSort,
): SonataListingWithSong[] {
  const sorted = [...listings];

  switch (sort) {
    case "price":
      sorted.sort(
        (a, b) =>
          compareMicro(a.priceUsdc, b.priceUsdc) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
      return sorted;
    case "earnings":
      sorted.sort(
        (a, b) =>
          compareMicro(b.song.earnings30dUsdc, a.song.earnings30dUsdc) ||
          b.id - a.id,
      );
      return sorted;
    default:
      sorted.sort((a, b) => {
        const byDate = b.createdAt.getTime() - a.createdAt.getTime();
        return byDate !== 0 ? byDate : b.id - a.id;
      });
      return sorted;
  }
}
