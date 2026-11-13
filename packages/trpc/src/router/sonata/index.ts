/**
 * Sonata router (specs/01-architecture.md). Reads are public; demo-gated
 * mutations cover pass, market, withdrawal, heartbeat ingest and settlement.
 * `wallet` is the non-demo path for a connected NEAR testnet account: balance,
 * one-time faucet, and chain-verified pass/purchase/listing cache syncs.
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
import { sonataWalletRouter } from "./wallet";

export const sonataRouter = router({
  songs: sonataSongsRouter,
  artist: sonataArtistRouter,
  market: sonataMarketRouter,
  epochs: sonataEpochsRouter,
  listen: sonataListenRouter,
  pass: sonataPassRouter,
  stats: sonataStatsRouter,
  wallet: sonataWalletRouter,
});
