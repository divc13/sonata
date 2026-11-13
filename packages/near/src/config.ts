/**
 * Sonata network and contract configuration (specs/01-architecture.md,
 * "Chain and network", and 02-contracts.md deployment order).
 *
 * Contract ids can be overridden through env (`.env.local` is loaded by apps
 * and scripts); the defaults point at the Sonata testnet deployments. amounts
 * and accounting constants live here too — they are locked in
 * specs/03-accounting.md and must not move.
 *
 * This package keeps the display/config layer dependency-free; the
 * server-side RPC helpers in `client.ts` are the only consumers of
 * `near-api-js`.
 */

export const SONATA_NETWORK = "testnet" as const;

export type SonataNetwork = typeof SONATA_NETWORK;

const withDefault = (value: string | undefined, fallback: string) =>
  value && value.trim().length > 0 ? value.trim() : fallback;

/**
 * Server-side RPC endpoint. `rpc.testnet.near.org` now answers bursts of view
 * calls with 429; FastNear's testnet endpoint is the default. Override with
 * `SONATA_NEAR_RPC_URL` (never expose it to the browser).
 */
export const NEAR_RPC_URL = withDefault(
  process.env.SONATA_NEAR_RPC_URL,
  "https://rpc.testnet.fastnear.com",
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

/**
 * Demo identities from `ops/testnet.env`. Their secret keys are server-only
 * (`SONATA_*_SECRET_KEY`) and are resolved lazily in `demo-accounts.ts`.
 */
export const DEMO_ACCOUNT_IDS = {
  /** Pass buyer. */
  listener: "listener.sonata.testnet",
  /** Resale buyer. */
  collector: "collector.sonata.testnet",
  /** Epoch settlement signer. */
  oracle: ORACLE_ACCOUNT_ID,
  /** Demo artist / seller. */
  nadia: "nadia-sonata.testnet",
} as const;

/**
 * The testnet faucet that funds newly connected wallets. Its key is
 * server-only (`SONATA_FAUCET_SECRET_KEY`, falling back to the collector demo
 * key for local testnet work) and never reaches the browser. The account is
 * configurable because the demo collector may be rotated.
 */
export const FAUCET_ACCOUNT_ID = withDefault(
  process.env.SONATA_FAUCET_ACCOUNT_ID,
  DEMO_ACCOUNT_IDS.collector,
);

/** One-time grant from the faucet: 25 USDC as a micro-USDC integer string. */
export const FAUCET_GRANT_USDC_MICRO = "25000000";

/** YoctoNEAR attached to NEP-141 `ft_transfer_call` (receiver-attached calls). */
export const ONE_YOCTO = 1n;

/**
 * NEP-145 registration deposit the faucet attaches before the first transfer:
 * `ft_transfer` panics for an account the USDC contract has not registered.
 * 0.01 NEAR covers the contract's 120-byte storage cost
 * (`contracts/mock-usdc/src/lib.rs`, `STORAGE_BYTES_PER_ACCOUNT`); with
 * `registration_only: true` the contract refunds whatever exceeds the cost,
 * and an already-registered account gets the whole deposit back.
 */
export const USDC_STORAGE_DEPOSIT_YOCTO = 10_000_000_000_000_000_000_000n;

/**
 * Gas a wallet must attach to NEP-141 `ft_transfer_call` (pass purchase,
 * market buy). `mock-usdc` forwards 120 Tgas to the receiver's
 * `ft_on_transfer` (enough for the market's 50 + 40 Tgas subcalls) plus
 * 15 Tgas to its own resolver, so 200 Tgas leaves room for the token logic.
 * A plain `ft_transfer` only needs the 25 Tgas the wallet attaches itself.
 */
export const FT_TRANSFER_CALL_GAS = 200_000_000_000_000n;

/**
 * A plain NEP-141 `ft_transfer` (faucet grant) only executes the token
 * contract's own logic, so 30 TGas is well above the requirement while
 * staying under the 300 TGas transaction ceiling.
 */
export const FT_TRANSFER_GAS = 30_000_000_000_000n;

/** 100 TGas covers the cross-contract pass, sale and withdrawal callbacks. */
export const DEFAULT_FUNCTION_CALL_GAS = 100_000_000_000_000n;

/** `market.list` minimum storage deposit, 0.01 NEAR (contracts/market/src/lib.rs). */
export const LISTING_STORAGE_YOCTO = 10_000_000_000_000_000_000_000n;

/**
 * `nft_approve` stores one approved account id and requires the caller to
 * cover that state; 0.01 NEAR is ample and the collection refunds the excess.
 */
export const APPROVAL_STORAGE_YOCTO = 10_000_000_000_000_000_000n;

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
