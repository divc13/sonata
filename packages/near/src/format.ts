/**
 * Display formatting for Sonata money, time and accounts.
 *
 * All chain amounts are integers: USDC is micro-USDC (6 decimals, `U128`
 * serialized as a string) and listening time is seconds, exactly like
 * specs/03-accounting.md. Never do floating-point math on chain amounts;
 * these helpers only slice BigInt digits for display.
 */

export type MicroUsdc = string | bigint | number;

/** `5000000` -> `"5.00"`, `128400123` -> `"128.400123"`. */
export function microUsdcToUsd(micro: MicroUsdc): string {
  let value: bigint;
  if (typeof micro === "bigint") {
    value = micro;
  } else if (typeof micro === "number") {
    // JS numbers are safe up to 2^53 micro-USDC (~$9e9) which covers every
    // realistic demo amount; bigger sources must pass strings.
    value = BigInt(Math.round(micro));
  } else {
    value = BigInt(micro.trim() === "" ? "0" : micro.trim());
  }

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1_000_000n;
  const fractional = (abs % 1_000_000n).toString().padStart(6, "0");
  // Prices carry whole cents; balances keep their trailing dust digits.
  const trimmed = fractional.replace(/0+$/, "") || "0";
  const cents = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed;

  return `${negative ? "-" : ""}${whole}.${cents}`;
}

/** `"5000000"` micro-USDC -> `"$5.00"`. */
export function formatUsdMicro(micro: MicroUsdc): string {
  return `$${microUsdcToUsd(micro)}`;
}

/** `5.5` -> `"$5.50"`; `"$50"` -> `"$50"` passes through unchanged. */
export function formatUsd(usd: number | string): string {
  if (typeof usd === "number") {
    return `$${usd.toFixed(2)}`;
  }
  const trimmed = usd.trim();
  return trimmed.startsWith("$") ? trimmed : `$${trimmed}`;
}

/** Seconds converted to hours, truncated to two decimals (never rounded up). */
export function hoursOf(seconds: number): number {
  return Math.floor(seconds / 36) / 100;
}

/** `14400` -> `"4.00 h"`. */
export function formatHours(seconds: number): string {
  return `${hoursOf(seconds).toFixed(2)} h`;
}

/** `nadia-sonata.testnet` stays whole; long contract/account ids get clipped. */
export function shortAccount(accountId: string): string {
  const id = accountId.trim();
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}…${id.slice(-4)}`;
}
