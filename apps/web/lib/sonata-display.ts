/**
 * Display helpers for the Sonata audit and artist dashboards.
 *
 * Money stays a micro-USDC string end to end (`specs/03-accounting.md`); these
 * helpers only format it for output or sum it with `BigInt`. Nothing here is
 * allowed to feed a float back into a money calculation.
 */
import { microUsdcToUsd } from "@infinitunes/near";
import type { SonataEpochSummary, SonataPayoutRow } from "@infinitunes/types";

/** `"50000000"` micro-USDC -> `"$50.00"`. */
export function formatMicroUsd(micro: string | null | undefined): string {
  if (!micro) return "$0.00";
  return `$${microUsdcToUsd(micro)}`;
}

/** `"30000"` micro-USDC per hour -> `"$0.03 / hr"`. */
export function formatRatePerHour(perHourMicro: string): string {
  return `${formatMicroUsd(perHourMicro)} / hr`;
}

/** Seconds to a compact listening-hours label: `43560` -> `"12.1 h"`. */
export function formatListenHours(seconds: number): string {
  return `${(seconds / 3600).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} h`;
}

/** Sum micro-USDC strings exactly, never through a float. */
export function sumMicro(amounts: Iterable<string>): string {
  let total = 0n;
  for (const amount of amounts) {
    const trimmed = amount.trim();
    if (trimmed !== "") total += BigInt(trimmed);
  }
  return total.toString();
}

/** The next epoch the oracle may settle: `max(id) + 1`, or 0 when empty. */
export function nextEpochId(epochs: readonly { id: number }[]): number {
  let max = -1;
  for (const epoch of epochs) {
    if (epoch.id > max) max = epoch.id;
  }
  return max + 1;
}

const epochDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Stable UTC date label, so the server and a refresh agree. */
export function formatEpochDate(date: Date): string {
  return epochDate.format(date);
}

export function formatEpochRange(
  epoch: Pick<SonataEpochSummary, "startedAt" | "closedAt">,
): string {
  return `${formatEpochDate(epoch.startedAt)} – ${formatEpochDate(epoch.closedAt)}`;
}

/** Cuts a settlement root or transaction hash down to a readable proof label. */
export function shortHash(hash: string, head = 8, tail = 6): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export type EpochEarnings = {
  epochId: number;
  /** micro-USDC summed across the song ids passed in. */
  amountUsdc: string;
  seconds: number;
};

/**
 * Groups per-song payout rows into one row per epoch, summing exact micro-USDC
 * and listen seconds. Rows are returned oldest epoch first.
 */
export function earningsByEpoch(
  payouts: readonly SonataPayoutRow[],
  tokenIds: ReadonlySet<string>,
): EpochEarnings[] {
  const totals = new Map<number, { amount: bigint; seconds: number }>();

  for (const payout of payouts) {
    if (!tokenIds.has(payout.tokenId)) continue;
    const current = totals.get(payout.epochId) ?? {
      amount: 0n,
      seconds: 0,
    };
    current.amount += BigInt(payout.amountUsdc);
    current.seconds += payout.seconds;
    totals.set(payout.epochId, current);
  }

  return [...totals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([epochId, total]) => ({
      epochId,
      amountUsdc: total.amount.toString(),
      seconds: total.seconds,
    }));
}

export type PayoutReceipt = {
  /** Stable React key: one payout per song per epoch. */
  key: string;
  tokenId: string;
  title: string;
  seconds: number;
  amountUsdc: string;
  txHash: string | null;
};

/**
 * Maps an epoch's payout rows to receipt lines. Unknown token ids fall back to
 * the id so a payout is never dropped from the ledger.
 */
export function payoutsToReceipts(
  payouts: readonly SonataPayoutRow[],
  titles: ReadonlyMap<string, string>,
): PayoutReceipt[] {
  return payouts.map((payout) => ({
    key: `${payout.epochId}:${payout.tokenId}`,
    tokenId: payout.tokenId,
    title: titles.get(payout.tokenId) ?? payout.tokenId,
    seconds: payout.seconds,
    amountUsdc: payout.amountUsdc,
    txHash: payout.txHash,
  }));
}
