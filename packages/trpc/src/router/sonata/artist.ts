import { sonataSong } from "@infinitunes/db/schema";
import type { SonataArtist } from "@infinitunes/types";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";
import { withEarnings } from "./helpers";

export const sonataArtistRouter = router({
  byHandle: publicProcedure
    .input(
      z.object({
        handle: z
          .string()
          .min(1)
          .max(60)
          /** Accept `@nadia` and `nadia` alike; stored handles are bare. */
          .transform((value) => value.trim().replace(/^@+/, "").toLowerCase()),
      }),
    )
    .output(z.custom<SonataArtist>())
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db
        .select()
        .from(sonataSong)
        .where(eq(sonataSong.artistHandle, input.handle))
        /* Oldest master first, matching the artist dashboard ordering. */
        .orderBy(sonataSong.createdAt);

      const first = rows[0];
      if (!first) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Artist not found",
        });
      }

      const songs = await withEarnings(ctx.db, rows);
      const total = songs.reduce(
        (sum, song) => sum + Number(song.earnings30dUsdc),
        0,
      );

      return {
        handle: first.artistHandle,
        name: first.artistName,
        accountId: first.artistAccountId,
        songCount: songs.length,
        songs,
        earnings30dUsdc: total.toString(),
      };
    }),
});
