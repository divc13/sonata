import { afterEach, describe, expect, it, jest, mock } from "bun:test";

import type { SonataPassCache } from "@infinitunes/types";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

import { waitFor } from "./wait-for";

let passResponse: SonataPassCache | null = null;
let queries = 0;
let lastAccountId: string | null = null;

mock.module("../../lib/trpc/vanilla", () => ({
  trpc: {
    sonata: {
      pass: {
        byAccount: {
          query: async ({ accountId }: { accountId: string }) => {
            queries += 1;
            lastAccountId = accountId;
            return passResponse;
          },
        },
      },
    },
  },
}));

const {
  DEMO_LISTENER_ACCOUNT_ID,
  PASS_CHANGED_EVENT,
  PASS_REFRESH_MS,
  useSonataEntitlement,
} = await import("../../hooks/use-sonata-entitlement");

function pass(expiresAt: Date): SonataPassCache {
  return {
    id: 1,
    accountId: DEMO_LISTENER_ACCOUNT_ID,
    tokenId: null,
    startsAt: new Date(expiresAt.getTime() - 30 * 86_400_000),
    expiresAt,
    priceUsdc: "5000000",
    txHash: null,
    createdAt: new Date(expiresAt.getTime() - 30 * 86_400_000),
  };
}

type Entitlement = ReturnType<typeof useSonataEntitlement>;

let latest: Entitlement | null = null;

function Harness({ enabled = true }: { enabled?: boolean }) {
  const entitlement = useSonataEntitlement({ enabled });
  useEffect(() => {
    latest = entitlement;
  }, [entitlement]);
  return null;
}

const roots: Root[] = [];

async function mount(enabled = true) {
  latest = null;
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => {
    root.render(<Harness enabled={enabled} />);
  });
  return root;
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  jest.useRealTimers();
});

describe("sonata entitlement", () => {
  it("reads the demo listener's pass and treats a future expiry as active", async () => {
    passResponse = pass(new Date(Date.now() + 86_400_000));
    queries = 0;

    await mount();

    await waitFor(() => latest?.isLoading === false);
    expect(lastAccountId).toBe("listener.sonata.testnet");
    expect(queries).toBe(1);
    expect(latest?.hasPass).toBe(true);
  });

  it("does not grant a pass whose expiry has passed", async () => {
    passResponse = pass(new Date(Date.now() - 1_000));

    await mount();

    await waitFor(() => latest?.isLoading === false);
    expect(latest?.hasPass).toBe(false);
  });

  it("stays quiet until a Sonata track asks for entitlement", async () => {
    passResponse = null;
    queries = 0;

    await mount(false);

    expect(queries).toBe(0);
    expect(latest?.isLoading).toBe(false);
    expect(latest?.hasPass).toBe(false);
  });

  it("refetches when the pass page announces a change", async () => {
    passResponse = null;
    queries = 0;
    await mount();
    await waitFor(() => latest?.isLoading === false);

    passResponse = pass(new Date(Date.now() + 86_400_000));
    await act(async () => {
      window.dispatchEvent(new Event(PASS_CHANGED_EVENT));
    });
    await waitFor(() => latest?.hasPass === true);

    expect(queries).toBe(2);
  });

  it("refreshes once a minute", async () => {
    jest.useFakeTimers();
    passResponse = pass(new Date(Date.now() + 86_400_000));
    queries = 0;
    await mount();

    // The initial read is deferred one tick, like every other fetch start.
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await act(async () => {});
    expect(queries).toBe(1);
    expect(latest?.hasPass).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(PASS_REFRESH_MS);
    });
    await act(async () => {});

    expect(queries).toBe(2);
  });
});
