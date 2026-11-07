import { sonataPass } from "@infinitunes/db/schema";
import type { ChainResult } from "@infinitunes/near";
import type { SonataPassCache } from "@infinitunes/types";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";
import {
  assertSonataDemoMode,
  rethrowSonataError,
  sonataChainFor,
} from "./demo";

/**
 * DB cache of pass purchases. The chain (`platform.pass_expiry`) is the source
 * of truth once the wallet workstream lands; procedures reading pass status
 * will combine this cache with the 30-second chain lookup then.
 */
export const sonataPassRouter = router({
  byAccount: publicProcedure
    .input(z.object({ accountId: z.string().min(1).max(100) }))
    .output(z.custom<SonataPassCache | null>())
    .query(async ({ input, ctx }) => {
      const [pass] = await ctx.db
        .select()
        .from(sonataPass)
        .where(eq(sonataPass.accountId, input.accountId))
        .orderBy(desc(sonataPass.createdAt))
        .limit(1);

      return pass ?? null;
    }),

  /**
   * Demo-only pass purchase with the server-side listener signer. The chain
   * contract is the source of truth; the caller should refetch `byAccount` (or
   * `platform.pass_expiry`) after the transaction lands.
   */
  buy: publicProcedure
    .input(z.object({ role: z.literal("listener") }))
    .output(z.custom<ChainResult>())
    .mutation(async ({ input, ctx }) => {
      assertSonataDemoMode();

      try {
        return await sonataChainFor(ctx).buyPass(input.role);
      } catch (error) {
        rethrowSonataError(error);
      }
    }),
});
