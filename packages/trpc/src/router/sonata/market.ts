import type { DbClient } from "@infinitunes/db/client";
import { sonataListing, sonataSong } from "@infinitunes/db/schema";
import { DEMO_ROLES } from "@infinitunes/near";
import type { SonataListingWithSong } from "@infinitunes/types";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";
import {
  assertSonataDemoMode,
  rethrowSonataError,
  sonataChainFor,
} from "./demo";
import { withEarnings } from "./helpers";
import { microUsdcInput, tokenIdInput } from "./inputs";
import { LISTING_SORTS, sortListings } from "./market-helpers";
import {
  bestEffortSync,
  cachedOwnerAccountId,
  roleToAccountId,
  syncMarketListing,
  syncMarketSale,
  type SonataMutationResult,
} from "./sync";

/**
 * Fail early when Postgres clearly disagrees with the chain. A read failure
 * (database unavailable) does not block the chain call: the contract enforces
 * ownership, and the cache is healed by the sync/indexer later.
 */
async function assertCachedListingOwner(
  db: DbClient,
  tokenId: string,
  sellerAccountId: string,
): Promise<void> {
  let cachedOwner: string | null;

  try {
    cachedOwner = await cachedOwnerAccountId(db, tokenId);
  } catch (error) {
    console.error("[sonata:sync] could not preflight listing ownership", {
      tokenId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (cachedOwner === null) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Master "${tokenId}" is not in the local cache yet. Wait for the indexer to catch up, then retry the listing.`,
    });
  }

  if (cachedOwner !== sellerAccountId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `The local cache says "${tokenId}" is owned by ${cachedOwner}, not ${sellerAccountId}. Refetch the master before listing it.`,
    });
  }
}

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

  /**
   * Demo-only resale purchase. `expectedPriceUsdc` is sent as the transfer
   * amount; the market refunds a mismatch instead of accepting it, so the UI
   * should pass the price it displayed.
   */
  buy: publicProcedure
    .input(
      z.object({
        role: z.enum(DEMO_ROLES),
        tokenId: tokenIdInput,
        expectedPriceUsdc: microUsdcInput,
      }),
    )
    .output(z.custom<SonataMutationResult>())
    .mutation(async ({ input, ctx }) => {
      assertSonataDemoMode();

      try {
        const result = await sonataChainFor(ctx).buyMaster(
          input.role,
          input.tokenId,
          input.expectedPriceUsdc,
        );

        return await bestEffortSync(
          result,
          { action: "market.buy", tokenId: input.tokenId },
          () =>
            syncMarketSale(ctx.db, {
              tokenId: input.tokenId,
              buyerRole: input.role,
              priceUsdc: input.expectedPriceUsdc,
              txHash: result.txHash,
            }),
        );
      } catch (error) {
        rethrowSonataError(error);
      }
    }),

  /** Demo-only: approve the market, then create a fixed-price listing. */
  list: publicProcedure
    .input(
      z.object({
        role: z.enum(DEMO_ROLES),
        tokenId: tokenIdInput,
        priceUsdc: microUsdcInput,
      }),
    )
    .output(z.custom<SonataMutationResult>())
    .mutation(async ({ input, ctx }) => {
      assertSonataDemoMode();
      await assertCachedListingOwner(
        ctx.db,
        input.tokenId,
        roleToAccountId(input.role),
      );

      try {
        const result = await sonataChainFor(ctx).listMaster(
          input.role,
          input.tokenId,
          input.priceUsdc,
        );

        return await bestEffortSync(
          result,
          { action: "market.list", tokenId: input.tokenId },
          () =>
            syncMarketListing(ctx.db, {
              tokenId: input.tokenId,
              sellerRole: input.role,
              priceUsdc: input.priceUsdc,
              txHash: result.txHash,
            }),
        );
      } catch (error) {
        rethrowSonataError(error);
      }
    }),
});
