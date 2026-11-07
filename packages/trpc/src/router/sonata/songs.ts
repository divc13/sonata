import { sonataPayout, sonataSong } from "@infinitunes/db/schema";
import { DEMO_ROLES, type ChainResult } from "@infinitunes/near";
import type {
  SonataMasterDetail,
  SonataPayoutRow,
  SonataSongWithEarnings,
} from "@infinitunes/types";
import { TRPCError } from "@trpc/server";
import { asc } from "drizzle-orm";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";
import {
  assertSonataDemoMode,
  rethrowSonataError,
  sonataChainFor,
} from "./demo";
import { withEarnings } from "./helpers";
import { microUsdcInput, tokenIdInput } from "./inputs";

/** Maximum page the catalog shell asks for; the app is small enough for 100. */
const MAX_LIMIT = 100;

const pagedInput = z
  .object({
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .optional();

export const sonataSongsRouter = router({
  list: publicProcedure
    .input(pagedInput)
    .output(z.custom<SonataSongWithEarnings[]>())
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db
        .select()
        .from(sonataSong)
        .orderBy(asc(sonataSong.createdAt), asc(sonataSong.tokenId))
        .limit(input?.limit ?? MAX_LIMIT)
        .offset(input?.offset ?? 0);

      return withEarnings(ctx.db, rows);
    }),

  byId: publicProcedure
    .input(z.object({ tokenId: z.string().min(1).max(100) }))
    .output(z.custom<SonataMasterDetail>())
    .query(async ({ input, ctx }) => {
      const [song] = await ctx.db
        .select()
        .from(sonataSong)
        .where(eq(sonataSong.tokenId, input.tokenId))
        .limit(1);

      if (!song) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Master not found",
        });
      }

      const [withTrailing] = await withEarnings(ctx.db, [song]);

      const recentPayouts: SonataPayoutRow[] = await ctx.db
        .select({
          epochId: sonataPayout.epochId,
          tokenId: sonataPayout.tokenId,
          seconds: sonataPayout.seconds,
          amountUsdc: sonataPayout.amountUsdc,
          txHash: sonataPayout.txHash,
          createdAt: sonataPayout.createdAt,
        })
        .from(sonataPayout)
        .where(eq(sonataPayout.tokenId, input.tokenId))
        .orderBy(desc(sonataPayout.epochId))
        .limit(10);

      return { ...withTrailing, recentPayouts };
    }),

  /**
   * Demo-only withdrawal from a master's song account. Omitting `amountUsdc`
   * calls `withdraw_all`; the song-wallet re-checks ownership on chain.
   */
  withdraw: publicProcedure
    .input(
      z.object({
        role: z.enum(DEMO_ROLES),
        tokenId: tokenIdInput,
        amountUsdc: microUsdcInput.optional(),
      }),
    )
    .output(z.custom<ChainResult>())
    .mutation(async ({ input, ctx }) => {
      assertSonataDemoMode();

      try {
        return await sonataChainFor(ctx).withdrawFromSong(
          input.role,
          input.tokenId,
          input.amountUsdc,
        );
      } catch (error) {
        rethrowSonataError(error);
      }
    }),
});
