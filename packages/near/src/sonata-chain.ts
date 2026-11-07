/**
 * Sonata contract flows used by the demo (pass purchase, master resale,
 * withdrawal and listing). Every amount is a micro-USDC integer string; no
 * floating-point math is performed anywhere in this module.
 *
 * The orchestrator is injectable so unit tests (and the tRPC caller) can pass
 * a fake chain client without touching testnet.
 */
import type { SerializedReturnValue } from "near-api-js";

import {
  callFunction as defaultCallFunction,
  createSignedAccount as defaultCreateSignedAccount,
  viewFunction as defaultViewFunction,
  getUsdcBalance,
  normalizeU128,
  type CallOptions,
  type ChainAccount,
  type ChainResult,
} from "./client";
import {
  APPROVAL_STORAGE_YOCTO,
  CONTRACT_IDS,
  DEMO_ACCOUNT_IDS,
  FT_TRANSFER_CALL_GAS,
  LISTING_STORAGE_YOCTO,
  ONE_YOCTO,
  PASS_PRICE_USDC_MICRO,
} from "./config";
import {
  DEMO_ROLES,
  getDemoSigner,
  type DemoRole,
  type DemoSigner,
} from "./demo-accounts";
import { SonataChainError, toChainError } from "./errors";
import { assertTokenId, songAccountId } from "./token-id";

export const PASS_PURCHASE_MSG = "pass";

export type PreparedCall = {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
  deposit: bigint;
  gas?: bigint;
};

export type SonataChain = {
  getPassExpiry(accountId: string): Promise<number>;
  isPassActive(accountId: string): Promise<boolean>;
  getUsdcBalance(accountId: string): Promise<string>;
  buyPass(role: DemoRole): Promise<ChainResult>;
  buyMaster(
    role: DemoRole,
    tokenId: string,
    priceUsdc: string,
  ): Promise<ChainResult>;
  withdrawFromSong(
    role: DemoRole,
    tokenId: string,
    amountUsdc?: string,
    accountId?: string,
  ): Promise<ChainResult>;
  listMaster(
    role: DemoRole,
    tokenId: string,
    priceUsdc: string,
  ): Promise<ChainResult>;
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

export type SonataChainDependencies = {
  viewFunction?: ViewFunction;
  callFunction?: CallFunction;
  createSignedAccount?: (accountId: string, secretKey: string) => ChainAccount;
  resolveSigner?: (role: DemoRole) => DemoSigner;
};

function isDemoRole(value: string): value is DemoRole {
  return (DEMO_ROLES as readonly string[]).includes(value);
}

function assertDemoRole(role: string): DemoRole {
  if (!isDemoRole(role)) {
    throw new SonataChainError("invalid-input", `Unknown demo role "${role}".`);
  }
  return role;
}

/** Positive integer micro-USDC string, normalized (no leading zeros). */
export function assertMicroUsdc(value: string, label = "amount"): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new SonataChainError(
      "invalid-input",
      `${label} must be a micro-USDC integer string (6 decimals).`,
    );
  }
  const amount = BigInt(value);
  if (amount <= 0n) {
    throw new SonataChainError(
      "invalid-input",
      `${label} must be greater than zero.`,
    );
  }
  return amount.toString();
}

export function buyMasterMsg(tokenId: string): string {
  return `buy:${assertTokenId(tokenId)}`;
}

/** NEP-141 `ft_transfer_call` args. `memo: null` matches `Option<String>`. */
export function buildFtTransferCallArgs(
  receiverId: string,
  amountUsdc: string,
  msg: string,
): Record<string, unknown> {
  return {
    receiver_id: receiverId,
    amount: assertMicroUsdc(amountUsdc),
    msg,
    memo: null,
  };
}

