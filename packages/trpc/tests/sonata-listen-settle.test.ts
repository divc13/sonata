import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { DbClient } from "@infinitunes/db/client";
import { DEMO_ACCOUNT_IDS, type Epoch } from "@infinitunes/near";

import { sonataRouter } from "../src/router/sonata";
import type {
  DemoSettlementResult,
  ListenRecordInput,
  SonataSettlementService,
} from "../src/router/sonata/service";
import { createCallerFactory, router } from "../src/trpc";

const testRouter = router({ sonata: sonataRouter });
const createTestCaller = createCallerFactory(testRouter);

const EPOCH: Epoch = {
  id: 9,
  startedAtSec: 1_764_547_200,
  closedAtSec: 1_765_152_000,
  balanceBeforeUsdc: "1000000000",
  totalSeconds: 3600,
  effectiveRatePerHourUsdc: "30000",
  totalPaidUsdc: "30000",
  listenRoot: "root",
  entriesCount: 1,
  mode: "constant",
};

function chainEpochResult(): DemoSettlementResult {
  return {
    txHash: "0xtx",
    epoch: EPOCH,
    entries: [{ tokenId: "alpha-song", seconds: 3600 }],
    listenRoot: "root",
    created: true,
    totalSeconds: 3600,
    totalPaidUsdc: "30000",
  };
}

function fakeService(overrides: Partial<SonataSettlementService> = {}) {
  const calls: Array<{ method: string; input: unknown }> = [];
  const service: SonataSettlementService = {
    recordListen: async (input: ListenRecordInput) => {
      calls.push({ method: "recordListen", input });
      return { id: 1, verified: true, reason: null, duplicate: false };
    },
    runDemoSettlement: async (epochId: number) => {
      calls.push({ method: "runDemoSettlement", input: epochId });
      return chainEpochResult();
    },
    ...overrides,
  };

  const caller = createTestCaller({
    db: {} as DbClient,
    session: null,
    sonataSettlement: service,
  });

  return { caller, calls };
}

const originalMode = process.env.SONATA_DEMO_MODE;
const now = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  process.env.SONATA_DEMO_MODE = "true";
});

afterEach(() => {
  if (originalMode === undefined) delete process.env.SONATA_DEMO_MODE;
  else process.env.SONATA_DEMO_MODE = originalMode;
});

describe("sonata.listen.record", () => {
  it("maps the demo listener role to the server-side account", async () => {
    const { caller, calls } = fakeService();

    await caller.sonata.listen.record({
      role: "listener",
      tokenId: "alpha-song",
      seconds: 15,
      startedAt: now() - 5,
      clientEventId: "event-1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "recordListen",
      input: {
        accountId: DEMO_ACCOUNT_IDS.listener,
        tokenId: "alpha-song",
        seconds: 15,
        clientEventId: "event-1",
      },
    });
  });

  it("requires demo mode for the listener role", async () => {
    process.env.SONATA_DEMO_MODE = "false";
    const { caller, calls } = fakeService();

    await expect(
      caller.sonata.listen.record({
        role: "listener",
        tokenId: "alpha-song",
        seconds: 15,
        startedAt: now() - 5,
        clientEventId: "event-2",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls).toHaveLength(0);
  });

  it("accepts an explicit account id outside demo mode", async () => {
    process.env.SONATA_DEMO_MODE = "false";
    const { caller, calls } = fakeService();

    await caller.sonata.listen.record({
      accountId: "listener.sonata.testnet",
      tokenId: "alpha-song",
      seconds: 60,
      startedAt: now() - 60,
      clientEventId: "event-3",
      preview: true,
    });

    expect(calls[0]?.input).toMatchObject({
      accountId: "listener.sonata.testnet",
      preview: true,
    });
  });

  it("validates duration, identity and heartbeat time", async () => {
    const { caller, calls } = fakeService();

    await expect(
      caller.sonata.listen.record({
        role: "listener",
        tokenId: "alpha-song",
        seconds: 0,
        startedAt: now() - 5,
        clientEventId: "bad-seconds",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.sonata.listen.record({
        role: "listener",
        tokenId: "alpha-song",
        seconds: 61,
        startedAt: now() - 5,
        clientEventId: "long-seconds",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    process.env.SONATA_DEMO_MODE = "false";
    await expect(
      caller.sonata.listen.record({
        tokenId: "alpha-song",
        seconds: 15,
        startedAt: now() - 5,
        clientEventId: "no-account",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    process.env.SONATA_DEMO_MODE = "true";
    await expect(
      caller.sonata.listen.record({
        role: "listener",
        tokenId: "alpha-song",
        seconds: 15,
        startedAt: now() + 3600,
        clientEventId: "future",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(calls).toHaveLength(0);
  });

  it("surfaces domain errors with a tRPC code", async () => {
    const notFound = Object.assign(new Error("Master not found"), {
      name: "SonataListenError",
      code: "song-not-found",
    });
    const { caller } = fakeService({
      recordListen: async () => {
        throw notFound;
      },
    });

    await expect(
      caller.sonata.listen.record({
        role: "listener",
        tokenId: "alpha-song",
        seconds: 15,
        startedAt: now() - 5,
        clientEventId: "missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("sonata.epochs.settle", () => {
  it("runs the demo settlement as the oracle", async () => {
    const { caller, calls } = fakeService();

    await expect(
      caller.sonata.epochs.settle({ epochId: 9 }),
    ).resolves.toMatchObject({ txHash: "0xtx", epoch: { id: 9 } });
    expect(calls).toEqual([{ method: "runDemoSettlement", input: 9 }]);
  });

  it("is demo-mode only", async () => {
    process.env.SONATA_DEMO_MODE = "false";
    const { caller, calls } = fakeService();

    await expect(
      caller.sonata.epochs.settle({ epochId: 9 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls).toHaveLength(0);
  });

  it("maps an already-settled epoch to CONFLICT", async () => {
    const { caller } = fakeService({
      runDemoSettlement: async () => {
        throw Object.assign(new Error("Epoch 9 is already settled"), {
          name: "SonataSettlementError",
          code: "epoch-exists",
        });
      },
    });

    await expect(
      caller.sonata.epochs.settle({ epochId: 9 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("fails clearly when the service is not configured", async () => {
    const caller = createTestCaller({
      db: {} as DbClient,
      session: null,
    });

    await expect(
      caller.sonata.epochs.settle({ epochId: 9 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
