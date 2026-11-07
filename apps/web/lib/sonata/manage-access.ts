/**
 * The holder-only manage route's owner gate. The page runs this on the server
 * against the master record; the demo viewer cookie only supplies the account
 * being compared. Pure so the page and the tests share one definition.
 */

/** Account ids are case-insensitive on NEAR; compare them normalized. */
export function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

/**
 * `true` only when the viewer account is the current owner. An empty account
 * (a missing cookie, a broken master row) never grants access.
 */
export function canManageMaster(
  viewerAccountId: string,
  ownerAccountId: string,
): boolean {
  const viewer = normalizeAccountId(viewerAccountId);
  if (viewer.length === 0) return false;
  return viewer === normalizeAccountId(ownerAccountId);
}