/** `usdc.ft_transfer_call(platform, 5 USDC, "pass")`. */
export function buildPassCall(): PreparedCall {
  return {
    contractId: CONTRACT_IDS.usdc,
    method: "ft_transfer_call",
    args: buildFtTransferCallArgs(
      CONTRACT_IDS.platform,
      PASS_PRICE_USDC_MICRO,
      PASS_PURCHASE_MSG,
    ),
    deposit: ONE_YOCTO,
    gas: FT_TRANSFER_CALL_GAS,
  };
}

/** `usdc.ft_transfer_call(market, price, "buy:<token>")`. */
export function buildBuyCall(tokenId: string, priceUsdc: string): PreparedCall {
  return {
    contractId: CONTRACT_IDS.usdc,
    method: "ft_transfer_call",
    args: buildFtTransferCallArgs(
      CONTRACT_IDS.market,
      priceUsdc,
      buyMasterMsg(tokenId),
    ),
    deposit: ONE_YOCTO,
    gas: FT_TRANSFER_CALL_GAS,
  };
}

/**
 * `song-wallet.withdraw(amount)` or `withdraw_all()`.
 *
 * `accountId` defaults to the token-derived wallet. The rescue migration
 * passes the replacement wallet from `platform.song_accounts` instead, so a
 * broken original wallet never receives the call.
 */
export function buildWithdrawCall(
  tokenId: string,
  amountUsdc?: string,
  accountId?: string,
): PreparedCall {
  const contractId = accountId ?? songAccountId(tokenId, CONTRACT_IDS.masters);
  if (amountUsdc === undefined) {
    return {
      contractId,
      method: "withdraw_all",
      args: {},
      deposit: 0n,
    };
  }

  return {
    contractId,
    method: "withdraw",
    args: { amount: assertMicroUsdc(amountUsdc, "withdrawal amount") },
    deposit: 0n,
  };
}

/**
 * Two transactions: approve the market on the collection, then create the
 * listing. `nft_approve` must cover the approval's storage (0.01 NEAR, excess
 * refunded); `market.list` needs the contract's 0.01 NEAR listing storage.
 */
export function buildListCalls(
  tokenId: string,
  priceUsdc: string,
): [PreparedCall, PreparedCall] {
  const token = assertTokenId(tokenId);
  const price = assertMicroUsdc(priceUsdc, "listing price");

  return [
    {
      contractId: CONTRACT_IDS.masters,
      method: "nft_approve",
      args: {
        token_id: token,
        account_id: CONTRACT_IDS.market,
        msg: null,
      },
      deposit: APPROVAL_STORAGE_YOCTO,
    },
    {
      contractId: CONTRACT_IDS.market,
      method: "list",
      args: { token_id: token, price },
      deposit: LISTING_STORAGE_YOCTO,
    },
  ];
}

function toUnixSeconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  return 0;
}

type ListingView = { price?: unknown; active?: unknown };

/**
 * A stale UI price must not silently buy at a different amount. The contract
 * refunds a mismatch, but checking first turns that into a readable error
 * instead of a successful-looking transaction.
 */
async function assertListingPrice(
  view: ViewFunction,
  tokenId: string,
  expectedPriceUsdc: string,
): Promise<void> {
  const listing = await view<ListingView>(CONTRACT_IDS.market, "get_listing", {
    token_id: tokenId,
  });

  if (!listing || listing.active !== true) {
    throw new SonataChainError(
      "invalid-input",
      "This master has no active resale listing.",
    );
  }

  const actual = normalizeU128(listing.price);
  if (actual !== expectedPriceUsdc) {
    throw new SonataChainError(
      "invalid-input",
      `The listing price changed to ${actual} micro-USDC; refresh and try again.`,
    );
  }
}

/** Executes a prepared call with the role's demo signer. */
async function execute(
  role: DemoRole,
  prepared: PreparedCall,
  deps: {
    call: CallFunction;
    createSignedAccount: (accountId: string, secretKey: string) => ChainAccount;
    resolveSigner: (role: DemoRole) => DemoSigner;
  },
): Promise<ChainResult> {
  const signer = deps.resolveSigner(role);
  const account = deps.createSignedAccount(signer.accountId, signer.secretKey);
  return deps.call(
    account,
    prepared.contractId,
    prepared.method,
    prepared.args,
    { deposit: prepared.deposit, gas: prepared.gas },
  );
}

