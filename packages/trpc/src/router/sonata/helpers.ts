import type { DbClient } from "@infinitunes/db/client";
import { sonataEpoch, sonataPayout, sonataSong } from "@infinitunes/db/schema";
import type { SonataSongWithEarnings } from "@infinitunes/types";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

export type SonataSongRow = typeof sonataSong.$inferSelect;

/** Sliding window used by every earnings readout on cards and charts. */
export const TRAILING_EARNINGS_DAYS = 30;

/**
 * Settled micro-USDC each token id earned inside the trailing window, read
 * from `sonata_payout` rows whose epoch closed inside it. Songs earn into
 * their own song account; this is the trailing-30-days cut of that history.
 */
export async function trailingEarnings(
  db: DbClient,
  tokenIds: string[],
): Promise<Map<string, string>> {
  if (tokenIds.length === 0) return new Map();

  const since = new Date(Date.now() - TRAILING_EARNINGS_DAYS * 86_400_000);
  const rows = await db
    .select({
      tokenId: sonataPayout.tokenId,
      earnedUsdc: sql<string>`sum(${sonataPayout.amountUsdc}::numeric)::text`,
    })
    .from(sonataPayout)
    .innerJoin(sonataEpoch, eq(sonataPayout.epochId, sonataEpoch.id))
    .where(
      and(
        gte(sonataEpoch.closedAt, since),
        inArray(sonataPayout.tokenId, tokenIds),
      ),
    )
    .groupBy(sonataPayout.tokenId);

  return new Map(rows.map((row) => [row.tokenId, row.earnedUsdc]));
}

/** DB song rows with `earnings30dUsdc` attached (songs never paid → "0"). */
export async function withEarnings(
  db: DbClient,
  songs: SonataSongRow[],
): Promise<SonataSongWithEarnings[]> {
  const earned = await trailingEarnings(
    db,
    songs.map((song) => song.tokenId),
  );

  return songs.map((song) => ({
    ...song,
    earnings30dUsdc: earned.get(song.tokenId) ?? "0",
  }));
}
