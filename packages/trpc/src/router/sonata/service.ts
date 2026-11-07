/**
 * Structural contract for the server-side listen/settlement service.
 *
 * The implementation lives in `apps/web/lib/sonata` (it needs the database and
 * the oracle signer). Keeping the interface here lets the tRPC package stay
 * free of an `apps/web` import, while the web adapter injects the real service
 * and tests inject a fake one.
 */
import type { Epoch, PayoutEntry } from "@infinitunes/near";

export type ListenRecordInput = {
  accountId: string;
  tokenId: string;
  /** Verified heartbeat seconds, 1..60. */
  seconds: number;
  /** Heartbeat start as unix seconds. */
  startedAt: number;
  clientEventId: string;
  /** A no-pass preview: stored for inspection, never credited. */
  preview?: boolean;
};

export type ListenRecordResult = {
  id: number;
  verified: boolean;
  reason: string | null;
  duplicate: boolean;
};

export type DemoSettlementResult = {
  txHash: string;
  epoch: Epoch;
  entries: PayoutEntry[];
  listenRoot: string;
  created: true;
  totalSeconds: number;
  totalPaidUsdc: string;
};

export type SonataSettlementService = {
  recordListen(input: ListenRecordInput): Promise<ListenRecordResult>;
  runDemoSettlement(epochId: number): Promise<DemoSettlementResult>;
};
