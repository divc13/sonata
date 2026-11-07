import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  mock,
} from "bun:test";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

type Heartbeat = {
  role: string;
  tokenId: string;
  seconds: number;
  startedAt: number;
  clientEventId: string;
};

const heartbeats: Heartbeat[] = [];
let failHeartbeats = false;

mock.module("../../lib/trpc/vanilla", () => ({
  trpc: {
    sonata: {
      listen: {
        record: {
          mutate: async (input: Heartbeat) => {
            if (failHeartbeats) throw new Error("offline");
            heartbeats.push(input);
            return { verified: true };
          },
        },
      },
    },
  },
}));

const { useListenHeartbeat } = await import("../../hooks/use-listen-heartbeat");

type Props = {
  tokenId: string | null;
  enabled: boolean;
  isPlaying: boolean;
};

function Harness(props: Props) {
  useListenHeartbeat(props);
  return null;
}

const roots: Root[] = [];

async function mount(initial: Props) {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  const render = (props: Props) =>
    act(async () => {
      root.render(<Harness {...props} />);
    });
  await render(initial);
  return { render, root };
}

const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

beforeEach(() => {
  heartbeats.length = 0;
  jest.useFakeTimers();
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  jest.useRealTimers();
});

describe("listen heartbeat", () => {
  it("sends one 15-second heartbeat after 15 seconds of playing", async () => {
    await mount({ tokenId: "midnight-drive", enabled: true, isPlaying: true });

    await advance(14_000);
    expect(heartbeats).toEqual([]);

    await advance(1_000);
    expect(heartbeats).toHaveLength(1);
    expect(heartbeats[0]).toMatchObject({
      role: "listener",
      tokenId: "midnight-drive",
      seconds: 15,
    });
    expect(heartbeats[0]!.clientEventId.length).toBeGreaterThan(0);
    expect(Number.isInteger(heartbeats[0]!.startedAt)).toBe(true);
  });

  it("never sends more than one heartbeat per 15 seconds", async () => {
    await mount({ tokenId: "midnight-drive", enabled: true, isPlaying: true });

    await advance(16_000);
    expect(heartbeats).toHaveLength(1);

    // One second of the previous chunk is still on the counter.
    await advance(13_000);
    expect(heartbeats).toHaveLength(1);

    await advance(1_000);
    expect(heartbeats).toHaveLength(2);
    expect(heartbeats[0]!.clientEventId).not.toBe(heartbeats[1]!.clientEventId);
  });

  it("sends nothing while paused, and drops the partial chunk on pause", async () => {
    const { render } = await mount({
      tokenId: "midnight-drive",
      enabled: true,
      isPlaying: true,
    });

    await advance(10_000);
    await render({
      tokenId: "midnight-drive",
      enabled: true,
      isPlaying: false,
    });
    await advance(60_000);
    expect(heartbeats).toEqual([]);

    // Resuming starts a new chunk rather than crediting the paused gap.
    await render({ tokenId: "midnight-drive", enabled: true, isPlaying: true });
    await advance(10_000);
    expect(heartbeats).toEqual([]);
    await advance(5_000);
    expect(heartbeats).toHaveLength(1);
  });

  it("does not record previews, non-Sonata tracks, or disabled heartbeats", async () => {
    const { render } = await mount({
      tokenId: "midnight-drive",
      enabled: false,
      isPlaying: true,
    });
    await advance(60_000);
    expect(heartbeats).toEqual([]);

    await render({ tokenId: null, enabled: true, isPlaying: true });
    await advance(60_000);
    expect(heartbeats).toEqual([]);
  });

  it("resets the chunk when the track changes", async () => {
    const { render } = await mount({
      tokenId: "midnight-drive",
      enabled: true,
      isPlaying: true,
    });

    await advance(10_000);
    await render({ tokenId: "harbor-lights", enabled: true, isPlaying: true });
    await advance(14_000);
    expect(heartbeats).toEqual([]);

    await advance(1_000);
    expect(heartbeats).toHaveLength(1);
    expect(heartbeats[0]!.tokenId).toBe("harbor-lights");
  });

  it("cleans up its timer on unmount", async () => {
    const { root } = await mount({
      tokenId: "midnight-drive",
      enabled: true,
      isPlaying: true,
    });

    await advance(10_000);
    await act(async () => root.unmount());
    roots.length = 0;
    await advance(60_000);

    expect(heartbeats).toEqual([]);
  });

  it("swallows a failed heartbeat instead of interrupting playback", async () => {
    failHeartbeats = true;
    await mount({ tokenId: "midnight-drive", enabled: true, isPlaying: true });
    await advance(15_000);

    expect(heartbeats).toEqual([]);
    failHeartbeats = false;
  });
});
