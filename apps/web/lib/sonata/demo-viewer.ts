/**
 * Demo viewer identity for the holder-only manage route.
 *
 * The product gate is ownership read from the master on the server. This cookie
 * only chooses which seeded demo account the page should *pretend* to be, so the
 * demo can show the holder view and the "not the owner" view without signing in.
 * It is never authority: a value outside the allowlist is ignored.
 *
 * Pure and dependency-free so the server page, the switcher and tests share one
 * definition.
 */

export const SONATA_DEMO_VIEWER_COOKIE = "sonata_demo_viewer";

/** The only identities the demo switcher may select. */
export const DEMO_VIEWER_ACCOUNTS = [
  "nadia-sonata.testnet",
  "collector.sonata.testnet",
  "listener.sonata.testnet",
] as const;

export type DemoViewerAccount = (typeof DEMO_VIEWER_ACCOUNTS)[number];

export type DemoViewerOption = {
  accountId: DemoViewerAccount;
  /** Short name shown on the switcher. */
  label: string;
  /** Who this identity is; the demo control is the only surface that says it. */
  detail: string;
};

/** Order is the switcher order: holder first, then buyer, then listener. */
export const DEMO_VIEWER_OPTIONS: readonly DemoViewerOption[] = [
  {
    accountId: "nadia-sonata.testnet",
    label: "Nadia",
    detail: "Artist and holder",
  },
  {
    accountId: "collector.sonata.testnet",
    label: "Collector",
    detail: "Resale buyer",
  },
  {
    accountId: "listener.sonata.testnet",
    label: "Listener",
    detail: "Pass holder",
  },
];

/**
 * The manage page opens as the holder, so `/master/midnight-drive/manage` shows
 * the owner view before anyone touches the demo control.
 */
export const DEFAULT_DEMO_VIEWER_ACCOUNT: DemoViewerAccount =
  "nadia-sonata.testnet";

/** Narrowing check against the allowlist. */
export function isDemoViewerAccount(
  value: unknown,
): value is DemoViewerAccount {
  return (
    typeof value === "string" &&
    (DEMO_VIEWER_ACCOUNTS as readonly string[]).includes(value)
  );
}

/**
 * The account id stored in the cookie, or `null` when the cookie is missing or
 * holds anything outside the allowlist.
 */
export function parseDemoViewerCookie(
  value: string | null | undefined,
): DemoViewerAccount | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isDemoViewerAccount(trimmed) ? trimmed : null;
}

/** The cookie value, falling back to the default holder identity. */
export function resolveDemoViewerAccount(
  value: string | null | undefined,
): DemoViewerAccount {
  return parseDemoViewerCookie(value) ?? DEFAULT_DEMO_VIEWER_ACCOUNT;
}
