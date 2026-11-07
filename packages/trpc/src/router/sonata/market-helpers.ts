import type { SonataListingWithSong } from "@infinitunes/types";

export const LISTING_SORTS = ["recent", "price-asc", "price-desc"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

/**
 * Re-sorts typed listing rows in memory. Prices are micro-USDC **text**, so a
 * numeric comparison is required — a lexical SQL sort would order
 * `"500000"` after `"35000000"`.
 */
export function sortListings(
  listings: SonataListingWithSong[],
  sort: ListingSort,
): SonataListingWithSong[] {
  const sorted = [...listings];
  switch (sort) {
    case "price-asc":
      sorted.sort((a, b) => Number(a.priceUsdc) - Number(b.priceUsdc));
      return sorted;
    case "price-desc":
      sorted.sort((a, b) => Number(b.priceUsdc) - Number(a.priceUsdc));
      return sorted;
    default:
      sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return sorted;
  }
}
