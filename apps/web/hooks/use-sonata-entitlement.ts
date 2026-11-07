"use client";

import type { SonataPassCache } from "@infinitunes/types";
import * as React from "react";

import { isPassActive } from "~/lib/sonata-preview";
import { trpc } from "~/lib/trpc/vanilla";

/** The fixed listener the pass page and demo player act for. */
export const DEMO_LISTENER_ACCOUNT_ID = "listener.sonata.testnet";

/**
 * Dispatched on `window` after a purchase lands (the pass page owns the
 * purchase), so the player refetches instead of waiting for its interval.
 */
export const PASS_CHANGED_EVENT = "sonata:pass-changed";

/** Pass status is cheap; refresh it while the player stays mounted. */
export const PASS_REFRESH_MS = 60_000;

type EntitlementOptions = {
  /** Off until the current entry is a Sonata master, so normal playback never queries. */
  enabled?: boolean;
};

/**
 * Reads the demo listener's pass from the cached `sonata_pass` row and keeps it
 * fresh: on mount, when the pass page says it changed, and once a minute.
 *
 * Network failures are silent and leave the last known value in place; a
 * failed first read reads as "no pass", which is the safe side for previews.
 */
export function useSonataEntitlement({
  enabled = true,
}: EntitlementOptions = {}) {
  const [pass, setPass] = React.useState<SonataPassCache | null>(null);
  const [settled, setSettled] = React.useState(false);
  const requestRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = React.useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const next = await trpc.sonata.pass.byAccount.query({
        accountId: DEMO_LISTENER_ACCOUNT_ID,
      });
      if (!mountedRef.current || request !== requestRef.current) return;
      setPass(next);
    } catch {
      // Entitlement is not worth a toast; the last value (or no pass) stands.
    } finally {
      if (mountedRef.current && request === requestRef.current) {
        setSettled(true);
      }
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    // Deferred one tick: the fetch resolves on its own, which keeps this
    // effect to external-system setup (window listeners, the interval).
    const kick = window.setTimeout(() => void refetch(), 0);
    const refresh = () => void refetch();
    window.addEventListener(PASS_CHANGED_EVENT, refresh);
    const interval = window.setInterval(refresh, PASS_REFRESH_MS);
    return () => {
      window.clearTimeout(kick);
      window.removeEventListener(PASS_CHANGED_EVENT, refresh);
      window.clearInterval(interval);
    };
  }, [enabled, refetch]);

  return {
    hasPass: isPassActive(pass?.expiresAt),
    isLoading: enabled && !settled,
    refetch,
  };
}
