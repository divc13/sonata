/**
 * Master token ids double as sub-account prefixes
 * (`<token>.masters-sonata.testnet`), so validate them before building an
 * account id or a contract argument. The rules mirror
 * contracts/master-nft/src and specs/02-contracts.md.
 */
import { SonataChainError } from "./errors";

export const TOKEN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const RESERVED_TOKEN_IDS = new Set([
  "platform",
  "market",
  "usdc",
  "oracle",
  "masters",
  "admin",
]);

/** 3..40 chars, lowercase ASCII, no leading/trailing hyphen, not reserved. */
export function isValidTokenId(tokenId: string): boolean {
  return TOKEN_ID_PATTERN.test(tokenId) && !RESERVED_TOKEN_IDS.has(tokenId);
}

export function assertTokenId(tokenId: string): string {
  if (!isValidTokenId(tokenId)) {
    throw new SonataChainError(
      "invalid-input",
      `Invalid master token id: "${tokenId}". Use 3-40 lowercase letters, digits or hyphens.`,
    );
  }
  return tokenId;
}

/** Keyless song account for a master, e.g. `midnight-drive.masters-sonata.testnet`. */
export function songAccountId(tokenId: string, collectionId: string): string {
  return `${assertTokenId(tokenId)}.${collectionId}`;
}
