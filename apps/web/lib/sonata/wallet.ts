/**
 * The public NEAR testnet wallet: identity, cookie and the transactions the
 * visitor's own wallet signs.
 *
 * This module is deliberately dependency-free (no chain SDK, no `process.env`)
 * because client components import it. The contract ids, gas and storage
 * amounts mirror `packages/near/src/config.ts`; `tests/sonata-wallet.test.ts`
 * fails if they drift.
 *
 * Money is always a micro-USDC integer string (6 decimals). Nothing here does
 * floating-point math on an amount.
 */

/** Public identity, not a secret: readable by the browser and the server. */
export const SONATA_WALLET_COOKIE = "sonata_wallet";

/** The account stays connected across visits; disconnecting clears it. */
export const SONATA_WALLET_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Shown beside the wallet so nobody mistakes this for mainnet. */
export const SONATA_WALLET_NETWORK_LABEL = "Testnet wallet";

/** Mirror of `CONTRACT_IDS` (packages/near/src/config.ts). */
export const WALLET_CONTRACTS = {
  masters: "masters-sonata.testnet",
  platform: "platform-sonata.testnet",
  market: "market-sonata.testnet",
  usdc: "usdc-sonata.testnet",
} as const;

/**
 * Mirror of the gas the contracts expect. Pass purchase and resale attach
 * 200 Tgas (the mock USDC forwards most of it to `ft_on_transfer`); withdrawals
 * and the two listing calls need 100 Tgas.
 */
export const WALLET_GAS = {
  ftTransferCall: "200000000000000",
  withdraw: "100000000000000",
  approve: "100000000000000",
} as const;

/** YoctoNEAR: 1 guards a NEP-141 transfer, 0.01 NEAR covers contract storage. */
export const ONE_YOCTO = "1";
export const STORAGE_YOCTO = "10000000000000000000000";

/** Mirror of `PASS_PRICE_USDC_MICRO` / `FAUCET_GRANT_USDC_MICRO`. */
export const PASS_PRICE_USDC_MICRO = "5000000";
export const FAUCET_GRANT_USDC_MICRO = "25000000";

/** NEAR's account-id grammar (mirror of `NEAR_ACCOUNT_ID_PATTERN`). */
export const WALLET_ACCOUNT_ID_PATTERN =
  /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** A wallet-selector `FunctionCall` action. */
export type WalletFunctionCall = {
  type: "FunctionCall";
  params: {
    methodName: string;
    args: Record<string, unknown>;
    gas: string;
    deposit: string;
  };
};

/** One transaction, ready for `wallet.signAndSendTransactions`. */
export type WalletTransaction = {
  receiverId: string;
  actions: WalletFunctionCall[];
};

/** Trims surrounding whitespace; account ids are never silently lowercased. */
export function normalizeWalletAccount(value: string): string {
  return value.trim();
}

/** `true` for a syntactically valid NEAR account id (2..64 chars). */
export function isWalletAccountId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = normalizeWalletAccount(value);
  return (
    id.length >= 2 && id.length <= 64 && WALLET_ACCOUNT_ID_PATTERN.test(id)
  );
}

/**
 * The account stored in the cookie, or `null` for a missing/invalid value. A
 * hand-edited cookie can never address an arbitrary account: the server
 * procedures validate it again and the chain checks ownership.
 */
export function parseWalletCookie(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;

  let raw = value;
  try {
    raw = decodeURIComponent(value);
  } catch {
    /* A malformed escape is just an invalid cookie. */
  }

  const id = normalizeWalletAccount(raw);
  return isWalletAccountId(id) ? id : null;
}

/** The cookie value to write for a connected account. */
export function walletCookieValue(accountId: string): string {
  const id = normalizeWalletAccount(accountId);
  if (!isWalletAccountId(id)) {
    throw new Error(`Invalid NEAR account id: "${accountId}".`);
  }
  return id;
}

