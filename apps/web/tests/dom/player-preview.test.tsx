import { afterEach, describe, expect, it, mock } from "bun:test";

import type { Favorite } from "@infinitunes/db/schema";
import type { Queue, SonataPassCache } from "@infinitunes/types";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  useCurrentSongIndex,
  useIsPlayerInit,
  useQueue,
} from "../../hooks/use-store";
import { waitFor } from "./wait-for";

let audioPosition = 0;
const toggles: string[] = [];
const pauses: string[] = [];
const seeks: number[] = [];
const toasts: string[] = [];

const audio = {
  load() {},
  isPlaying: true,
  pause() {
    pauses.push("pause");
  },
  togglePlayPause() {
    toggles.push("toggle");
  },
  getPosition: () => audioPosition,
  isLoading: false,
  duration: 200,
  isLooping: false,
  loopOn() {},
  loopOff() {},
  mute() {},
  unmute() {},
  isMuted: false,
  volume: 0.75,
  setVolume() {},
  seek(seconds: number) {
    seeks.push(seconds);
  },
  isReady: true,
};

mock.module("react-use-audio-player", () => ({
  useAudioPlayerContext: () => audio,
  AudioPlayerProvider: ({ children }: { children: ReactNode }) => children,
}));

mock.module("sonner", () => {
  const toast = (message: string) => {
    toasts.push(message);
  };
  toast.error = (message: string) => {
    toasts.push(message);
  };
  toast.success = () => {};
  return { toast };
});

mock.module("../../lib/history-actions", () => ({
  recordPlay() {},
}));

let passResponse: SonataPassCache | null = null;
let passQueries = 0;
const heartbeats: string[] = [];

mock.module("../../lib/trpc/vanilla", () => ({
  trpc: {
    sonata: {
      pass: {
        byAccount: {
          query: async () => {
            passQueries += 1;
            return passResponse;
          },
        },
      },
      listen: {
        record: {
          mutate: async ({ tokenId }: { tokenId: string }) => {
            heartbeats.push(tokenId);
            return { verified: true };
          },
        },
      },
    },
    radio: { songs: { query: async () => [] } },
  },
}));

const { Player } = await import("../../components/player");

const router = {
  push() {},
  replace() {},
  refresh() {},
  back() {},
  forward() {},
  prefetch() {},
} as never;

function master(tokenId: string, name = tokenId): Queue {
  return {
    queueItemId: `q-${tokenId}`,
    id: tokenId,
    name,
    subtitle: "Nadia",
    url: `/master/${tokenId}`,
    type: "song",
    image: "https://c.saavncdn.com/x-150x150.jpg",
    artists: [],
    download_url: "https://cdn/master-low.mp3,https://cdn/master-high.mp3",
    duration: 200,
  };
}

const song: Queue = {
  queueItemId: "q-song",
  id: "song-1",
  name: "Normal song",
  subtitle: "Someone",
  url: "https://www.jiosaavn.com/song/normal-song/AbC123",
  type: "song",
  image: "https://c.saavncdn.com/x-150x150.jpg",
  artists: [],
  download_url: "https://cdn/song-low.mp3,https://cdn/song-high.mp3",
  duration: 200,
};

function activePass(): SonataPassCache {
  return {
    id: 1,
    accountId: "listener.sonata.testnet",
    tokenId: null,
    startsAt: new Date(Date.now() - 1_000),
    expiresAt: new Date(Date.now() + 86_400_000),
    priceUsdc: "5000000",
    txHash: null,
    createdAt: new Date(Date.now() - 1_000),
  };
}

// The init flag is an in-memory atom, so the player under test only loads and
// enforces once primed through the real store hook.
function PrimePlayer() {
  const [, setInit] = useIsPlayerInit();
  useEffect(() => {
    setInit(true);
    return () => setInit(false);
  }, [setInit]);
  return null;
}

let switchQueue: ((queue: Queue[]) => void) | null = null;

function QueueControl() {
  const [, setQueue] = useQueue();
  const [, setIndex] = useCurrentSongIndex();
  useEffect(() => {
    switchQueue = (next) => {
      setQueue(next);
      setIndex(0);
    };
    return () => {
      switchQueue = null;
    };
  }, [setQueue, setIndex]);
  return null;
}

const roots: Root[] = [];

async function mount(queue: Queue[], favorites?: Favorite) {
  audioPosition = 0;
  toggles.length = 0;
  pauses.length = 0;
  seeks.length = 0;
  toasts.length = 0;
  passQueries = 0;
  heartbeats.length = 0;
  document.body.replaceChildren();
  localStorage.setItem("queue", JSON.stringify(queue));
  localStorage.setItem("current_song_index", "0");
  localStorage.removeItem("active_radio_session");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <AppRouterContext.Provider value={router}>
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <PrimePlayer />
          <QueueControl />
          <Player favorites={favorites} />
        </SearchParamsContext.Provider>
      </AppRouterContext.Provider>,
    );
  });
  return container;
}

const previewPrompt = () =>
  document.querySelector<HTMLElement>("[data-sonata-preview]");

const sleep = (ms: number) =>
  act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
});

describe("sonata preview in the player", () => {
  it("pauses once at 30 seconds, toasts once and offers the pass", async () => {
    passResponse = null;
    const container = await mount([master("midnight-drive")]);
    await waitFor(() => passQueries > 0);

    audioPosition = 35;
    await waitFor(() => pauses.length === 1, 2000);

    expect(seeks).toContain(30);
    expect(toasts).toEqual(["Preview ended"]);
    expect(previewPrompt()?.textContent).toContain("30-second preview ended");
    expect(
      container.querySelector("[data-sonata-preview] a")?.getAttribute("href"),
    ).toBe("/pass");

    // The interval keeps sampling, but neither the pause nor the toast repeats.
    await sleep(700);
    expect(pauses).toHaveLength(1);
    expect(toasts).toHaveLength(1);
  });

  it("leaves pass holders unrestricted", async () => {
    passResponse = activePass();
    await mount([master("midnight-drive")]);
    await waitFor(() => passQueries > 0);

    audioPosition = 120;
    await sleep(700);

    expect(pauses).toEqual([]);
    expect(previewPrompt()).toBeNull();
    expect(toasts).toEqual([]);
  });

  it("does not treat a normal Infinitunes song as a Sonata master", async () => {
    passResponse = null;
    await mount([song]);

    audioPosition = 120;
    await sleep(400);

    expect(passQueries).toBe(0);
    expect(pauses).toEqual([]);
    expect(previewPrompt()).toBeNull();
  });

  it("starts a fresh preview when the queue entry changes", async () => {
    passResponse = null;
    await mount([master("midnight-drive")]);
    await waitFor(() => passQueries > 0);

    audioPosition = 35;
    await waitFor(() => pauses.length === 1, 2000);
    expect(previewPrompt()).not.toBeNull();

    // Another master gets its own free window and its own prompt state.
    audioPosition = 0;
    await act(async () => switchQueue?.([master("harbor-lights")]));
    expect(previewPrompt()).toBeNull();

    audioPosition = 35;
    await waitFor(() => pauses.length === 2, 2000);
    expect(toasts).toEqual(["Preview ended", "Preview ended"]);
  });
});
