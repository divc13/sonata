/**
 * Server-only reads of the money held by a master's song account. The song
 * account is a plain USDC account, so the balance is just money; callers format
 * it through `formatIncludedBalance` (`lib/sonata/market.ts`).
 */
// oxlint-disable-next-line import/no-unassigned-import -- server-only guard is a side-effect import
import "server-only";
import { getUsdcBalance } from "./chain";

/**
 * `ft_balance_of` for one song account as a micro-USDC string, or `null` when
 * the RPC read fails. A failed read must never break the page: the market and
 * the buy panel still render, they just omit the included amount.
 */
export async function readSongAccountBalance(
  subAccount: string,
): Promise<string | null> {
  try {
    return await getUsdcBalance(subAccount);
  } catch (error) {
    console.error("[sonata:balance] could not read song account balance", {
      subAccount,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Reads many song-account balances in parallel, keyed by account id. Duplicate
 * accounts (a master listed once) are read once. Individual failures stay
 * `null` and never reject the batch.
 */
export async function readSongAccountBalances(
  subAccounts: readonly string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(subAccounts)];
  const balances = await Promise.all(
    unique.map((subAccount) => readSongAccountBalance(subAccount)),
  );

  return new Map(
    unique.map((subAccount, index) => [subAccount, balances[index] ?? null]),
  );
}
