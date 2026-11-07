import { sonataPass } from "@infinitunes/db/schema";
import type { SonataPassCache } from "@infinitunes/types";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";
import {
  assertSonataDemoMode,
  rethrowSonataError,
  sonataChainFor,
} from "./demo";
import {
  bestEffortSync,
  syncPassPurchase,
  type SonataMutationResult,
} from "./sync";

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
   * contract is the source of truth; the cache follows the landed transaction
   * best-effort and reports `synced: false` instead of hiding a success.
   */
  buy: publicProcedure
    .input(z.object({ role: z.literal("listener") }))
    .output(z.custom<SonataMutationResult>())
    .mutation(async ({ input, ctx }) => {
      assertSonataDemoMode();

      try {
        const result = await sonataChainFor(ctx).buyPass(input.role);

        return await bestEffortSync(result, { action: "pass.buy" }, () =>
          syncPassPurchase(ctx.db, {
            role: input.role,
            txHash: result.txHash,
          }),
        );
      } catch (error) {
        rethrowSonataError(error);
      }
    }),
});
