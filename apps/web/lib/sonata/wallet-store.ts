/**
 * The connected wallet account, kept in the `sonata_wallet` cookie so server
 * components can read it per request.
 *
 * The cookie is public identity, not a secret, so the browser writes it
 * directly (`path=/`, `SameSite=Lax`, 30 days) and this module is the only
 * writer. A small external store lets the header, sidebar and page actions
 * share one value without a React provider round trip.
 */
import {
  parseWalletCookie,
  SONATA_WALLET_COOKIE,
  SONATA_WALLET_COOKIE_MAX_AGE,
  walletCookieValue,
} from "./wallet";

let cached: string | null | undefined;
const listeners = new Set<() => void>();

function readCookie(): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${SONATA_WALLET_COOKIE}=`;
  for (const part of document.cookie.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) {
      return parseWalletCookie(entry.slice(prefix.length));
    }
  }
  return null;
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** The connected account, read from the cookie once per page load. */
export function getWalletAccountSnapshot(): string | null {
  if (cached === undefined) cached = readCookie();
  return cached;
}

/** The server render (and hydration) always starts disconnected. */
export function getServerWalletAccountSnapshot(): string | null {
  return null;
}

export function subscribeWalletAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Persists a connected account and notifies every subscriber. */
export function writeWalletAccount(accountId: string): void {
  if (typeof document === "undefined") return;

  const value = walletCookieValue(accountId);
  document.cookie = `${SONATA_WALLET_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${SONATA_WALLET_COOKIE_MAX_AGE}; SameSite=Lax`;
  cached = value;
  emit();
}

/** Forgets the account in the cookie and notifies every subscriber. */
export function clearWalletAccount(): void {
  if (typeof document === "undefined") return;

  document.cookie = `${SONATA_WALLET_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  cached = null;
  emit();
}

/** Re-reads the cookie (another tab or the server may have changed it). */
export function refreshWalletAccount(): void {
  cached = readCookie();
  emit();
}
