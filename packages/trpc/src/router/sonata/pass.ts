import { sonataPass } from "@infinitunes/db/schema";
import type { SonataPassCache } from "@infinitunes/types";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";

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
});
