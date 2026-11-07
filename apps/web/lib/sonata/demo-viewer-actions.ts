"use server";

import { cookies } from "next/headers";

import {
  isDemoViewerAccount,
  SONATA_DEMO_VIEWER_COOKIE,
  type DemoViewerAccount,
} from "./demo-viewer";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Persists the demo identity for the manage route. The value is untrusted and
 * is checked against the allowlist first; anything else is ignored, so the
 * cookie can never select an arbitrary account.
 */
export async function selectDemoViewer(
  accountId: DemoViewerAccount,
): Promise<void> {
  if (!isDemoViewerAccount(accountId)) return;

  const store = await cookies();
  store.set(SONATA_DEMO_VIEWER_COOKIE, accountId, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    // Only the server reads it; the switcher gets the active value as a prop.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
