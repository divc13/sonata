/**
 * Display helpers for the Sonata audit and artist dashboards.
 *
 * Money stays a micro-USDC string end to end (`specs/03-accounting.md`); these
 * helpers only format it for output or sum it with `BigInt`. Nothing here is
 * allowed to feed a float back into a money calculation.
 */
import { microUsdcToUsd } from "@infinitunes/near";
import type {
  SonataEpochSummary,
  SonataPassCache,
  SonataPayoutRow,
} from "@infinitunes/types";

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

/**
 * The next epoch derived from the mirrored rows: `max(non-negative id) + 1`.
 * The chain is authoritative (the audit page reads `next_epoch_id`); this is
 * only the fallback when that read fails. Real chain epochs start at `1`
 * (`platform.new` initializes `next_epoch_id = 1`).
 *
 * Seeded demo history is stored with negative ids (see `sonata-seed.ts`), so
 * those rows never count here and can never occupy a chain id.
 */
export function nextEpochId(epochs: readonly { id: number }[]): number {
  let max = -1;
  for (const epoch of epochs) {
    if (epoch.id >= 0 && epoch.id > max) max = epoch.id;
  }
  return max + 1;
}

/** Seeded demo history uses negative ids; real chain epochs start at 1. */
export function isDemoEpochId(id: number): boolean {
  return id < 0;
}

/**
 * `-3` -> `"Archive 3"`, `0` -> `"Epoch 0"`. Negative ids are archival history
 * and must never read like a chain epoch id.
 */
export function formatEpochLabel(id: number): string {
  return isDemoEpochId(id) ? `Archive ${-id}` : `Epoch ${id}`;
}

/** Compact chart label: `-3` -> `"A3"`, `0` -> `"E0"`. */
export function epochAxisLabel(id: number): string {
  return isDemoEpochId(id) ? `A${-id}` : `E${id}`;
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

const DAY_MS = 86_400_000;

export type PassStatus = "active" | "expired" | "none";

/**
 * A pass is active only while its expiry is strictly in the future. The chain
 * treats an expiry equal to now as expired, so the cache does too.
 */
export function passStatus(
  pass: Pick<SonataPassCache, "expiresAt"> | null | undefined,
  now: Date,
): PassStatus {
  if (!pass) return "none";
  return pass.expiresAt.getTime() > now.getTime() ? "active" : "expired";
}

export function passStatusLabel(status: PassStatus): string {
  switch (status) {
    case "active":
      return "Pass active";
    case "expired":
      return "Pass ended";
    case "none":
      return "Free tier";
  }
}

/** Whole days left, counting a started day; 0 once the pass has expired. */
export function passDaysRemaining(expiresAt: Date, now: Date): number {
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / DAY_MS);
}

const passDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Stable UTC expiry label, e.g. `December 1, 2026`. */
export function formatPassDate(date: Date): string {
  return passDate.format(date);
}

/**
 * Rounded cents per day for a pass, using integer micro-USDC. `$5.00` over 30
 * days is 17 cents a day; the last fraction of a cent is rounded up.
 */
export function passDailyPriceCents(
  priceMicro: string,
  durationDays: number,
): number {
  if (durationDays <= 0) return 0;
  const denominator = BigInt(durationDays) * 1_000_000n;
  const numerator = BigInt(priceMicro) * 100n;
  return Number((numerator + denominator / 2n) / denominator);
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
