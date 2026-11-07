/**
 * Server-only Sonata chain flows for the web app. Components must call these
 * through a server component/action (or the `sonata` tRPC router), never from a
 * client bundle: they sign with demo keys from the server environment.
 */
// oxlint-disable-next-line import/no-unassigned-import -- server-only guard is a side-effect import
import "server-only";
import { CONTRACT_IDS, viewFunction } from "@infinitunes/near";

/**
 * `platform.get_stats().next_epoch_id`: the only epoch id `settle_epoch`
 * accepts. The deployed contract is authoritative; Postgres can lag it (or,
 * as in the demo seed, contain negative history that is not a chain id).
 */
export async function getPlatformNextEpochId(): Promise<number> {
  const stats = await viewFunction<Record<string, unknown>>(
    CONTRACT_IDS.platform,
    "get_stats",
  );
  const raw = stats?.next_epoch_id;
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : Number.NaN;

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("platform.get_stats returned no next_epoch_id.");
  }

  return value;
}

export {
  buyMaster,
  buyPass,
  getPassExpiry,
  getUsdcBalance,
  isPassActive,
  listMaster,
  withdrawFromSong,
} from "@infinitunes/near";
export type { ChainResult, DemoRole } from "@infinitunes/near";
