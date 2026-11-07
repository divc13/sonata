/**
 * Server-only settlement service for the web app. It signs with the oracle
 * key, so it must never be imported from a client component.
 */
// oxlint-disable-next-line import/no-unassigned-import -- server-only guard is a side-effect import
import "server-only";

export {
  runDemoSettlement,
  settleEpoch,
  SonataSettlementError,
  sonataSettlementService,
} from "./settlement-core";
export type {
  DemoSettlementResult,
  SettlementOptions,
  SettleEpochResult,
} from "./settlement-core";
