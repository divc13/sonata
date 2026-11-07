import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { DbClient } from "@infinitunes/db/client";
import {
  mapContractError,
  SonataChainError,
  type ChainResult,
  type SonataChain,
} from "@infinitunes/near";

import { sonataRouter } from "../src/router/sonata";
import { createCallerFactory, router } from "../src/trpc";

const testRouter = router({ sonata: sonataRouter });
const createTestCaller = createCallerFactory(testRouter);
const SUCCESS: ChainResult = { txHash: "0xabc123", outcome: "success" };

type Captured = {
  method: string;
  args: unknown[];
};

/** Cached owner the withdrawal pre-check reads (defaults to the nadia demo). */
const NADIA_ACCOUNT_ID = "nadia-sonata.testnet";

/**
 * Minimal drizzle stand-in for the ownership pre-check:
 * `db.select(...).from(...).where(...).limit(1)` resolves to one row (or none).
 */
function dbWithOwner(owner: string | null | Error): DbClient {
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () =>
      owner instanceof Error
        ? Promise.reject(owner)
        : Promise.resolve(owner === null ? [] : [{ ownerAccountId: owner }]),
  };

  return { select: () => builder } as unknown as DbClient;
}

function fakeChain(
  overrides: Partial<SonataChain> = {},
  db: DbClient = dbWithOwner(NADIA_ACCOUNT_ID),
) {
  const calls: Captured[] = [];
  const track =
    (method: string, result: ChainResult = SUCCESS) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      return result;
    };

  const chain: SonataChain = {
    getPassExpiry: async () => 0,
    isPassActive: async () => false,
    getUsdcBalance: async () => "0",
    buyPass: track("buyPass"),
    buyMaster: track("buyMaster"),
    withdrawFromSong: track("withdrawFromSong"),
    listMaster: track("listMaster"),
    ...overrides,
  } as SonataChain;

  const caller = createTestCaller({
    db,
    session: null,
    sonataChain: chain,
  });

  return { caller, calls };
}

const originalMode = process.env.SONATA_DEMO_MODE;

beforeEach(() => {
  process.env.SONATA_DEMO_MODE = "true";
});

afterEach(() => {
  if (originalMode === undefined) delete process.env.SONATA_DEMO_MODE;
  else process.env.SONATA_DEMO_MODE = originalMode;
});

