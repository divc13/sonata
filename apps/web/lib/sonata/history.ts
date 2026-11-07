import type {
  SonataListingRow,
  SonataOwnershipRow,
  SonataPayoutRow,
} from "@infinitunes/types";

import { formatUsdMicro2 } from "./market";

/**
 * The per-master timeline, built only from mirrored database rows.
 *
 * Money stays a micro-USDC string; this module only formats it. It is imported
 * by a client component, so it deliberately has no runtime dependency on
 * `@infinitunes/near` (which pulls chain SDK code).
 */

export type MasterHistoryEvent =
  | {
      kind: "mint" | "transfer" | "sale";
      key: string;
      at: Date;
      accountId: string;
      priceUsdc: string | null;
      txHash: string | null;
    }
  | {
      kind: "listing";
      key: string;
      at: Date;
      accountId: string;
      priceUsdc: string;
      txHash: string | null;
      active: boolean;
    }
  | {
      kind: "payout";
      key: string;
      at: Date;
      epochId: number;
      amountUsdc: string;
      seconds: number;
      txHash: string | null;
    };

/** Stable order when two rows share a timestamp. */
const KIND_ORDER: Record<MasterHistoryEvent["kind"], number> = {
  mint: 0,
  listing: 1,
  sale: 2,
  transfer: 3,
  payout: 4,
};

/**
 * Merges ownership, listing and payout rows into one oldest-first timeline.
 * Ties use a fixed kind order (mint before its listing, before a sale, before
 * payouts) and then the row key, so the same input always renders the same
 * order on the server and after a refresh.
 */
export function buildMasterHistory({
  ownership,
  listings,
  payouts,
}: {
  ownership: readonly SonataOwnershipRow[];
  listings: readonly SonataListingRow[];
  payouts: readonly SonataPayoutRow[];
}): MasterHistoryEvent[] {
  const events: MasterHistoryEvent[] = [
    ...ownership.map((row): MasterHistoryEvent => ({
      kind: row.eventType,
      key: `ownership:${row.id}`,
      at: row.acquiredAt,
      accountId: row.ownerAccountId,
      priceUsdc: row.priceUsdc,
      txHash: row.txHash,
    })),
    ...listings.map((row): MasterHistoryEvent => ({
      kind: "listing",
      key: `listing:${row.id}`,
      at: row.createdAt,
      accountId: row.sellerAccountId,
      priceUsdc: row.priceUsdc,
      txHash: row.txHash,
      active: row.active,
    })),
    ...payouts.map((row): MasterHistoryEvent => ({
      kind: "payout",
      key: `payout:${row.epochId}:${row.tokenId}`,
      at: row.createdAt,
      epochId: row.epochId,
      amountUsdc: row.amountUsdc,
      seconds: row.seconds,
      txHash: row.txHash,
    })),
  ];

  return events.sort((a, b) => {
    const byTime = a.at.getTime() - b.at.getTime();
    if (byTime !== 0) return byTime;
    const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (byKind !== 0) return byKind;
    return a.key.localeCompare(b.key);
  });
}

/** True once the master has a sale, transfer, listing or payout. */
export function hasHistoryBeyondMint(
  events: readonly MasterHistoryEvent[],
): boolean {
  return events.some((event) => event.kind !== "mint");
}

/** `nadia-sonata.testnet` stays whole; long ids are clipped. */
export function shortAccountId(accountId: string): string {
  const id = accountId.trim();
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}…${id.slice(-4)}`;
}

/** Cuts a transaction hash down to a readable proof label. */
export function shortTxHash(hash: string, head = 8, tail = 6): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/** `43560` -> `"12.10 h"`, matching the rest of the Sonata money readouts. */
export function formatHistoryHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(2)} h`;
}

/** Seeded demo history uses negative ids; real chain epochs start at 1. */
export function formatHistoryEpoch(epochId: number): string {
  return epochId < 0 ? `Demo ${-epochId}` : `Epoch ${epochId}`;
}

const historyDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Stable UTC date label, so the server and a refresh agree. */
export function formatHistoryDate(date: Date): string {
  return historyDate.format(date);
}

/** The bold timeline line: who or what the event is. */
export function historyEventLabel(event: MasterHistoryEvent): string {
  switch (event.kind) {
    case "mint":
      return "Minted";
    case "listing":
      return "Listed for sale";
    case "sale":
      return `Sold to ${shortAccountId(event.accountId)}`;
    case "transfer":
      return `Transferred to ${shortAccountId(event.accountId)}`;
    case "payout":
      return `${formatHistoryEpoch(event.epochId)} payout`;
  }
}

/** The right-aligned amount, or `null` when the event carries no money. */
export function historyEventAmount(event: MasterHistoryEvent): string | null {
  switch (event.kind) {
    case "mint":
    case "transfer":
      return null;
    case "listing":
    case "sale":
      return event.priceUsdc ? formatUsdMicro2(event.priceUsdc) : null;
    case "payout":
      return formatUsdMicro2(event.amountUsdc);
  }
}

/** The quiet second line: date, counterparty, verified hours, tx hash. */
export function historyEventMeta(event: MasterHistoryEvent): {
  date: string;
  detail: string | null;
  txHash: string | null;
} {
  switch (event.kind) {
    case "mint":
      return {
        date: formatHistoryDate(event.at),
        detail: `to ${shortAccountId(event.accountId)}`,
        txHash: event.txHash,
      };
    case "listing":
      return {
        date: formatHistoryDate(event.at),
        detail: event.active
          ? `Seller ${shortAccountId(event.accountId)}`
          : `Seller ${shortAccountId(event.accountId)} · closed`,
        txHash: event.txHash,
      };
    case "sale":
    case "transfer":
      return {
        date: formatHistoryDate(event.at),
        detail: null,
        txHash: event.txHash,
      };
    case "payout":
      return {
        date: formatHistoryDate(event.at),
        detail: `${formatHistoryHours(event.seconds)} verified`,
        txHash: event.txHash,
      };
  }
}
