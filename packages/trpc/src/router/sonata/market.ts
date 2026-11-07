import { sonataListing, sonataSong } from "@infinitunes/db/schema";
import type { SonataListingWithSong } from "@infinitunes/types";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";
import { withEarnings } from "./helpers";
import { LISTING_SORTS, sortListings } from "./market-helpers";

const listingInput = z.object({
  /** `recent`, `price-asc` or `price-desc`. */
  sort: z.enum(LISTING_SORTS).optional(),
});

/**
 * Active resale listings joined to their masters (and each master's trailing
 * earnings, because the listing card shows "includes $X in the song account").
 */
export const sonataMarketRouter = router({
  listings: publicProcedure
    .input(listingInput)
    .output(z.custom<SonataListingWithSong[]>())
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db
        .select({ listing: sonataListing, song: sonataSong })
        .from(sonataListing)
        .innerJoin(sonataSong, eq(sonataListing.tokenId, sonataSong.tokenId))
        .where(eq(sonataListing.active, true));

      const songsWithEarnings = await withEarnings(
        ctx.db,
        rows.map((row) => row.song),
      );

      // `innerJoin` preserves row alignment, so earnings map back by index.
      const listings = rows.map((row, index) => ({
        ...row.listing,
        song: songsWithEarnings[index],
      }));

      return sortListings(listings, input?.sort ?? "recent");
    }),

  listingByToken: publicProcedure
    .input(z.object({ tokenId: z.string().min(1).max(100) }))
    .output(z.custom<SonataListingWithSong | null>())
    .query(async ({ input, ctx }) => {
      const [row] = await ctx.db
        .select({ listing: sonataListing, song: sonataSong })
        .from(sonataListing)
        .innerJoin(sonataSong, eq(sonataListing.tokenId, sonataSong.tokenId))
        .where(
          and(
            eq(sonataListing.tokenId, input.tokenId),
            eq(sonataListing.active, true),
          ),
        )
        .limit(1);

      /* No active listing is a normal answer, not an error. */
      if (!row) return null;

      const [song] = await withEarnings(ctx.db, [row.song]);
      return { ...row.listing, song };
    }),
});
