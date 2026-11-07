/**
 * Sonata router (specs/01-architecture.md). Read-only tRPC surface over the
 * `sonata_*` tables: the wallet/contract workstreams add mutations later.
 *
 * All reads are public: masters, listings, epochs and pass status are shown
 * to signed-out visitors. Writes (publish, buy, withdraw, settle) will be
 * authenticated wallet flows, not tRPC mutations.
 */
import { router } from "../../trpc";
import { sonataArtistRouter } from "./artist";
import { sonataEpochsRouter } from "./epochs";
import { sonataMarketRouter } from "./market";
import { sonataPassRouter } from "./pass";
import { sonataSongsRouter } from "./songs";
import { sonataStatsRouter } from "./stats";

export const sonataRouter = router({
  songs: sonataSongsRouter,
  artist: sonataArtistRouter,
  market: sonataMarketRouter,
  epochs: sonataEpochsRouter,
  pass: sonataPassRouter,
  stats: sonataStatsRouter,
});
