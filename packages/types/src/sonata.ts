/**
 * Sonata data-transfer types, shared by `packages/db`, `packages/trpc` (the
 * `sonata` router) and `packages/near`. These describe the Postgres rows the
 * router returns: camelCase JS fields, `Date` instances for timestamps and
 * **micro-USDC strings** for every money amount (6 decimals, no floats —
 * see specs/03-accounting.md).
 */

/** One minted master, as stored in `sonata_song`. */
export type SonataSong = {
  tokenId: string;
  title: string;
  artistName: string;
  artistHandle: string;
  artistAccountId: string;
  creatorAccountId: string;
  ownerAccountId: string;
  /** `<token_id>.masters.<collection>`; the keyless per-song NEAR account. */
  subAccount: string;
  coverUrl: string;
  audioUrl: string;
  durationSec: number;
  genre: string;
  releaseYear: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A song with its trailing-30-day settled earnings joined in. */
export type SonataSongWithEarnings = SonataSong & {
  /** micro-USDC paid into this song's account over the trailing 30 days. */
  earnings30dUsdc: string;
};

/** One settled per-song payout row of an epoch. */
export type SonataPayoutRow = {
  epochId: number;
  tokenId: string;
  seconds: number;
  amountUsdc: string;
  txHash: string | null;
  createdAt: Date;
};

/** Full master detail for the `/master/[tokenId]` page. */
export type SonataMasterDetail = SonataSongWithEarnings & {
  recentPayouts: SonataPayoutRow[];
};

/** An artist's public profile plus all of their masters. */
export type SonataArtist = {
  handle: string;
  name: string;
  accountId: string;
  songCount: number;
  songs: SonataSongWithEarnings[];
  earnings30dUsdc: string;
};

/** An active resale listing joined to its song. */
export type SonataListingWithSong = {
  id: number;
  tokenId: string;
  sellerAccountId: string;
  priceUsdc: string;
  active: boolean;
  txHash: string | null;
  createdAt: Date;
  song: SonataSongWithEarnings;
};

/** The DB cache of the latest pass purchase for an account. */
export type SonataPassCache = {
  id: number;
  accountId: string;
  tokenId: string | null;
  startsAt: Date;
  expiresAt: Date;
  priceUsdc: string;
  txHash: string | null;
  createdAt: Date;
};

/** Epoch summary exactly as settled on chain. */
export type SonataEpochSummary = {
  id: number;
  startedAt: Date;
  closedAt: Date;
  balanceBeforeUsdc: string;
  totalSeconds: number;
  effectiveRatePerHour: string;
  totalPaidUsdc: string;
  listenRoot: string;
  entriesCount: number;
  mode: "constant" | "pro-rata";
  txHash: string | null;
};

/** An epoch plus its payout rows. */
export type SonataEpochDetail = SonataEpochSummary & {
  payouts: SonataPayoutRow[];
};

/** Platform-level totals for the audit/home header (seeded until chain). */
export type SonataOverview = {
  totalPaidUsdc: string;
  totalSeconds: number;
  activeListings: number;
  songsCount: number;
};
