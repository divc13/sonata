import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { DbClient } from "@infinitunes/db/client";
import {
  sonataListing,
  sonataOwnership,
  sonataPass,
  sonataSong,
} from "@infinitunes/db/schema";
import {
  DEMO_ACCOUNT_IDS,
  PASS_DURATION_SEC,
  type ChainResult,
  type SonataChain,
} from "@infinitunes/near";

import { sonataRouter } from "../src/router/sonata";
import {
  bestEffortSync,
  microUsdcString,
  passWindow,
  roleToAccountId,
  syncMarketListing,
  syncMarketSale,
  syncPassPurchase,
} from "../src/router/sonata/sync";
import { createCallerFactory, router } from "../src/trpc";

const testRouter = router({ sonata: sonataRouter });
const createTestCaller = createCallerFactory(testRouter);
const SUCCESS: ChainResult = { txHash: "0xsync", outcome: "success" };
const DAY_MS = 86_400_000;

type Row = Record<string, unknown>;
type SelectResponses = Row[] | Row[][];
type Operation = {
  kind: "update" | "insert";
  table: unknown;
  values: Row;
};

/**
 * Minimal drizzle stand-in: selects resolve against per-table rows and writes
 * are recorded. The sync code only uses `select...where...limit`,
 * `update...set...where` and `insert...values`, so this covers it exactly and
 * keeps the tests independent of Postgres. A table may map to a list of
 * response batches when one transaction selects it more than once.
 */
function fakeDb(selectRows: Map<unknown, SelectResponses> = new Map()) {
  const operations: Operation[] = [];
  const cursors = new Map<unknown, number>();

  const tx = {
    select: () => ({
      from(table: unknown) {
        const configured = selectRows.get(table) ?? [];
        const batches: Row[][] = Array.isArray(configured[0])
          ? (configured as Row[][])
          : [configured as Row[]];

        const terminal = {
          limit: async () => {
            const index = cursors.get(table) ?? 0;
            cursors.set(table, index + 1);
            return batches[Math.min(index, batches.length - 1)] ?? [];
          },
          orderBy: () => terminal,
        };
        return { where: () => terminal };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Row) => {
        operations.push({ kind: "update", table, values });
        return { where: async () => undefined };
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: Row) => {
        operations.push({ kind: "insert", table, values });
      },
    }),
  };

  const db = {
    transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    select: tx.select,
  };

  return { db: db as unknown as DbClient, operations };
}

function rows(
  ...entries: Array<[unknown, SelectResponses]>
): Map<unknown, SelectResponses> {
  return new Map(entries);
}

const originalMode = process.env.SONATA_DEMO_MODE;

beforeEach(() => {
  process.env.SONATA_DEMO_MODE = "true";
});

afterEach(() => {
  if (originalMode === undefined) delete process.env.SONATA_DEMO_MODE;
  else process.env.SONATA_DEMO_MODE = originalMode;
});

describe("sonata sync pure helpers", () => {
  it("maps every demo role to its seeded account id", () => {
    expect(roleToAccountId("listener")).toBe(DEMO_ACCOUNT_IDS.listener);
    expect(roleToAccountId("collector")).toBe(DEMO_ACCOUNT_IDS.collector);
    expect(roleToAccountId("oracle")).toBe(DEMO_ACCOUNT_IDS.oracle);
    expect(roleToAccountId("nadia")).toBe(DEMO_ACCOUNT_IDS.nadia);
  });

  it("canonicalizes micro-USDC text without floats", () => {
    expect(microUsdcString("50000000")).toBe("50000000");
    expect(microUsdcString("0005000000")).toBe("5000000");
    expect(microUsdcString(5_000_000n)).toBe("5000000");
    expect(() => microUsdcString("0")).toThrow();
    expect(() => microUsdcString("-1")).toThrow();
  });

  it("starts a new pass now and expires it 30 days later", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const window = passWindow(now, null);

    expect(window.startsAt).toEqual(now);
    expect(window.expiresAt.getTime()).toBe(
      now.getTime() + PASS_DURATION_SEC * 1_000,
    );
  });

  it("extends a live pass from its existing expiry", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const liveExpiry = new Date(now.getTime() + 10 * DAY_MS);
    const window = passWindow(now, liveExpiry);

    expect(window.startsAt).toEqual(now);
    expect(window.expiresAt.getTime()).toBe(
      liveExpiry.getTime() + PASS_DURATION_SEC * 1_000,
    );
  });

  it("extends an expired pass from now, not from the past expiry", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expired = new Date(now.getTime() - 10 * DAY_MS);
    const window = passWindow(now, expired);

    expect(window.expiresAt.getTime()).toBe(
      now.getTime() + PASS_DURATION_SEC * 1_000,
    );
  });
});

