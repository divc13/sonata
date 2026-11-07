/**
 * Oracle-side settlement calls (specs/02-contracts.md, "Settle epoch").
 *
 * This module only ever signs with the oracle role. The key is resolved
 * lazily from `SONATA_ORACLE_SECRET_KEY`; it is never logged, returned or
 * embedded in an error message.
 */
import type { SerializedReturnValue } from "near-api-js";

import {
  callFunction as defaultCallFunction,
  createSignedAccount as defaultCreateSignedAccount,
  normalizeU128,
  viewFunction as defaultViewFunction,
  type ChainAccount,
  type ChainResult,
} from "./client";
import { CONTRACT_IDS, DEFAULT_FUNCTION_CALL_GAS } from "./config";
import {
  getDemoSigner as defaultGetDemoSigner,
  type DemoSigner,
} from "./demo-accounts";
import { SonataChainError } from "./errors";
import type { Epoch, PayoutEntry } from "./types";

/** The settlement callback fans out one ft_transfer per earning song. */
export const SETTLEMENT_GAS = 300_000_000_000_000n;

type CallFunction = (
  account: ChainAccount,
  contractId: string,
  method: string,
  args?: Record<string, unknown>,
  options?: { deposit?: bigint; gas?: bigint },
) => Promise<ChainResult>;

type ViewFunction = <T extends SerializedReturnValue>(
  contractId: string,
  method: string,
  args?: Record<string, unknown>,
) => Promise<T | undefined>;

export type SettlementChain = {
  settleEpoch(
    epochId: number,
    entries: PayoutEntry[],
    listenRoot: string,
  ): Promise<ChainResult>;
  getEpoch(epochId: number): Promise<Epoch | undefined>;
};

export type SettlementChainDependencies = {
  callFunction?: CallFunction;
  viewFunction?: ViewFunction;
  createSignedAccount?: (accountId: string, secretKey: string) => ChainAccount;
  resolveSigner?: (role: "oracle") => DemoSigner;
};

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  return 0;
}

function first(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined) return raw[key];
  }
  return undefined;
}

function toEpoch(raw: Record<string, unknown>): Epoch {
  const mode = first(raw, "mode");
  return {
    id: asNumber(first(raw, "id")),
    startedAtSec: asNumber(first(raw, "started_at", "startedAtSec")),
    closedAtSec: asNumber(first(raw, "closed_at", "closedAtSec")),
    balanceBeforeUsdc: normalizeU128(
      first(raw, "balance_before", "balanceBeforeUsdc"),
    ),
    totalSeconds: asNumber(first(raw, "total_seconds", "totalSeconds")),
    effectiveRatePerHourUsdc: normalizeU128(
      first(raw, "effective_rate_per_hour", "effectiveRatePerHourUsdc"),
    ),
    totalPaidUsdc: normalizeU128(first(raw, "total_paid", "totalPaidUsdc")),
    listenRoot:
      typeof first(raw, "listen_root", "listenRoot") === "string"
        ? String(first(raw, "listen_root", "listenRoot"))
        : "",
    entriesCount: asNumber(first(raw, "entries_count", "entriesCount")),
    mode: mode === "pro-rata" ? "pro-rata" : "constant",
  };
}

export function buildSettleEpochCall(
  epochId: number,
  entries: PayoutEntry[],
  listenRoot: string,
): {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
  deposit: bigint;
  gas: bigint;
} {
  if (!Number.isInteger(epochId) || epochId < 0) {
    throw new SonataChainError("invalid-input", "Invalid epoch id.");
  }
  if (entries.length === 0) {
    throw new SonataChainError("invalid-input", "An epoch needs entries.");
  }
  if (!listenRoot) {
    throw new SonataChainError("invalid-input", "The listen root is required.");
  }

  return {
    contractId: CONTRACT_IDS.platform,
    method: "settle_epoch",
    args: {
      epoch_id: epochId,
      entries: entries.map((entry) => ({
        token_id: entry.tokenId,
        seconds: entry.seconds,
      })),
      listen_root: listenRoot,
    },
    deposit: 0n,
    gas:
      SETTLEMENT_GAS > DEFAULT_FUNCTION_CALL_GAS
        ? SETTLEMENT_GAS
        : DEFAULT_FUNCTION_CALL_GAS,
  };
}

/**
 * Builds the oracle client. Tests inject the RPC functions, so no live
 * testnet call is needed to exercise settlement orchestration.
 */
export function createSettlementChain(
  dependencies: SettlementChainDependencies = {},
): SettlementChain {
  const call = dependencies.callFunction ?? defaultCallFunction;
  const view = dependencies.viewFunction ?? defaultViewFunction;
  const createSignedAccount =
    dependencies.createSignedAccount ?? defaultCreateSignedAccount;
  const resolveSigner = dependencies.resolveSigner ?? defaultGetDemoSigner;

  return {
    async settleEpoch(epochId, entries, listenRoot) {
      const prepared = buildSettleEpochCall(epochId, entries, listenRoot);
      const signer = resolveSigner("oracle");
      const account = createSignedAccount(signer.accountId, signer.secretKey);
      return call(
        account,
        prepared.contractId,
        prepared.method,
        prepared.args,
        { deposit: prepared.deposit, gas: prepared.gas },
      );
    },

    async getEpoch(epochId) {
      const raw = await view<Record<string, unknown>>(
        CONTRACT_IDS.platform,
        "get_epoch",
        { epoch_id: epochId },
      );
      return raw ? toEpoch(raw) : undefined;
    },
  };
}

/** Process-wide oracle client used by the web settlement service. */
export const settlementChain = createSettlementChain();
