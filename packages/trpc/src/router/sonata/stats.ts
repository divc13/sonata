import {
  sonataEpoch,
  sonataListing,
  sonataPayout,
  sonataSong,
} from "@infinitunes/db/schema";
import type { SonataOverview } from "@infinitunes/types";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";

/**
 * Platform-level totals for the audit/home header. Until the indexer
 * workstream lands these read from Postgres only; afterwards the platform
 * balance and reserve come from `platform.get_stats` and this anchors the
 * DB side of it.
 */
export const sonataStatsRouter = router({
  overview: publicProcedure
    .output(z.custom<SonataOverview>())
    .query(async ({ ctx }) => {
      const [[songs], [paid], [listings], [listen]] = await Promise.all([
        ctx.db.select({ n: count() }).from(sonataSong),
        ctx.db
          .select({
            totalPaidUsdc: sql<string>`coalesce(sum(${sonataPayout.amountUsdc}::numeric), 0)::text`,
          })
          .from(sonataPayout),
        ctx.db
          .select({ n: count() })
          .from(sonataListing)
          .where(eq(sonataListing.active, true)),
        ctx.db
          .select({
            totalSeconds: sql<number>`coalesce(sum(${sonataEpoch.totalSeconds}), 0)::int`,
          })
          .from(sonataEpoch),
      ]);

      return {
        totalPaidUsdc: paid.totalPaidUsdc,
        totalSeconds: listen.totalSeconds,
        activeListings: listings.n,
        songsCount: songs.n,
      };
    }),
});
