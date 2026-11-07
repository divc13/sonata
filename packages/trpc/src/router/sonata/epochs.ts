import { sonataEpoch, sonataPayout } from "@infinitunes/db/schema";
import type { SonataEpochDetail, SonataEpochSummary } from "@infinitunes/types";
import type { SonataPayoutRow } from "@infinitunes/types";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";
import {
  assertSonataDemoMode,
  rethrowSonataError,
  sonataSettlementFor,
} from "./demo";
import type { DemoSettlementResult } from "./service";

const MAX_LIMIT = 100;

const pagedInput = z
  .object({
    limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .optional();

export const sonataEpochsRouter = router({
  list: publicProcedure
    .input(pagedInput)
    .output(z.custom<SonataEpochSummary[]>())
    .query(({ input, ctx }) =>
      ctx.db
        .select()
        .from(sonataEpoch)
        .orderBy(desc(sonataEpoch.id))
        .limit(input?.limit ?? MAX_LIMIT)
        .offset(input?.offset ?? 0),
    ),

  byId: publicProcedure
    .input(z.object({ id: z.number().int().min(0) }))
    .output(z.custom<SonataEpochDetail>())
    .query(async ({ input, ctx }) => {
      const [epoch] = await ctx.db
        .select()
        .from(sonataEpoch)
        .where(eq(sonataEpoch.id, input.id))
        .limit(1);

      if (!epoch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Epoch not found",
        });
      }

      const payouts: SonataPayoutRow[] = await ctx.db
        .select({
          epochId: sonataPayout.epochId,
          tokenId: sonataPayout.tokenId,
          seconds: sonataPayout.seconds,
          amountUsdc: sonataPayout.amountUsdc,
          txHash: sonataPayout.txHash,
          createdAt: sonataPayout.createdAt,
        })
        .from(sonataPayout)
        .where(eq(sonataPayout.epochId, input.id))
        .orderBy(desc(sonataPayout.amountUsdc));

      return { ...epoch, payouts };
    }),

  /**
   * Demo-only, oracle-only settlement. The service aggregates the current
   * rolling window, signs `platform.settle_epoch` with
   * `SONATA_ORACLE_SECRET_KEY`, then mirrors the chain epoch and per-song
   * payouts into Postgres. Existing epoch ids are rejected before the call.
   */
  settle: publicProcedure
    .input(z.object({ epochId: z.number().int().min(0) }))
    .output(z.custom<DemoSettlementResult>())
    .mutation(async ({ input, ctx }) => {
      assertSonataDemoMode();

      try {
        return await sonataSettlementFor(ctx).runDemoSettlement(input.epochId);
      } catch (error) {
        rethrowSonataError(error);
      }
    }),
});
