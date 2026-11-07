"use client";

import type { Queue } from "@infinitunes/types";
import { newQueueItemId } from "@infinitunes/types";
import { Play } from "lucide-react";

import {
  useActiveRadioSession,
  useCurrentSongIndex,
  useIsPlayerInit,
  useQueue,
} from "~/hooks/use-store";
import { cn } from "~/lib/utils";

type PlayMasterProps = {
  tokenId: string;
  title: string;
  artistName: string;
  artistHandle: string;
  coverUrl: string;
  audioUrl: string;
  durationSec: number;
  variant?: "hero" | "icon" | "text";
  className?: string;
};

const base =
  "inline-flex items-center justify-center gap-2 bg-primary font-semibold text-primary-foreground transition-colors duration-fast outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/80";

/**
 * Queues one demo master and starts the existing player. The contract and
 * indexer integration replaces the static audio with signed URLs later.
 */
export function PlayMaster({
  tokenId,
  title,
  artistName,
  artistHandle,
  coverUrl,
  audioUrl,
  durationSec,
  variant = "hero",
  className,
}: PlayMasterProps) {
  const [, setQueue] = useQueue();
  const [, setCurrentIndex] = useCurrentSongIndex();
  const [, setIsPlayerInit] = useIsPlayerInit();
  const [, setActiveRadio] = useActiveRadioSession();

  function play() {
    const entry: Queue = {
      queueItemId: newQueueItemId(),
      id: tokenId,
      name: title,
      subtitle: artistName,
      url: `/master/${tokenId}`,
      type: "song",
      image: coverUrl,
      artists: [
        {
          id: artistHandle,
          name: artistName,
          perma_url: `/artist/${artistHandle.replace("@", "")}`,
        },
      ],
      download_url: audioUrl,
      duration: durationSec,
    };

    setActiveRadio(null);
    setQueue([entry]);
    setCurrentIndex(0);
    setIsPlayerInit(true);
  }

  return (
    <button
      type="button"
      onClick={play}
      aria-label={`Play ${title}`}
      className={cn(
        base,
        variant === "hero" && `h-(--ctl-lg) rounded-(--r-ctl) px-5`,
        variant === "icon" && "size-10 rounded-(--r-ctl)",
        variant === "text" && "h-(--ctl) rounded-(--r-ctl) px-3.5 text-sm",
        className,
      )}
    >
      <Play aria-hidden="true" className="size-4 fill-current" />
      {variant === "icon" ? null : <span>Play</span>}
    </button>
  );
}
