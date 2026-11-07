/**
 * Server-only listen pipeline for the web app. Components must reach this
 * through the `sonata` tRPC router or a server action; it reads the database
 * and must never enter a client bundle.
 */
// oxlint-disable-next-line import/no-unassigned-import -- server-only guard is a side-effect import
import "server-only";

export {
  aggregateEpoch,
  DEMO_EPOCH_DAYS,
  demoEpochWindow,
  HEARTBEAT_MAX_SECONDS,
  HEARTBEAT_MIN_SECONDS,
  heartbeatStartedAt,
  recordListen,
  SonataListenError,
} from "./listens-core";
export type {
  AggregateEpochResult,
  ListenServiceOptions,
  RecordListenInput,
  RecordListenResult,
} from "./listens-core";