describe("sonata sync writes", () => {
  const now = new Date("2026-02-01T12:00:00.000Z");

  it("closes the listing, moves ownership and records one sale", async () => {
    const { db, operations } = fakeDb(
      rows([sonataSong, [{ tokenId: "midnight-drive" }]]),
    );

    await syncMarketSale(db, {
      tokenId: "midnight-drive",
      buyerRole: "collector",
      priceUsdc: "50000000",
      txHash: "0xsale",
      now,
    });

    expect(operations).toEqual([
      {
        kind: "update",
        table: sonataListing,
        values: { active: false, soldAt: now },
      },
      {
        kind: "update",
        table: sonataSong,
        values: {
          ownerAccountId: DEMO_ACCOUNT_IDS.collector,
          updatedAt: now,
        },
      },
      {
        kind: "insert",
        table: sonataOwnership,
        values: {
          tokenId: "midnight-drive",
          ownerAccountId: DEMO_ACCOUNT_IDS.collector,
          acquiredAt: now,
          priceUsdc: "50000000",
          txHash: "0xsale",
          eventType: "sale",
        },
      },
    ]);
  });

  it("does not duplicate the sale when the same tx is replayed", async () => {
    const { db, operations } = fakeDb(
      rows(
        [sonataSong, [{ tokenId: "midnight-drive" }]],
        [sonataOwnership, [{ id: 7 }]],
      ),
    );

    await syncMarketSale(db, {
      tokenId: "midnight-drive",
      buyerRole: "collector",
      priceUsdc: "50000000",
      txHash: "0xsale",
      now,
    });

    expect(operations.some((operation) => operation.kind === "insert")).toBe(
      false,
    );
  });

  it("fails clearly when the purchased master is not indexed", async () => {
    const { db } = fakeDb();

    await expect(
      syncMarketSale(db, {
        tokenId: "midnight-drive",
        buyerRole: "collector",
        priceUsdc: "50000000",
        txHash: "0xsale",
        now,
      }),
    ).rejects.toThrow("not indexed in Postgres");
  });

  it("deactivates older listings before inserting the new one", async () => {
    const { db, operations } = fakeDb();

    await syncMarketListing(db, {
      tokenId: "midnight-drive",
      sellerRole: "nadia",
      priceUsdc: "75000000",
      txHash: "0xlist",
    });

    expect(operations).toEqual([
      {
        kind: "update",
        table: sonataListing,
        values: { active: false },
      },
      {
        kind: "insert",
        table: sonataListing,
        values: {
          tokenId: "midnight-drive",
          sellerAccountId: DEMO_ACCOUNT_IDS.nadia,
          priceUsdc: "75000000",
          active: true,
          txHash: "0xlist",
        },
      },
    ]);
  });

  it("does not create a duplicate listing when the same tx is replayed", async () => {
    const { db, operations } = fakeDb(rows([sonataListing, [{ id: 3 }]]));

    await syncMarketListing(db, {
      tokenId: "midnight-drive",
      sellerRole: "nadia",
      priceUsdc: "75000000",
      txHash: "0xlist",
    });

    expect(operations).toHaveLength(0);
  });

  it("inserts a first pass purchased now", async () => {
    const { db, operations } = fakeDb();

    await syncPassPurchase(db, { role: "listener", txHash: "0xpass", now });

    expect(operations).toEqual([
      {
        kind: "insert",
        table: sonataPass,
        values: {
          accountId: DEMO_ACCOUNT_IDS.listener,
          startsAt: now,
          expiresAt: new Date(now.getTime() + PASS_DURATION_SEC * 1_000),
          priceUsdc: "5000000",
          txHash: "0xpass",
        },
      },
    ]);
  });

  it("extends the latest live pass in place", async () => {
    const liveExpiry = new Date(now.getTime() + 5 * DAY_MS);
    const { db, operations } = fakeDb(
      rows([
        sonataPass,
        [
          [],
          [{ id: 11, txHash: "0xold", expiresAt: liveExpiry, createdAt: now }],
        ],
      ]),
    );

    await syncPassPurchase(db, { role: "listener", txHash: "0xpass", now });

    expect(operations).toEqual([
      {
        kind: "update",
        table: sonataPass,
        values: {
          startsAt: now,
          expiresAt: new Date(liveExpiry.getTime() + PASS_DURATION_SEC * 1_000),
          priceUsdc: "5000000",
          txHash: "0xpass",
        },
      },
    ]);
  });

  it("does not extend twice when the same pass tx is replayed", async () => {
    const { db, operations } = fakeDb(
      rows([
        sonataPass,
        [{ id: 11, txHash: "0xpass", expiresAt: now, createdAt: now }],
      ]),
    );

    await syncPassPurchase(db, { role: "listener", txHash: "0xpass", now });

    expect(operations).toHaveLength(0);
  });

  it("reports a cache failure without failing the chain result", async () => {
    const originalError = console.error;
    const logged: unknown[] = [];
    console.error = (...args: unknown[]) => logged.push(args);

    try {
      const result = await bestEffortSync(
        SUCCESS,
        { action: "market.buy", tokenId: "midnight-drive" },
        async () => {
          throw new Error("connection refused");
        },
      );

      expect(result).toMatchObject({
        txHash: SUCCESS.txHash,
        outcome: "success",
        synced: false,
      });
      expect(result.syncWarning).toContain(SUCCESS.txHash);
      expect(logged).toHaveLength(1);
      expect(JSON.stringify(logged)).toContain("connection refused");
      expect(JSON.stringify(logged)).not.toContain("SECRET");
    } finally {
      console.error = originalError;
    }
  });
});