/** `mira.testnet` -> `mira.testnet`; long ids keep their head and tail. */
export function truncateAccountId(
  accountId: string,
  head = 8,
  tail = 6,
): string {
  const id = normalizeWalletAccount(accountId);
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

const microValue = (micro: string | null | undefined): bigint | null => {
  if (typeof micro !== "string") return null;
  const trimmed = micro.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return BigInt(trimmed);
};

/** `"25000000"` -> `"$25.00"`; an unreadable balance renders as `"—"`. */
export function formatUsdcMicro(micro: string | null | undefined): string {
  const value = microValue(micro);
  if (value === null) return "—";

  const cents = (value + 5_000n) / 10_000n;
  const whole = (cents / 100n).toLocaleString("en-US");
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `$${whole}.${fraction}`;
}

/** `true` when the wallet can cover the pass price. */
export function canAffordPass(
  balanceMicro: string | null | undefined,
): boolean {
  const balance = microValue(balanceMicro);
  return balance !== null && balance >= BigInt(PASS_PRICE_USDC_MICRO);
}

/** NEP-141 `ft_transfer_call` args; `memo: null` matches `Option<String>`. */
export function ftTransferCallArgs(
  receiverId: string,
  amountUsdc: string,
  msg: string,
): Record<string, unknown> {
  return {
    receiver_id: receiverId,
    amount: amountUsdc,
    msg,
    memo: null,
  };
}

/** The market's resale message for one master. */
export function buyMasterMsg(tokenId: string): string {
  return `buy:${tokenId}`;
}

function functionCall(
  methodName: string,
  args: Record<string, unknown>,
  gas: string,
  deposit: string,
): WalletFunctionCall {
  return { type: "FunctionCall", params: { methodName, args, gas, deposit } };
}

/** `usdc.ft_transfer_call(platform, 5 USDC, "pass")` for the connected wallet. */
export function buildPassTransaction(): WalletTransaction {
  return {
    receiverId: WALLET_CONTRACTS.usdc,
    actions: [
      functionCall(
        "ft_transfer_call",
        ftTransferCallArgs(
          WALLET_CONTRACTS.platform,
          PASS_PRICE_USDC_MICRO,
          "pass",
        ),
        WALLET_GAS.ftTransferCall,
        ONE_YOCTO,
      ),
    ],
  };
}

/** `usdc.ft_transfer_call(market, price, "buy:<token>")`. */
export function buildBuyTransaction(
  tokenId: string,
  priceUsdc: string,
): WalletTransaction {
  return {
    receiverId: WALLET_CONTRACTS.usdc,
    actions: [
      functionCall(
        "ft_transfer_call",
        ftTransferCallArgs(
          WALLET_CONTRACTS.market,
          priceUsdc,
          buyMasterMsg(tokenId),
        ),
        WALLET_GAS.ftTransferCall,
        ONE_YOCTO,
      ),
    ],
  };
}

/**
 * `withdraw_all` on the master's song account. The owner's wallet signs it, so
 * the balance moves to the wallet that holds the master.
 */
export function buildWithdrawTransaction(
  songAccountId: string,
): WalletTransaction {
  return {
    receiverId: songAccountId,
    actions: [functionCall("withdraw_all", {}, WALLET_GAS.withdraw, "0")],
  };
}

/**
 * Two transactions the wallet signs in one prompt: approve the market on the
 * collection (0.01 NEAR storage, excess refunded), then create the listing
 * (0.01 NEAR storage).
 */
export function buildListTransactions(
  tokenId: string,
  priceUsdc: string,
): WalletTransaction[] {
  return [
    {
      receiverId: WALLET_CONTRACTS.masters,
      actions: [
        functionCall(
          "nft_approve",
          {
            token_id: tokenId,
            account_id: WALLET_CONTRACTS.market,
            msg: null,
          },
          WALLET_GAS.approve,
          STORAGE_YOCTO,
        ),
      ],
    },
    {
      receiverId: WALLET_CONTRACTS.market,
      actions: [
        functionCall(
          "list",
          { token_id: tokenId, price: priceUsdc },
          WALLET_GAS.approve,
          STORAGE_YOCTO,
        ),
      ],
    },
  ];
}
