/**
 * Pure epoch settlement math (specs/03-accounting.md).
 *
 * Micro-USDC values are bigint/string only; nothing here converts money
 * through `number`. The contract applies the same floor formulas, so these
 * helpers also predict the per-song rows written after settlement.
 */
import {
  RATE_PER_HOUR_USDC_MICRO,
  type Epoch,
  type PayoutEntry,
} from "@infinitunes/near";

const SECONDS_PER_HOUR = 3600n;

export type PayoutMathResult = {
  totalSeconds: number;
  effectiveRatePerHour: string;
  totalPaidUsdc: string;
  /** Dust stays in the platform; never redistributed. */
  dustUsdc: string;
  mode: "constant" | "pro-rata";
  payouts: Array<{
    tokenId: string;
    seconds: number;
    amountUsdc: string;
  }>;
};

/** Validates the contract's entry preconditions: nonempty, sorted, unique. */
export function assertPayoutEntries(entries: PayoutEntry[]): void {
  if (entries.length === 0) {
    throw new Error("An epoch needs at least one payout entry");
  }

  let previous = "";
  for (const entry of entries) {
    if (
      typeof entry.tokenId !== "string" ||
      entry.tokenId.length === 0 ||
      !Number.isInteger(entry.seconds) ||
      entry.seconds <= 0
    ) {
      throw new Error("Payout entries need a token id and positive seconds");
    }
    if (previous && entry.tokenId <= previous) {
      throw new Error(
        "Payout entries must be sorted by token id with no duplicates",
      );
    }
    previous = entry.tokenId;
  }
}

function microUsdc(value: string | bigint): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error("micro-USDC cannot be negative");
    return value;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error("micro-USDC must be an integer string");
  }
  return BigInt(value);
}

/** `payout_i = floor(effectiveRate * seconds_i / 3600)`, zeros included. */
export function payoutRowsForRate(
  entries: PayoutEntry[],
  effectiveRatePerHourUsdc: string | bigint,
): PayoutMathResult["payouts"] {
  const rate = microUsdc(effectiveRatePerHourUsdc);

  return entries.map((entry) => ({
    tokenId: entry.tokenId,
    seconds: entry.seconds,
    amountUsdc: ((rate * BigInt(entry.seconds)) / SECONDS_PER_HOUR).toString(),
  }));
}

/**
 * Step 1–3 of settlement: effective rate from the platform balance, then a
 * floor payout per entry. `totalPaid <= balance` by construction.
 */
export function computePayouts(
  entries: PayoutEntry[],
  params: {
    balanceBeforeUsdc: string | bigint;
    ratePerHourUsdc: string | bigint;
  },
): PayoutMathResult {
  assertPayoutEntries(entries);

  const balance = microUsdc(params.balanceBeforeUsdc);
  const rate = microUsdc(params.ratePerHourUsdc);
  const totalSeconds = entries.reduce((sum, entry) => sum + entry.seconds, 0);

  const effective =
    totalSeconds === 0
      ? 0n
      : (() => {
          const maxRate = (balance * SECONDS_PER_HOUR) / BigInt(totalSeconds);
          return maxRate < rate ? maxRate : rate;
        })();

  const payouts = payoutRowsForRate(entries, effective);
  const totalPaid = payouts.reduce(
    (sum, payout) => sum + BigInt(payout.amountUsdc),
    0n,
  );

  return {
    totalSeconds,
    effectiveRatePerHour: effective.toString(),
    totalPaidUsdc: totalPaid.toString(),
    dustUsdc: (balance - totalPaid).toString(),
    mode: totalSeconds === 0 || effective === rate ? "constant" : "pro-rata",
    payouts,
  };
}

export type EpochInsertRecord = {
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
  /** The oracle transaction that produced this epoch. */
  txHash: string | null;
};

/**
 * Maps the chain's `get_epoch` view into a `sonata_epoch` insert. The chain id
 * is authoritative: the DB must never mint its own epoch id.
 */
export function mapChainEpoch(
  epoch: Epoch,
  fallbackListenRoot = "",
  txHash: string | null = null,
): EpochInsertRecord {
  if (!Number.isInteger(epoch.id) || epoch.id < 0) {
    throw new Error("The chain returned an invalid epoch id");
  }

  /* The contract spec does not store `mode`; derive it from the paid rate. */
  const mode: "constant" | "pro-rata" =
    epoch.effectiveRatePerHourUsdc === RATE_PER_HOUR_USDC_MICRO
      ? "constant"
      : "pro-rata";

  return {
    id: epoch.id,
    startedAt: new Date(epoch.startedAtSec * 1000),
    closedAt: new Date(epoch.closedAtSec * 1000),
    balanceBeforeUsdc: epoch.balanceBeforeUsdc,
    totalSeconds: epoch.totalSeconds,
    effectiveRatePerHour: epoch.effectiveRatePerHourUsdc,
    totalPaidUsdc: epoch.totalPaidUsdc,
    listenRoot: epoch.listenRoot || fallbackListenRoot,
    entriesCount: epoch.entriesCount,
    mode,
    txHash,
  };
}
