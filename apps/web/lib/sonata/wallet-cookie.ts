/**
 * Server-side read of the connected wallet.
 *
 * The `sonata_wallet` cookie is public identity, not a secret, so there is no
 * signature to verify here: every action re-checks ownership on chain and the
 * server procedures validate the account id again. A missing or malformed
 * cookie reads as "no wallet".
 */
// oxlint-disable-next-line import/no-unassigned-import -- server-only guard is a side-effect import
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";

import { parseWalletCookie, SONATA_WALLET_COOKIE } from "./wallet";

/** Memoized per request: the page and its action panels share one read. */
export const readWalletAccount = cache(async (): Promise<string | null> => {
  const store = await cookies();
  return parseWalletCookie(store.get(SONATA_WALLET_COOKIE)?.value);
});
