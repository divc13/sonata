import { describe, expect, it } from "bun:test";

import type { DbClient } from "@infinitunes/db/client";
import {
  sonataFaucetGrant,
  sonataListing,
  sonataOwnership,
  sonataPass,
  sonataSong,
} from "@infinitunes/db/schema";
import {
  FAUCET_GRANT_USDC_MICRO,
  PASS_PRICE_USDC_MICRO,
  SonataChainError,
  type ChainResult,
  type Master,
  type WalletChain,
} from "@infinitunes/near";

import { sonataRouter } from "../src/router/sonata";
import { createCallerFactory, router } from "../src/trpc";

const testRouter = router({ sonata: sonataRouter });
const createTestCaller = createCallerFactory(testRouter);

const ALICE = "alice.testnet";
const NADIA = "nadia-sonata.testnet";
const TOKEN = "midnight-drive";

type Row = Record<string, unknown>;

type SelectResponses = Map<unknown, Row[] | Row[][]>;

type Operation = {
  kind: "insert" | "update" | "delete";
  table: unknown;
  values?: Row;
};

type SelectTerminal = {
  orderBy: () => SelectTerminal;
  limit: () => Promise<Row[]>;
};

/**
 * Minimal drizzle stand-in. Selects read per-table response batches (so one
 * procedure that reads the same table twice can see different states), writes
 * are recorded, and `returning()` resolves to the written values.
 */
function fakeDb(
  selectResponses: SelectResponses = new Map(),
  options: { onInsert?: (table: unknown, values: Row) => void } = {},
) {
  const operations: Operation[] = [];
  const cursors = new Map<unknown, number>();
  let nextId = 1;

  const db = {
    select: () => ({
      from: (table: unknown) => {
        const configured = (selectResponses.get(table) ?? []) as
          | Row[]
          | Row[][];
        const batches: Row[][] = Array.isArray(configured[0])
          ? (configured as Row[][])
          : [configured as Row[]];

        const terminal: SelectTerminal = {
          orderBy: () => terminal,
          limit: async () => {
            const index = cursors.get(table) ?? 0;
            cursors.set(table, index + 1);
            return batches[Math.min(index, batches.length - 1)] ?? [];
          },
        };

        return {
          where: () => terminal,
          orderBy: () => terminal,
          limit: terminal.limit,
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Row) => {
        options.onInsert?.(table, values);
        operations.push({ kind: "insert", table, values });
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => [{ id: nextId++, ...values }],
        });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: () => {
          operations.push({ kind: "update", table, values });
          return Object.assign(Promise.resolve(undefined), {
            returning: async () => [{ id: nextId++, ...values }],
          });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        operations.push({ kind: "delete", table });
      },
    }),
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn(db),
  };

  return { db: db as unknown as DbClient, operations };
}

