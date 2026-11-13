/**
 * Server-side wallet flows for public users on NEAR testnet.
 *
 * Unlike `sonata-chain.ts` (which signs as a demo role), everything here works
 * with an account id supplied by a connected wallet. The only signing this
 * module does is the one-time USDC faucet grant, and only with the dedicated
 * faucet key (`SONATA_FAUCET_SECRET_KEY`, falling back to the collector demo
 * key locally). Secret keys are resolved lazily and never logged, returned or
 * embedded in an error message.
 *
 * Every read is a view call on the deployed testnet contracts; no mainnet id
 * can be configured here by accident (`CONTRACT_IDS` defaults are testnet).
 */
import type { SerializedReturnValue } from "near-api-js";

import { assertNearAccountId } from "./account-id";
import {
  callFunction as defaultCallFunction,
  createSignedAccount as defaultCreateSignedAccount,
  normalizeU128,
  viewFunction as defaultViewFunction,
  type ChainAccount,
  type ChainResult,
  type CallOptions,
} from "./client";
import {
  CONTRACT_IDS,
  FAUCET_ACCOUNT_ID,
  FT_TRANSFER_GAS,
  ONE_YOCTO,
  ROYALTY_BPS,
} from "./config";
import { SonataChainError } from "./errors";
import { assertMicroUsdc, type PreparedCall } from "./sonata-chain";
import type { Listing, Master } from "./types";

/** Primary faucet key; see also the local fallback below. */
export const FAUCET_SECRET_KEY_ENV = "SONATA_FAUCET_SECRET_KEY";
/** Local/testnet fallback: the demo collector key, when it is configured. */
export const FAUCET_FALLBACK_SECRET_KEY_ENV =
  "SONATA_DEMO_COLLECTOR_SECRET_KEY";

export type FaucetSigner = {
  accountId: string;
  secretKey: string;
  /** The environment variable the key came from; never the key itself. */
  secretKeyEnv: string;
};

/**
 * Resolves the faucet signer. `SONATA_FAUCET_SECRET_KEY` wins; without it the
 * local collector demo key is used. A missing key is a readable error that
 * names only the environment variables.
 */
export function getFaucetSigner(
  runtimeEnv: Record<string, string | undefined> = process.env,
): FaucetSigner {
  const accountId = assertNearAccountId(
    runtimeEnv.SONATA_FAUCET_ACCOUNT_ID?.trim() || FAUCET_ACCOUNT_ID,
  );

  const primary = runtimeEnv[FAUCET_SECRET_KEY_ENV]?.trim();
  if (primary) {
    return {
      accountId,
      secretKey: primary,
      secretKeyEnv: FAUCET_SECRET_KEY_ENV,
    };
  }

  const fallback = runtimeEnv[FAUCET_FALLBACK_SECRET_KEY_ENV]?.trim();
  if (fallback) {
    return {
      accountId,
      secretKey: fallback,
      secretKeyEnv: FAUCET_FALLBACK_SECRET_KEY_ENV,
    };
  }

  throw new SonataChainError(
    "missing-key",
    `No testnet faucet is configured. Set ${FAUCET_SECRET_KEY_ENV} on the server (${FAUCET_FALLBACK_SECRET_KEY_ENV} works for local testnet only).`,
  );
}

/**
 * `usdc.ft_transfer(receiver, amount)` with 1 yocto attached (the NEP-141
 * storage guard) and plain-transfer gas. This is a direct transfer, not an
 * `ft_transfer_call`: the faucet credits the wallet balance and the user then
 * spends it through their own wallet.
 */
export function buildUsdcTransferCall(
  receiverId: string,
  amountUsdc: string,
  memo?: string,
): PreparedCall {
  return {
    contractId: CONTRACT_IDS.usdc,
    method: "ft_transfer",
    args: {
      receiver_id: assertNearAccountId(receiverId),
      amount: assertMicroUsdc(amountUsdc, "faucet amount"),
      memo: memo ?? null,
    },
    deposit: ONE_YOCTO,
    gas: FT_TRANSFER_GAS,
  };
}

export type UsdcTransferRequest = {
  receiverId: string;
  /** micro-USDC (6 decimals) as a positive integer string. */
  amountUsdc: string;
  memo?: string;
};

export type WalletChain = {
  /** `usdc.ft_balance_of` as a micro-USDC integer string. */
  getUsdcBalance(accountId: string): Promise<string>;
  /** `platform.pass_expiry` in unix seconds (`0` when the account has none). */
  getPassExpiry(accountId: string): Promise<number>;
  isPassActive(accountId: string): Promise<boolean>;
  /** `masters.nft_token` reduced to the ownership fields the cache needs. */
  getNftToken(tokenId: string): Promise<Master | null>;
  /** `market.get_listing`, including inactive listings. */
  getListing(tokenId: string): Promise<Listing | null>;
  /** Signs `ft_transfer` as the configured faucet. */
  transferUsdc(request: UsdcTransferRequest): Promise<ChainResult>;
};

