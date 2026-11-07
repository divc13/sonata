/**
 * Sonata router (specs/01-architecture.md). Reads are public; demo-gated
 * mutations cover pass, market, withdrawal, heartbeat ingest and settlement.
 *
 * The listen/settlement service is injected through the tRPC context so this
 * package stays independent of `apps/web` (and the oracle key stays there).
 */
import { router } from "../../trpc";
import { sonataArtistRouter } from "./artist";
import { sonataEpochsRouter } from "./epochs";
import { sonataListenRouter } from "./listen";
import { sonataMarketRouter } from "./market";
import { sonataPassRouter } from "./pass";
import { sonataSongsRouter } from "./songs";
import { sonataStatsRouter } from "./stats";

export const sonataRouter = router({
  songs: sonataSongsRouter,
  artist: sonataArtistRouter,
  market: sonataMarketRouter,
  epochs: sonataEpochsRouter,
  listen: sonataListenRouter,
  pass: sonataPassRouter,
  stats: sonataStatsRouter,
});