describe("demo-mode guard", () => {
  it("rejects every mutation with FORBIDDEN when demo mode is off", async () => {
    process.env.SONATA_DEMO_MODE = "false";
    const { caller, calls } = fakeChain();

    await expect(
      caller.sonata.pass.buy({ role: "listener" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.sonata.market.buy({
        role: "collector",
        tokenId: "midnight-drive",
        expectedPriceUsdc: "50000000",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.sonata.songs.withdraw({
        role: "nadia",
        tokenId: "midnight-drive",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.sonata.market.list({
        role: "nadia",
        tokenId: "midnight-drive",
        priceUsdc: "50000000",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(calls).toHaveLength(0);
  });

  it("is opt-in: an unset or invalid value stays disabled", async () => {
    delete process.env.SONATA_DEMO_MODE;
    await expect(
      fakeChain().caller.sonata.pass.buy({ role: "listener" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    process.env.SONATA_DEMO_MODE = "1";
    await expect(
      fakeChain().caller.sonata.pass.buy({ role: "listener" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("sonata mutations", () => {
  it("pass.buy only accepts the listener role", async () => {
    const { caller, calls } = fakeChain();

    await expect(
      caller.sonata.pass.buy({ role: "listener" }),
    ).resolves.toMatchObject({
      txHash: SUCCESS.txHash,
      outcome: "success",
      /* The fake db cannot sync, so the chain result is still a success. */
      synced: false,
    });
    expect(calls).toEqual([{ method: "buyPass", args: ["listener"] }]);

    await expect(
      caller.sonata.pass.buy({ role: "collector" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.sonata.pass.buy({} as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(calls).toHaveLength(1);
  });

  it("market.buy forwards role, token and the expected price", async () => {
    const { caller, calls } = fakeChain();

    await expect(
      caller.sonata.market.buy({
        role: "collector",
        tokenId: "midnight-drive",
        expectedPriceUsdc: "50000000",
      }),
    ).resolves.toMatchObject({
      txHash: SUCCESS.txHash,
      outcome: "success",
      synced: false,
    });

    expect(calls).toEqual([
      {
        method: "buyMaster",
        args: ["collector", "midnight-drive", "50000000"],
      },
    ]);
  });

  it("songs.withdraw forwards an optional amount", async () => {
    const { caller, calls } = fakeChain();

    await caller.sonata.songs.withdraw({
      role: "nadia",
      tokenId: "midnight-drive",
      amountUsdc: "1200000",
    });
    await caller.sonata.songs.withdraw({
      role: "nadia",
      tokenId: "midnight-drive",
    });

    expect(calls).toEqual([
      {
        method: "withdrawFromSong",
        args: ["nadia", "midnight-drive", "1200000"],
      },
      { method: "withdrawFromSong", args: ["nadia", "midnight-drive"] },
    ]);
  });

  it("songs.withdraw rejects a signer that is not the cached owner", async () => {
    const { caller, calls } = fakeChain(
      {},
      dbWithOwner("collector-sonata.testnet"),
    );

    await expect(
      caller.sonata.songs.withdraw({
        role: "nadia",
        tokenId: "midnight-drive",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("Only the current owner can withdraw"),
    });

    expect(calls).toHaveLength(0);
  });

  it("songs.withdraw returns NOT_FOUND for a master that is not indexed", async () => {
    const { caller, calls } = fakeChain({}, dbWithOwner(null));

    await expect(
      caller.sonata.songs.withdraw({
        role: "nadia",
        tokenId: "midnight-drive",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(calls).toHaveLength(0);
  });

  it("songs.withdraw still lets the chain decide when the cache cannot be read", async () => {
    const { caller, calls } = fakeChain(
      {},
      dbWithOwner(new Error("database unavailable")),
    );

    await expect(
      caller.sonata.songs.withdraw({
        role: "nadia",
        tokenId: "midnight-drive",
      }),
    ).resolves.toMatchObject({ txHash: SUCCESS.txHash, outcome: "success" });

    expect(calls).toEqual([
      { method: "withdrawFromSong", args: ["nadia", "midnight-drive"] },
    ]);
  });

  it("market.list forwards the fixed price", async () => {
    const { caller, calls } = fakeChain();

    await caller.sonata.market.list({
      role: "nadia",
      tokenId: "midnight-drive",
      priceUsdc: "50000000",
    });

    expect(calls).toEqual([
      { method: "listMaster", args: ["nadia", "midnight-drive", "50000000"] },
    ]);
  });

  it("validates token ids and micro-USDC amounts before the chain", async () => {
    const { caller, calls } = fakeChain();

    await expect(
      caller.sonata.market.buy({
        role: "collector",
        tokenId: "Not A Slug",
        expectedPriceUsdc: "50000000",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.sonata.market.buy({
        role: "collector",
        tokenId: "market",
        expectedPriceUsdc: "50000000",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.sonata.market.list({
        role: "nadia",
        tokenId: "midnight-drive",
        priceUsdc: "1.5",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.sonata.songs.withdraw({
        role: "nadia",
        tokenId: "midnight-drive",
        amountUsdc: "0",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(calls).toHaveLength(0);
  });

  it("maps contract panics to readable PRECONDITION_FAILED errors", async () => {
    const { caller } = fakeChain({
      listMaster: async () => {
        throw new SonataChainError(
          "contract-panic",
          mapContractError("Not approved"),
          { panic: "Not approved" },
        );
      },
    });

    await expect(
      caller.sonata.market.list({
        role: "nadia",
        tokenId: "midnight-drive",
        priceUsdc: "50000000",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "Not approved: the seller must approve the market for this master first.",
    });
  });

  it("surfaces a missing demo signer without exposing a key", async () => {
    const { caller } = fakeChain({
      buyPass: async () => {
        throw new SonataChainError(
          "missing-key",
          'No demo signer is configured for "listener". Set SONATA_DEMO_LISTENER_SECRET_KEY on the server.',
        );
      },
    });

    try {
      await caller.sonata.pass.buy({ role: "listener" });
      throw new Error("expected pass.buy to reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
      expect((error as Error).message).toContain(
        "SONATA_DEMO_LISTENER_SECRET_KEY",
      );
      expect((error as Error).message).not.toContain("ed25519");
    }
  });
});
