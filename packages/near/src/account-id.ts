/**
 * NEAR account-id rules, mirrored from the protocol: 2..64 characters,
 * lowercase ASCII alphanumerics separated by single `-`, `_` or `.` (no
 * leading, trailing or doubled separator). Implicit accounts (64 hex chars)
 * match as well.
 *
 * Wallet procedures take an account id straight from the connected wallet, so
 * validate it here instead of trusting a client-provided string: it is used as
 * a transfer receiver and as a DB key.
 */
import { SonataChainError } from "./errors";

/** NEAR's own account-id grammar (lowercase, no consecutive separators). */
export const NEAR_ACCOUNT_ID_PATTERN =
  /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function isValidNearAccountId(accountId: string): boolean {
  return (
    accountId.length >= 2 &&
    accountId.length <= 64 &&
    NEAR_ACCOUNT_ID_PATTERN.test(accountId)
  );
}

/**
 * Trims surrounding whitespace and returns the account id, or throws a
 * readable `invalid-input` error. Account ids are never lowercased silently:
 * an uppercase id is invalid and should be corrected by the caller.
 */
export function assertNearAccountId(accountId: string): string {
  const id = typeof accountId === "string" ? accountId.trim() : "";
  if (!isValidNearAccountId(id)) {
    throw new SonataChainError(
      "invalid-input",
      `Invalid NEAR account id: "${String(accountId)}". Use 2-64 lowercase characters from a-z, 0-9, "-", "_" or ".".`,
    );
  }
  return id;
}
