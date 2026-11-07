/**
 * Server-only NEAR RPC helpers. Import this module from server code only: it
 * holds signing keys in memory and must never be pulled into a browser bundle.
 *
 * `near-api-js` v7 exposes a small `Account`/`JsonRpcProvider` surface; the
 * demo does not need the legacy `Near`/key-store wrapper.
 */
import {
  Account,
  JsonRpcProvider,
  KeyPairSigner,
  type KeyPairString,
  type SerializedReturnValue,
} from "near-api-js";

import {
  CONTRACT_IDS,
  DEFAULT_FUNCTION_CALL_GAS,
  NEAR_RPC_URL,
} from "./config";
import { SonataChainError, toChainError } from "./errors";

export type ChainResult = {
  /** Base58 transaction hash from `transaction.hash`. */
  txHash: string;
  outcome: "success";
};

export type ChainAccount = {
  accountId: string;
  account: Account;
};

export type CallOptions = {
  /** YoctoNEAR attached to the function call. */
  deposit?: bigint;
  /** Gas units (1 TGas = 10^12). */
  gas?: bigint;
};

type TransactionResponse = Awaited<ReturnType<Account["callFunctionRaw"]>>;

let provider: JsonRpcProvider | undefined;

/** One RPC provider per process; created lazily so imports stay cheap. */
export function getProvider(): JsonRpcProvider {
  provider ??= new JsonRpcProvider({ url: NEAR_RPC_URL });
  return provider;
}

/**
 * Builds a signing account for `accountId`. The key is never stored on the
 * returned object or included in errors.
 */
export function createSignedAccount(
  accountId: string,
  secretKey: string,
): ChainAccount {
  try {
    const signer = KeyPairSigner.fromSecretKey(secretKey as KeyPairString);
    return {
      accountId,
      account: new Account(accountId, getProvider(), signer),
    };
  } catch {
    throw new SonataChainError(
      "missing-key",
      `The configured NEAR key for ${accountId} is not a valid NEAR secret key.`,
    );
  }
}

/** NEP-141/NEP-171 view call; returns the JSON-decoded result. */
export async function viewFunction<T extends SerializedReturnValue>(
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T | undefined> {
  try {
    return await getProvider().callFunction<T>({
      contractId,
      method,
      args,
    });
  } catch (error) {
    throw toChainError(error, `${contractId}.${method}`);
  }
}

function failureOf(response: TransactionResponse): unknown {
  const status: unknown = response.status;
  if (typeof status === "object" && status !== null && "Failure" in status) {
    return (status as { Failure: unknown }).Failure;
  }

  for (const receipt of response.receipts_outcome ?? []) {
    const receiptStatus: unknown = receipt.outcome.status;
    if (
      typeof receiptStatus === "object" &&
      receiptStatus !== null &&
      "Failure" in receiptStatus
    ) {
      return (receiptStatus as { Failure: unknown }).Failure;
    }
  }

  return undefined;
}

/**
 * Sends a function call and waits for final execution. A failed receipt (for
 * example a panic inside `ft_on_transfer`) is treated as a failure even when
 * the outer transaction receipt succeeded.
 */
export async function callFunction(
  signer: ChainAccount,
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
  options: CallOptions = {},
): Promise<ChainResult> {
  try {
    const response = await signer.account.callFunctionRaw({
      contractId,
      methodName: method,
      args,
      deposit: options.deposit ?? 0n,
      gas: options.gas ?? DEFAULT_FUNCTION_CALL_GAS,
      waitUntil: "FINAL",
    });

    const txHash =
      response.transaction?.hash ?? response.transaction_outcome?.id ?? "";
    const failure = failureOf(response);

    if (failure !== undefined) {
      const mapped = toChainError(
        { Failure: failure },
        `${contractId}.${method}`,
      );
      throw new SonataChainError(mapped.code, mapped.message, {
        panic: mapped.panic,
        txHash,
      });
    }

    return { txHash, outcome: "success" };
  } catch (error) {
    const mapped =
      error instanceof SonataChainError
        ? error
        : toChainError(error, `${contractId}.${method}`);

    if (mapped.txHash) throw mapped;
    const responseHash = extractTxHash(error);
    throw responseHash
      ? new SonataChainError(mapped.code, mapped.message, {
          panic: mapped.panic,
          txHash: responseHash,
        })
      : mapped;
  }
}

function extractTxHash(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const hash = (error as { transaction_outcome?: { id?: unknown } })
    .transaction_outcome?.id;
  return typeof hash === "string" && hash.length > 0 ? hash : undefined;
}

/** U128 JSON values arrive as strings, but tolerate numbers from old nodes. */
export function normalizeU128(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? trimmed : "0";
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  return "0";
}

/** `ft_balance_of` on the Sonata USDC contract, as a micro-USDC string. */
export async function getUsdcBalance(accountId: string): Promise<string> {
  const balance = await viewFunction<string>(
    CONTRACT_IDS.usdc,
    "ft_balance_of",
    { account_id: accountId },
  );
  return normalizeU128(balance);
}
