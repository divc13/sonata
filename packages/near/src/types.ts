/**
 * Sonata types shared by the web app and the (future) contract clients.
 *
 * The DB/router DTOs (`SonataSong`, epochs, payouts, …) are the single source
 * of truth in `@infinitunes/types`; they are re-exported here so consumers can
 * pull every Sonata type from `@infinitunes/near`. The chain-facing `Master`,
 * `Listing`, `Epoch` and `Pass` views mirror the JSON returned by the NEAR
 * contracts (specs/02-contracts.md): unix seconds for time, micro-USDC
 * strings for amounts.
 */

export type {
  SonataArtist,
  SonataEpochDetail,
  SonataEpochSummary,
  SonataListingRow,
  SonataListingWithSong,
  SonataMasterDetail,
  SonataOverview,
  SonataOwnershipRow,
  SonataPassCache,
  SonataPayoutRow,
  SonataPurchaseSync,
  SonataSong,
  SonataSongWithEarnings,
  SonataWalletGrant,
} from "@infinitunes/types";

/** `master-nft.nft_token` JSON view for one minted master. */
export type Master = {
  tokenId: string;
  ownerId: string;
  creatorId: string;
  /** `<token_id>.masters.<collection>`; zero access keys. */
  subAccount: string;
  /** Always 500 (5%) in v1. */
  royaltyBps: number;
  mintedAtSec: number;
  lastTransferAtSec: number;
  transferCount: number;
};

/** `market.get_listing` JSON view while the listing is active. */
export type Listing = {
  tokenId: string;
  seller: string;
  /** micro-USDC as `<U128>` string. */
  price: string;
  createdAtSec: number;
  active: boolean;
};

/** `platform.get_epoch` JSON view for one settled epoch. */
export type Epoch = {
  id: number;
  startedAtSec: number;
  closedAtSec: number;
  balanceBeforeUsdc: string;
  totalSeconds: number;
  effectiveRatePerHourUsdc: string;
  totalPaidUsdc: string;
  listenRoot: string;
  entriesCount: number;
  /** `"constant"` at R, `"pro-rata"` when the balance cannot fund R. */
  mode: "constant" | "pro-rata";
};

/** The non-transferable pass NFT owned by a listener. */
export type Pass = {
  tokenId: string;
  ownerId: string;
  expiresAtSec: number;
  mintedAtSec: number;
  renewedCount: number;
};

/** One settlement entry reported by the oracle (already in seconds). */
export type PayoutEntry = {
  tokenId: string;
  seconds: number;
};