type ViewFunction = <T extends SerializedReturnValue>(
  contractId: string,
  method: string,
  args?: Record<string, unknown>,
) => Promise<T | undefined>;

type CallFunction = (
  account: ChainAccount,
  contractId: string,
  method: string,
  args?: Record<string, unknown>,
  options?: CallOptions,
) => Promise<ChainResult>;

export type WalletChainDependencies = {
  viewFunction?: ViewFunction;
  callFunction?: CallFunction;
  createSignedAccount?: (accountId: string, secretKey: string) => ChainAccount;
  resolveFaucetSigner?: () => FaucetSigner;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/** Canonical micro-USDC text (no leading zeros) from a U128 JSON value. */
function canonicalU128(value: unknown): string {
  return BigInt(normalizeU128(value)).toString();
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return fallback;
}

/** JSON `nft_token` view -> `Master`; `null` for an unknown token. */
function toMaster(tokenId: string, raw: unknown): Master | null {
  if (!isRecord(raw)) return null;

  const ownerId = asString(raw.owner_id);
  if (!ownerId) return null;

  return {
    tokenId: asString(raw.token_id) ?? tokenId,
    ownerId,
    creatorId: asString(raw.creator_id) ?? ownerId,
    subAccount:
      asString(raw.sub_account) ?? `${tokenId}.${CONTRACT_IDS.masters}`,
    royaltyBps: asNumber(raw.royalty_bps, ROYALTY_BPS),
    mintedAtSec: asNumber(raw.minted_at),
    lastTransferAtSec: asNumber(raw.last_transfer_at),
    transferCount: asNumber(raw.transfer_count),
  };
}

/** JSON `get_listing` view -> `Listing`; `null` when the market has none. */
function toListing(tokenId: string, raw: unknown): Listing | null {
  if (!isRecord(raw)) return null;

  const seller = asString(raw.seller);
  if (!seller) return null;

  return {
    tokenId,
    seller,
    price: canonicalU128(raw.price),
    createdAtSec: asNumber(raw.created_at),
    active: raw.active === true,
  };
}

/**
 * Builds the wallet read/transfer object. Defaults use the real RPC and the
 * faucet key from the server environment; tests inject fakes so no test ever
 * touches testnet.
 */
export function createSonataWallet(
  dependencies: WalletChainDependencies = {},
): WalletChain {
  const view = dependencies.viewFunction ?? defaultViewFunction;
  const call = dependencies.callFunction ?? defaultCallFunction;
  const createSignedAccount =
    dependencies.createSignedAccount ?? defaultCreateSignedAccount;
  const resolveFaucetSigner =
    dependencies.resolveFaucetSigner ?? (() => getFaucetSigner());

  const wallet: WalletChain = {
    async getUsdcBalance(accountId) {
      const balance = await view<string>(CONTRACT_IDS.usdc, "ft_balance_of", {
        account_id: assertNearAccountId(accountId),
      });
      return canonicalU128(balance);
    },

    async getPassExpiry(accountId) {
      try {
        const expiry = await view<number | string>(
          CONTRACT_IDS.platform,
          "pass_expiry",
          { account_id: assertNearAccountId(accountId) },
        );
        return asNumber(expiry);
      } catch {
        /* A chain outage must not mint a cached pass: treat it as expired. */
        return 0;
      }
    },

    async isPassActive(accountId) {
      const expiry = await wallet.getPassExpiry(accountId);
      return expiry > Math.floor(Date.now() / 1000);
    },

    async getNftToken(tokenId) {
      const raw = await view<Record<string, unknown>>(
        CONTRACT_IDS.masters,
        "nft_token",
        { token_id: tokenId },
      );
      return toMaster(tokenId, raw ?? null);
    },

    async getListing(tokenId) {
      const raw = await view<Record<string, unknown>>(
        CONTRACT_IDS.market,
        "get_listing",
        { token_id: tokenId },
      );
      return toListing(tokenId, raw ?? null);
    },

    async transferUsdc(request) {
      const prepared = buildUsdcTransferCall(
        request.receiverId,
        request.amountUsdc,
        request.memo,
      );
      const signer = resolveFaucetSigner();
      const account = createSignedAccount(signer.accountId, signer.secretKey);

      return call(
        account,
        prepared.contractId,
        prepared.method,
        prepared.args,
        { deposit: prepared.deposit, gas: prepared.gas },
      );
    },
  };

  return wallet;
}

/** Process-wide default wallet used by the tRPC router and server pages. */
export const sonataWallet = createSonataWallet();

/* Stable, import-friendly wrappers (real RPC + configured faucet signer). */
export const transferUsdc = (
  receiverId: string,
  amountUsdc: string,
  memo?: string,
) => sonataWallet.transferUsdc({ receiverId, amountUsdc, memo });
export const nftToken = (tokenId: string) => sonataWallet.getNftToken(tokenId);
export const marketListing = (tokenId: string) =>
  sonataWallet.getListing(tokenId);