describe("sonata mutations sync the cache", () => {
  function fakeChain(overrides: Partial<SonataChain> = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const track =
      (method: string, result: ChainResult = SUCCESS) =>
      async (...args: unknown[]) => {
        calls.push({ method, args });
        return result;
      };

    const chain = {
      getPassExpiry: async () => 0,
      isPassActive: async () => false,
      getUsdcBalance: async () => "0",
      buyPass: track("buyPass"),
      buyMaster: track("buyMaster"),
      withdrawFromSong: track("withdrawFromSong"),
      listMaster: track("listMaster"),
      ...overrides,
    } as SonataChain;

    return { chain, calls };
  }

  it("market.buy returns synced:true and writes the sale", async () => {
    const { chain } = fakeChain();
    const { db, operations } = fakeDb(
      rows([sonataSong, [{ tokenId: "midnight-drive" }]]),
    );
    const caller = createTestCaller({
      db,
      session: null,
      sonataChain: chain,
    });

    const result = await caller.sonata.market.buy({
      role: "collector",
      tokenId: "midnight-drive",
      expectedPriceUsdc: "50000000",
    });

    expect(result).toMatchObject({ txHash: SUCCESS.txHash, synced: true });
    expect(operations.map((operation) => operation.table)).toContain(
      sonataOwnership,
    );
  });

  it("market.buy still reports the chain success when the db write fails", async () => {
    const { chain } = fakeChain();
    const brokenDb = {
      transaction: async () => {
        throw new Error("db offline");
      },
    } as unknown as DbClient;
    const caller = createTestCaller({
      db: brokenDb,
      session: null,
      sonataChain: chain,
    });

    const originalError = console.error;
    console.error = () => undefined;
    try {
      const result = await caller.sonata.market.buy({
        role: "collector",
        tokenId: "midnight-drive",
        expectedPriceUsdc: "50000000",
      });

      expect(result).toMatchObject({
        txHash: SUCCESS.txHash,
        outcome: "success",
        synced: false,
      });
      expect(result.syncWarning).toContain(SUCCESS.txHash);
    } finally {
      console.error = originalError;
    }
  });

  it("market.list refuses a stale cache before calling the chain", async () => {
    const { chain, calls } = fakeChain();
    const { db } = fakeDb(
      rows([sonataSong, [{ ownerAccountId: DEMO_ACCOUNT_IDS.collector }]]),
    );
    const caller = createTestCaller({
      db,
      session: null,
      sonataChain: chain,
    });

    await expect(
      caller.sonata.market.list({
        role: "nadia",
        tokenId: "midnight-drive",
        priceUsdc: "50000000",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(calls).toHaveLength(0);
  });

  it("market.list refuses a master that is not indexed yet", async () => {
    const { chain, calls } = fakeChain();
    const caller = createTestCaller({
      db: fakeDb().db,
      session: null,
      sonataChain: chain,
    });

    await expect(
      caller.sonata.market.list({
        role: "nadia",
        tokenId: "midnight-drive",
        priceUsdc: "50000000",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(calls).toHaveLength(0);
  });

  it("market.list writes the new active listing after success", async () => {
    const { chain } = fakeChain();
    const { db, operations } = fakeDb(
      rows([sonataSong, [{ ownerAccountId: DEMO_ACCOUNT_IDS.nadia }]]),
    );
    const caller = createTestCaller({
      db,
      session: null,
      sonataChain: chain,
    });

    const result = await caller.sonata.market.list({
      role: "nadia",
      tokenId: "midnight-drive",
      priceUsdc: "50000000",
    });

    expect(result).toMatchObject({ txHash: SUCCESS.txHash, synced: true });
    expect(operations).toContainEqual({
      kind: "insert",
      table: sonataListing,
      values: {
        tokenId: "midnight-drive",
        sellerAccountId: DEMO_ACCOUNT_IDS.nadia,
        priceUsdc: "50000000",
        active: true,
        txHash: SUCCESS.txHash,
      },
    });
  });

  it("pass.buy inserts the listener's 30-day pass after success", async () => {
    const { chain } = fakeChain();
    const { db, operations } = fakeDb();
    const caller = createTestCaller({
      db,
      session: null,
      sonataChain: chain,
    });

    const result = await caller.sonata.pass.buy({ role: "listener" });

    expect(result).toMatchObject({ txHash: SUCCESS.txHash, synced: true });
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      kind: "insert",
      table: sonataPass,
      values: {
        accountId: DEMO_ACCOUNT_IDS.listener,
        priceUsdc: "5000000",
        txHash: SUCCESS.txHash,
      },
    });
  });
});