/**
 * Builds the Sonata flow object. Defaults use the real RPC and the demo keys
 * from the server environment.
 */
export function createSonataChain(
  dependencies: SonataChainDependencies = {},
): SonataChain {
  const view = dependencies.viewFunction ?? defaultViewFunction;
  const call = dependencies.callFunction ?? defaultCallFunction;
  const createSignedAccount =
    dependencies.createSignedAccount ?? defaultCreateSignedAccount;
  const resolveSigner = dependencies.resolveSigner ?? getDemoSigner;

  const chain: SonataChain = {
    async getPassExpiry(accountId) {
      try {
        const expiry = await view<number | string>(
          CONTRACT_IDS.platform,
          "pass_expiry",
          { account_id: accountId },
        );
        return toUnixSeconds(expiry);
      } catch {
        /* A chain outage must not unlock playback: treat it as expired. */
        return 0;
      }
    },

    async isPassActive(accountId) {
      const expiry = await chain.getPassExpiry(accountId);
      return expiry > Math.floor(Date.now() / 1000);
    },

    async getUsdcBalance(accountId) {
      const balance = await view<string>(CONTRACT_IDS.usdc, "ft_balance_of", {
        account_id: accountId,
      });
      return normalizeU128(balance);
    },

    async buyPass(role) {
      return execute(assertDemoRole(role), buildPassCall(), {
        call,
        createSignedAccount,
        resolveSigner,
      });
    },

    async buyMaster(role, tokenId, priceUsdc) {
      const signerRole = assertDemoRole(role);
      const token = assertTokenId(tokenId);
      const price = assertMicroUsdc(priceUsdc, "expected price");
      await assertListingPrice(view, token, price);

      return execute(signerRole, buildBuyCall(token, price), {
        call,
        createSignedAccount,
        resolveSigner,
      });
    },

    async withdrawFromSong(role, tokenId, amountUsdc, accountId) {
      return execute(
        assertDemoRole(role),
        buildWithdrawCall(tokenId, amountUsdc, accountId),
        { call, createSignedAccount, resolveSigner },
      );
    },

    async listMaster(role, tokenId, priceUsdc) {
      const signerRole = assertDemoRole(role);
      const [approve, list] = buildListCalls(tokenId, priceUsdc);

      await execute(signerRole, approve, {
        call,
        createSignedAccount,
        resolveSigner,
      });

      try {
        return await execute(signerRole, list, {
          call,
          createSignedAccount,
          resolveSigner,
        });
      } catch (error) {
        throw error instanceof SonataChainError
          ? error
          : toChainError(error, `${list.contractId}.${list.method}`);
      }
    },
  };

  return chain;
}

/** Process-wide default chain used by the tRPC router and server pages. */
export const sonataChain = createSonataChain();

/* Stable, import-friendly wrappers for `apps/web/lib/sonata/chain.ts`. */
export const getPassExpiry = (accountId: string) =>
  sonataChain.getPassExpiry(accountId);
export const isPassActive = (accountId: string) =>
  sonataChain.isPassActive(accountId);
export const buyPass = (role: DemoRole) => sonataChain.buyPass(role);
export const buyMaster = (role: DemoRole, tokenId: string, priceUsdc: string) =>
  sonataChain.buyMaster(role, tokenId, priceUsdc);
export const withdrawFromSong = (
  role: DemoRole,
  tokenId: string,
  amountUsdc?: string,
  accountId?: string,
) => sonataChain.withdrawFromSong(role, tokenId, amountUsdc, accountId);
export const listMaster = (
  role: DemoRole,
  tokenId: string,
  priceUsdc: string,
) => sonataChain.listMaster(role, tokenId, priceUsdc);
export { DEMO_ACCOUNT_IDS, getUsdcBalance };
