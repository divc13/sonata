import type { DemoRole } from "@infinitunes/near";
import type { SonataListingWithSong } from "@infinitunes/types";

/**
 * Market display helpers. Money is always micro-USDC text (6 decimals), so
 * conversion stays in `BigInt` and never touches a float.
 *
 * This module is imported by client components, so it deliberately has no
 * runtime dependency on `@infinitunes/near` (which pulls chain SDK code).
 */

const MICRO_PER_USD = 1_000_000n;
const MICRO_PER_CENT = 10_000n;

/** Demo owner accounts, mirrored from `@infinitunes/near` config. */
const NADIA_ACCOUNT = "nadia-sonata.testnet";
const COLLECTOR_ACCOUNT = "collector.sonata.testnet";

/** `"50000000"` micro-USDC -> `"$50.00"`, rounding dust to whole cents. */
export function formatUsdMicro2(micro: string): string {
  let value: bigint;
  try {
    value = BigInt(micro.trim() === "" ? "0" : micro.trim());
  } catch {
    return "$0.00";
  }

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const cents = (abs + MICRO_PER_CENT / 2n) / MICRO_PER_CENT;
  const whole = (cents / 100n).toLocaleString("en-US");
  const fraction = (cents % 100n).toString().padStart(2, "0");

  return `${negative ? "-" : ""}$${whole}.${fraction}`;
}

/**
 * A song-account balance as displayed ("Includes $X.XX"). `null` means the
 * chain read failed, so callers omit the line instead of claiming `$0.00`.
 */
export function formatIncludedBalance(
  micro: string | null | undefined,
): string | null {
  if (micro === null || micro === undefined) return null;
  const trimmed = micro.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return formatUsdMicro2(trimmed);
}

/**
 * A song-account balance column cell. `null` means the RPC read failed, and an
 * unparseable value is treated the same way, so the cell stays truthful instead
 * of claiming `$0.00`. Real zero balances still render as `$0.00`.
 */
export function formatBalanceMicro(micro: string | null | undefined): string {
  return formatIncludedBalance(micro) ?? "—";
}

/**
 * A user-typed dollar amount (`"50"`, `"50.00"`, `"$1,250.50"`) to a positive
 * micro-USDC integer string. Prices carry at most two decimal places; returns
 * `null` for anything that is not a positive dollar amount.
 */
export function usdToMicroUsdc(input: string): string | null {
  const cleaned = input.trim().replace(/^\$/, "").replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [whole = "0", fraction = ""] = cleaned.split(".");
  const micro =
    BigInt(whole) * MICRO_PER_USD + BigInt(fraction.padEnd(6, "0").slice(0, 6));

  return micro > 0n ? micro.toString() : null;
}

/** The demo signer that can act as this master's owner, when there is one. */
export function demoRoleForOwner(accountId: string): DemoRole | null {
  if (accountId === NADIA_ACCOUNT) return "nadia";
  if (accountId === COLLECTOR_ACCOUNT) return "collector";
  return null;
}

/**
 * The active listing for one master, or `null` when the feed row is missing,
 * inactive or belongs to a different token.
 */
export function selectListingForToken(
  listing: SonataListingWithSong | null,
  tokenId: string,
): SonataListingWithSong | null {
  if (!listing || !listing.active || listing.tokenId !== tokenId) return null;
  return listing;
}
