/**
 * Epoch settlement orchestration (specs/03-accounting.md).
 *
 * The oracle aggregates verified listens, submits `platform.settle_epoch`
 * with the oracle key, then mirrors the chain epoch and its payouts into
 * Postgres. The chain id is authoritative; an existing DB epoch is never
 * overwritten.
 */
import { db as defaultDb } from "@infinitunes/db";
import type { DbClient } from "@infinitunes/db/client";
import { sonataEpoch, sonataPayout } from "@infinitunes/db/schema";
import {
  RATE_PER_HOUR_USDC_MICRO,
  settlementChain,
  type ChainResult,
  type Epoch,
  type PayoutEntry,
  type SettlementChain,
} from "@infinitunes/near";
import { eq } from "drizzle-orm";

import {
  aggregateEpoch,
  demoEpochWindow,
  recordListen,
  type RecordListenInput,
  type RecordListenResult,
} from "./listens-core";
import {
  assertPayoutEntries,
  mapChainEpoch,
  payoutRowsForRate,
} from "./settlement-math";

export class SonataSettlementError extends Error {
  constructor(
    readonly code:
      | "invalid-input"
      | "epoch-exists"
      | "empty-epoch"
      | "chain-mismatch",
    message: string,
  ) {
    super(message);
    this.name = "SonataSettlementError";
  }
}

export type SettlementOptions = {
  db?: DbClient;
  chain?: SettlementChain;
  now?: Date;
};

export type SettleEpochResult = {
  txHash: string;
  epoch: Epoch;
  entries: PayoutEntry[];
  listenRoot: string;
};

export type DemoSettlementResult = SettleEpochResult & {
  created: true;
  totalSeconds: number;
  totalPaidUsdc: string;
};

/**
 * Submits one already-aggregated epoch as the oracle and returns the stored
 * chain epoch. No database write happens here; `runDemoSettlement` mirrors it.
 */
export async function settleEpoch(
  epochId: number,
  entries: PayoutEntry[],
  listenRoot: string,
  options: Pick<SettlementOptions, "chain"> = {},
): Promise<SettleEpochResult> {
  if (!Number.isInteger(epochId) || epochId < 0) {
    throw new SonataSettlementError("invalid-input", "Invalid epoch id.");
  }
  assertPayoutEntries(entries);
  if (!listenRoot) {
    throw new SonataSettlementError(
      "invalid-input",
      "The listen root is required.",
    );
  }

  const chain = options.chain ?? settlementChain;
  const result: ChainResult = await chain.settleEpoch(
    epochId,
    entries,
    listenRoot,
  );

  const epoch = await chain.getEpoch(epochId);
  if (!epoch) {
    throw new SonataSettlementError(
      "chain-mismatch",
      `Settlement transaction ${result.txHash} landed but epoch ${epochId} is not readable yet.`,
    );
  }
  if (epoch.id !== epochId) {
    throw new SonataSettlementError(
      "chain-mismatch",
      `The chain returned epoch ${epoch.id} for requested epoch ${epochId}.`,
    );
  }
  if (epoch.listenRoot !== listenRoot) {
    throw new SonataSettlementError(
      "chain-mismatch",
      "The on-chain listen root does not match the submitted bundle.",
    );
  }

  return {
    txHash: result.txHash,
    epoch,
    entries,
    listenRoot,
  };
}

/**
 * Demo settlement: aggregate the rolling window, settle on chain, then write
 * `sonata_epoch` + `sonata_payout`. An epoch id that already exists in the DB
 * is rejected before the oracle call, so a re-run can never double-pay.
 */
export async function runDemoSettlement(
  epochId: number,
  options: SettlementOptions & { window?: { from: Date; to: Date } } = {},
): Promise<DemoSettlementResult> {
  const db = options.db ?? defaultDb;
  const now = options.now ?? new Date();

  const [existing] = await db
    .select({ id: sonataEpoch.id, txHash: sonataEpoch.txHash })
    .from(sonataEpoch)
    .where(eq(sonataEpoch.id, epochId))
    .limit(1);

  if (existing) {
    throw new SonataSettlementError(
      "epoch-exists",
      `Epoch ${epochId} is already settled${existing.txHash ? ` (tx ${existing.txHash})` : ""}.`,
    );
  }

  const window = options.window ?? demoEpochWindow(now);
  const aggregate = await aggregateEpoch(epochId, window.from, window.to, {
    db,
    now,
  });

  if (aggregate.entries.length === 0) {
    throw new SonataSettlementError(
      "empty-epoch",
      `Epoch ${epochId} has no verified listening seconds.`,
    );
  }

  const settled = await settleEpoch(
    epochId,
    aggregate.entries,
    aggregate.listenRoot,
    { chain: options.chain },
  );

  const payoutRows = payoutRowsForRate(
    settled.entries,
    settled.epoch.effectiveRatePerHourUsdc,
  );
  const computedPaid = payoutRows.reduce(
    (sum, payout) => sum + BigInt(payout.amountUsdc),
    0n,
  );

  if (computedPaid.toString() !== settled.epoch.totalPaidUsdc) {
    throw new SonataSettlementError(
      "chain-mismatch",
      `Computed payouts (${computedPaid.toString()}) do not match the chain total (${settled.epoch.totalPaidUsdc}).`,
    );
  }

  const epochRow = mapChainEpoch(
    settled.epoch,
    settled.listenRoot,
    settled.txHash,
  );

  await db.transaction(async (tx) => {
    const [duplicate] = await tx
      .select({ id: sonataEpoch.id })
      .from(sonataEpoch)
      .where(eq(sonataEpoch.id, epochRow.id))
      .limit(1);

    if (duplicate) {
      throw new SonataSettlementError(
        "epoch-exists",
        `Epoch ${epochRow.id} was inserted while settling; refusing to overwrite it.`,
      );
    }

    await tx.insert(sonataEpoch).values(epochRow);

    if (payoutRows.length > 0) {
      await tx.insert(sonataPayout).values(
        payoutRows.map((payout) => ({
          epochId: epochRow.id,
          tokenId: payout.tokenId,
          seconds: payout.seconds,
          amountUsdc: payout.amountUsdc,
          txHash: settled.txHash,
        })),
      );
    }
  });

  return {
    ...settled,
    created: true,
    totalSeconds: epochRow.totalSeconds,
    totalPaidUsdc: epochRow.totalPaidUsdc,
  };
}

/** Service object injected into the tRPC context by the web adapter. */
export const sonataSettlementService = {
  recordListen: (input: RecordListenInput): Promise<RecordListenResult> =>
    recordListen(input),
  runDemoSettlement: (epochId: number): Promise<DemoSettlementResult> =>
    runDemoSettlement(epochId),
};

/** The fixed rate is locked in specs/03-accounting.md. */
export const SONATA_RATE_PER_HOUR_USDC = RATE_PER_HOUR_USDC_MICRO;
