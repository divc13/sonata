/**
 * Sonata network and contract configuration (specs/01-architecture.md,
 * "Chain and network", and 02-contracts.md deployment order).
 *
 * Contract ids can be overridden through env (`.env.local` is loaded by apps
 * and scripts); the defaults point at the Sonata testnet deployments. amounts
 * and accounting constants live here too — they are locked in
 * specs/03-accounting.md and must not move.
 *
 * This package stays dependency-free: no wallet-selector or near-api-js yet.
 */

export const SONATA_NETWORK = "testnet" as const;

export type SonataNetwork = typeof SONATA_NETWORK;

const withDefault = (value: string | undefined, fallback: string) =>
  value && value.trim().length > 0 ? value.trim() : fallback;

export const NEAR_RPC_URL = withDefault(
  process.env.SONATA_NEAR_RPC_URL,
  "https://rpc.testnet.near.org",
);

/** NEP-141 mock USDC: 6 decimals, mintable by the demo admin (testnet only). */
export const USDC_DECIMALS = 6;

/** The five deployed contracts, overridable per environment. */
export const CONTRACT_IDS = {
  /** NEP-171 masters collection + song account factory. */
  masters: withDefault(process.env.SONATA_MASTERS_ID, "masters-sonata.testnet"),
  /** Pass NFT, treasury, epoch settlement, reserve. */
  platform: withDefault(
    process.env.SONATA_PLATFORM_ID,
    "platform-sonata.testnet",
  ),
  /** Fixed-price resale with 5% royalty. */
  market: withDefault(process.env.SONATA_MARKET_ID, "market-sonata.testnet"),
  /** Mock USDC (NEP-141). */
  usdc: withDefault(process.env.SONATA_USDC_ID, "usdc-sonata.testnet"),
} as const;

/**
 * The oracle that may call `platform.settle_epoch`. Its key is only ever
 * present in the settlement service environment, never in the browser.
 */
export const ORACLE_ACCOUNT_ID = withDefault(
  process.env.SONATA_ORACLE_ID,
  "oracle-sonata.testnet",
);

/* Locked accounting constants (specs/03-accounting.md).*/

/** $5.00 — one pass unlocks the whole catalog for 30 days. */
export const PASS_PRICE_USDC_MICRO = "5000000";
/** 30 days in seconds. */
export const PASS_DURATION_SEC = 2_592_000;
/** $0.03 per verified hour, immutable after deployment. */
export const RATE_PER_HOUR_USDC_MICRO = "30000";
/** 4 hours per listener per UTC day, applied across all songs. */
export const DAILY_CAP_SEC = 14_400;
/** 5% creator royalty on every resale, computed on chain. */
export const ROYALTY_BPS = 500;
