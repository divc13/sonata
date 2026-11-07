"use client";

import * as React from "react";

import { trpc } from "~/lib/trpc/vanilla";

/** A heartbeat credits one 15-second chunk of verified listening. */
export const HEARTBEAT_SECONDS = 15;

/** How often listened seconds are counted while the track plays. */
const TICK_MS = 1_000;

type ListenHeartbeatOptions = {
  /** The Sonata master token, or `null` for a normal Infinitunes track. */
  tokenId: string | null;
  /** Only a Sonata track with an active pass generates verified time. */
  enabled: boolean;
  isPlaying: boolean;
};

/**
 * Records verified listening time for a pass holder.
 *
 * Time is accumulated only while the track is actually playing: pausing (or a
 * track change/unmount) drops the partial chunk, so a paused tab can never
 * report a heartbeat. One chunk is sent at most every 15 seconds, and a failed
 * post is ignored - a dropped heartbeat is not worth interrupting playback.
 */
export function useListenHeartbeat({
  tokenId,
  enabled,
  isPlaying,
}: ListenHeartbeatOptions) {
  React.useEffect(() => {
    if (!tokenId || !enabled || !isPlaying) return;

    let listened = 0;
    const id = window.setInterval(() => {
      listened += 1;
      if (listened < HEARTBEAT_SECONDS) return;
      listened = 0;

      void trpc.sonata.listen.record
        .mutate({
          role: "listener",
          tokenId,
          seconds: HEARTBEAT_SECONDS,
          startedAt: Math.floor(Date.now() / 1000),
          clientEventId: crypto.randomUUID(),
        })
        .catch(() => {
          // Silent on purpose: the next heartbeat retries the accounting.
        });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [tokenId, enabled, isPlaying]);
}