const SONG_ROW: Row = {
  tokenId: TOKEN,
  title: "Midnight Drive",
  artistName: "Nadia",
  artistHandle: "nadia",
  artistAccountId: NADIA,
  creatorAccountId: NADIA,
  ownerAccountId: NADIA,
  subAccount: `${TOKEN}.masters-sonata.testnet`,
  coverUrl: "https://example.test/cover.jpg",
  audioUrl: "https://example.test/audio.mp3",
  durationSec: 180,
  genre: "synthwave",
  releaseYear: 2024,
  description: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const LISTING_ROW: Row = {
  id: 3,
  tokenId: TOKEN,
  sellerAccountId: NADIA,
  priceUsdc: "50000000",
  active: true,
  txHash: null,
  createdAt: new Date("2026-02-01T00:00:00Z"),
  cancelledAt: null,
  soldAt: null,
};

const PASS_ROW: Row = {
  id: 7,
  accountId: ALICE,
  tokenId: null,
  startsAt: new Date("2026-01-01T00:00:00Z"),
  expiresAt: new Date("2026-01-31T00:00:00Z"),
  priceUsdc: PASS_PRICE_USDC_MICRO,
  txHash: "0xold",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function master(ownerId: string): Master {
  return {
    tokenId: TOKEN,
    ownerId,
    creatorId: NADIA,
    subAccount: `${TOKEN}.masters-sonata.testnet`,
    royaltyBps: 500,
    mintedAtSec: 1_800_000_000,
    lastTransferAtSec: 1_800_000_000,
    transferCount: 1,
  };
}

function fakeWallet(overrides: Partial<WalletChain> = {}) {
  const transfers: Array<{ receiverId: string; amountUsdc: string }> = [];
  const balanceReads: string[] = [];

  const wallet: WalletChain = {
    getUsdcBalance: async (accountId) => {
      balanceReads.push(accountId);
      return "0";
    },
    getPassExpiry: async () => 0,
    isPassActive: async () => false,
    getNftToken: async () => null,
    getListing: async () => null,
    transferUsdc: async (request) => {
      transfers.push({
        receiverId: request.receiverId,
        amountUsdc: request.amountUsdc,
      });
      return { txHash: "0xfaucet", outcome: "success" } satisfies ChainResult;
    },
    ...overrides,
  };

  const caller = (db: DbClient) =>
    createTestCaller({ db, session: null, sonataWallet: wallet });

  return { wallet, caller, transfers, balanceReads };
}

describe("wallet.balance", () => {
  it("returns the account's micro-USDC balance", async () => {
    const { caller, balanceReads } = fakeWallet({
      getUsdcBalance: async (accountId) => {
        balanceReads.push(accountId);
        return "42000000";
      },
    });

    await expect(
      caller(fakeDb().db).sonata.wallet.balance({ accountId: ALICE }),
    ).resolves.toBe("42000000");
    expect(balanceReads).toEqual([ALICE]);
  });

  it("rejects an invalid account id before reading the chain", async () => {
    const { caller, balanceReads } = fakeWallet();

    await expect(
      caller(fakeDb().db).sonata.wallet.balance({ accountId: "Alice" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(balanceReads).toHaveLength(0);
  });

  it("maps an RPC failure to PRECONDITION_FAILED", async () => {
    const { caller } = fakeWallet({
      getUsdcBalance: async () => {
        throw new SonataChainError(
          "rpc",
          "NEAR call usdc.ft_balance_of failed.",
        );
      },
    });

    await expect(
      caller(fakeDb().db).sonata.wallet.balance({ accountId: ALICE }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("wallet.faucet", () => {
  it("grants 25 USDC once and stores the transaction hash", async () => {
    const { caller, transfers } = fakeWallet();
    const { db, operations } = fakeDb();

    await expect(
      caller(db).sonata.wallet.faucet({ accountId: ALICE }),
    ).resolves.toEqual({
      txHash: "0xfaucet",
      amountUsdc: FAUCET_GRANT_USDC_MICRO,
    });

    expect(FAUCET_GRANT_USDC_MICRO).toBe("25000000");
    expect(transfers).toEqual([
      { receiverId: ALICE, amountUsdc: FAUCET_GRANT_USDC_MICRO },
    ]);
    expect(operations).toEqual([
      {
        kind: "insert",
        table: sonataFaucetGrant,
        values: { accountId: ALICE, amountUsdc: FAUCET_GRANT_USDC_MICRO },
      },
      {
        kind: "update",
        table: sonataFaucetGrant,
        values: { txHash: "0xfaucet" },
      },
    ]);
  });

  it("rejects an account that already has a grant without moving funds", async () => {
    const { caller, transfers } = fakeWallet();
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([[sonataFaucetGrant, [{ id: 1 }]]]),
    );

    await expect(
      caller(db).sonata.wallet.faucet({ accountId: ALICE }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("25.00 USDC"),
    });

    expect(transfers).toHaveLength(0);
    expect(operations).toHaveLength(0);
  });

  it("treats the unique index as the concurrency rate limit", async () => {
    const { caller, transfers } = fakeWallet();
    const { db } = fakeDb(new Map(), {
      onInsert: () => {
        throw Object.assign(new Error("duplicate key value"), {
          code: "23505",
        });
      },
    });

    await expect(
      caller(db).sonata.wallet.faucet({ accountId: ALICE }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(transfers).toHaveLength(0);
  });

  it("releases the reservation when the transfer fails", async () => {
    let attempted: string | null = null;
    const { caller } = fakeWallet({
      transferUsdc: async (request) => {
        attempted = request.receiverId;
        throw new SonataChainError(
          "contract-panic",
          "The account is not registered: the account is not registered on the USDC contract.",
        );
      },
    });
    const { db, operations } = fakeDb();

    await expect(
      caller(db).sonata.wallet.faucet({ accountId: ALICE }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(attempted).toBe(ALICE);
    expect(operations.map((operation) => operation.kind)).toEqual([
      "insert",
      "delete",
    ]);
  });
});

describe("wallet.syncPass", () => {
  const activeExpiry = () => Math.floor(Date.now() / 1_000) + 2_592_000;

  it("inserts a pass when the chain says it is active", async () => {
    const expiry = activeExpiry();
    const { caller } = fakeWallet({ getPassExpiry: async () => expiry });
    const { db, operations } = fakeDb();

    const pass = await caller(db).sonata.wallet.syncPass({
      accountId: ALICE,
    });

    expect(pass).toMatchObject({
      accountId: ALICE,
      priceUsdc: PASS_PRICE_USDC_MICRO,
    });
    expect(pass?.expiresAt.getTime()).toBe(expiry * 1_000);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      kind: "insert",
      table: sonataPass,
      values: {
        accountId: ALICE,
        priceUsdc: PASS_PRICE_USDC_MICRO,
      },
    });
  });

  it("updates the cached pass in place instead of inserting another", async () => {
    const expiry = activeExpiry();
    const { caller } = fakeWallet({ getPassExpiry: async () => expiry });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([[sonataPass, [PASS_ROW]]]),
    );

    const pass = await caller(db).sonata.wallet.syncPass({
      accountId: ALICE,
    });

    expect(pass?.expiresAt.getTime()).toBe(expiry * 1_000);
    expect(pass?.priceUsdc).toBe(PASS_PRICE_USDC_MICRO);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      kind: "update",
      table: sonataPass,
      values: { priceUsdc: PASS_PRICE_USDC_MICRO },
    });
  });

  it("is idempotent across a replay", async () => {
    const expiry = activeExpiry();
    const { caller } = fakeWallet({ getPassExpiry: async () => expiry });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([[sonataPass, [[], [PASS_ROW]]]]),
    );
    const callerWithDb = caller(db);

    await callerWithDb.sonata.wallet.syncPass({ accountId: ALICE });
    await callerWithDb.sonata.wallet.syncPass({ accountId: ALICE });

    expect(operations.map((operation) => operation.kind)).toEqual([
      "insert",
      "update",
    ]);
  });

  it("does not write when the chain says the pass is inactive", async () => {
    const { caller } = fakeWallet({ getPassExpiry: async () => 0 });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([[sonataPass, [PASS_ROW]]]),
    );

    await expect(
      caller(db).sonata.wallet.syncPass({ accountId: ALICE }),
    ).resolves.toBe(PASS_ROW);
    expect(operations).toHaveLength(0);
  });

  it("returns null for an inactive pass with no cached row", async () => {
    const { caller } = fakeWallet({ getPassExpiry: async () => 0 });

    await expect(
      caller(fakeDb().db).sonata.wallet.syncPass({ accountId: ALICE }),
    ).resolves.toBeNull();
  });
});

describe("wallet.syncPurchase", () => {
  it("settles the active listing, moves ownership and records the sale", async () => {
    const { caller } = fakeWallet({ getNftToken: async () => master(ALICE) });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([
        [sonataSong, [SONG_ROW]],
        [sonataListing, [LISTING_ROW]],
      ]),
    );

    const result = await caller(db).sonata.wallet.syncPurchase({
      accountId: ALICE,
      tokenId: TOKEN,
    });

    expect(result.song.ownerAccountId).toBe(ALICE);
    expect(result.listing).toMatchObject({
      id: LISTING_ROW.id,
      active: false,
      priceUsdc: "50000000",
    });

    expect(operations).toHaveLength(3);
    expect(operations[0]).toMatchObject({
      kind: "update",
      table: sonataListing,
      values: { active: false },
    });
    expect(operations[1]).toMatchObject({
      kind: "update",
      table: sonataSong,
      values: { ownerAccountId: ALICE },
    });
    expect(operations[2]).toMatchObject({
      kind: "insert",
      table: sonataOwnership,
      values: {
        tokenId: TOKEN,
        ownerAccountId: ALICE,
        priceUsdc: "50000000",
        eventType: "sale",
        txHash: null,
      },
    });
  });

  it("rejects a chain owner mismatch before touching the cache", async () => {
    const { caller } = fakeWallet({ getNftToken: async () => master(NADIA) });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([
        [sonataSong, [SONG_ROW]],
        [sonataListing, [LISTING_ROW]],
      ]),
    );

    await expect(
      caller(db).sonata.wallet.syncPurchase({
        accountId: ALICE,
        tokenId: TOKEN,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining(NADIA),
    });
    expect(operations).toHaveLength(0);
  });

  it("returns NOT_FOUND for a token the collection does not know", async () => {
    const { caller } = fakeWallet();

    await expect(
      caller(fakeDb().db).sonata.wallet.syncPurchase({
        accountId: ALICE,
        tokenId: TOKEN,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is idempotent once the cache owner already matches", async () => {
    const { caller } = fakeWallet({ getNftToken: async () => master(ALICE) });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([
        [sonataSong, [{ ...SONG_ROW, ownerAccountId: ALICE }]],
        [sonataListing, []],
      ]),
    );

    const result = await caller(db).sonata.wallet.syncPurchase({
      accountId: ALICE,
      tokenId: TOKEN,
    });

    expect(result.song.ownerAccountId).toBe(ALICE);
    expect(result.listing).toBeNull();
    expect(operations).toHaveLength(0);
  });

  it("refuses to settle when no active listing is cached", async () => {
    const { caller } = fakeWallet({ getNftToken: async () => master(ALICE) });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([
        [sonataSong, [SONG_ROW]],
        [sonataListing, [{ ...LISTING_ROW, active: false }]],
      ]),
    );

    await expect(
      caller(db).sonata.wallet.syncPurchase({
        accountId: ALICE,
        tokenId: TOKEN,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(operations).toHaveLength(0);
  });
});

describe("wallet.syncListing", () => {
  it("verifies the chain owner and writes one active listing", async () => {
    const { caller } = fakeWallet({ getNftToken: async () => master(ALICE) });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([[sonataListing, []]]),
    );

    const listingRow = await caller(db).sonata.wallet.syncListing({
      accountId: ALICE,
      tokenId: TOKEN,
      priceUsdc: "50000000",
    });

    expect(listingRow).toMatchObject({
      tokenId: TOKEN,
      sellerAccountId: ALICE,
      priceUsdc: "50000000",
      active: true,
    });

    const inserted = operations.find(
      (operation) =>
        operation.kind === "insert" && operation.table === sonataListing,
    );
    expect(inserted?.values).toEqual({
      tokenId: TOKEN,
      sellerAccountId: ALICE,
      priceUsdc: "50000000",
      active: true,
    });
  });

  it("rejects a chain owner mismatch before touching the cache", async () => {
    const { caller } = fakeWallet({ getNftToken: async () => master(NADIA) });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([[sonataListing, []]]),
    );

    await expect(
      caller(db).sonata.wallet.syncListing({
        accountId: ALICE,
        tokenId: TOKEN,
        priceUsdc: "50000000",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(operations).toHaveLength(0);
  });

  it("ignores a demo role passed alongside the account", async () => {
    const { caller } = fakeWallet({ getNftToken: async () => master(ALICE) });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([[sonataListing, []]]),
    );

    await caller(db).sonata.wallet.syncListing({
      accountId: ALICE,
      tokenId: TOKEN,
      priceUsdc: "50000000",
      role: "nadia",
    } as never);

    const inserted = operations.find(
      (operation) =>
        operation.kind === "insert" && operation.table === sonataListing,
    );
    expect(inserted?.values).toMatchObject({ sellerAccountId: ALICE });
  });

  it("returns the existing listing when the replay is identical", async () => {
    const { caller } = fakeWallet({ getNftToken: async () => master(ALICE) });
    const current = {
      ...LISTING_ROW,
      sellerAccountId: ALICE,
      priceUsdc: "50000000",
    };
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([[sonataListing, [current]]]),
    );

    await expect(
      caller(db).sonata.wallet.syncListing({
        accountId: ALICE,
        tokenId: TOKEN,
        priceUsdc: "50000000",
      }),
    ).resolves.toBe(current);
    expect(operations).toHaveLength(0);
  });

  it("closes an earlier active listing before opening the new one", async () => {
    const { caller } = fakeWallet({ getNftToken: async () => master(ALICE) });
    const { db, operations } = fakeDb(
      new Map<unknown, Row[] | Row[][]>([
        [sonataListing, [{ ...LISTING_ROW, priceUsdc: "10000000" }]],
      ]),
    );

    await caller(db).sonata.wallet.syncListing({
      accountId: ALICE,
      tokenId: TOKEN,
      priceUsdc: "75000000",
    });

    expect(operations.map((operation) => operation.kind)).toEqual([
      "update",
      "insert",
    ]);
    expect(operations[0]).toMatchObject({
      kind: "update",
      table: sonataListing,
      values: { active: false },
    });
    expect(operations[1]).toMatchObject({
      kind: "insert",
      table: sonataListing,
      values: { sellerAccountId: ALICE, priceUsdc: "75000000" },
    });
  });
});
