/**
 * Server-only Sonata chain flows for the web app. Components must call these
 * through a server component/action (or the `sonata` tRPC router), never from a
 * client bundle: they sign with demo keys from the server environment.
 */
// oxlint-disable-next-line import/no-unassigned-import -- server-only guard is a side-effect import
import "server-only";

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
