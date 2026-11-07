import { describe, expect, it } from "bun:test";

import {
  DAILY_CAP_SEC,
  RATE_PER_HOUR_USDC_MICRO,
  type Epoch,
  type PayoutEntry,
  type SettlementChain,
} from "@infinitunes/near";

import {
  foldListenEvents,
  listenRootOf,
  type ListenEventForFold,
  type ListenSongForFold,
} from "../lib/sonata/listen-math";
import { settleEpoch } from "../lib/sonata/settlement-core";
import {
  computePayouts,
  mapChainEpoch,
  payoutRowsForRate,
} from "../lib/sonata/settlement-math";

const DAY = Date.UTC(2026, 10, 2, 12, 0, 0) / 1000;

const songs: ListenSongForFold[] = [
  {
    tokenId: "alpha-song",
    ownerAccountId: "collector.sonata.testnet",
    creatorAccountId: "nadia-sonata.testnet",
  },
  {
    tokenId: "beta-song",
    ownerAccountId: "collector.sonata.testnet",
    creatorAccountId: "nadia-sonata.testnet",
  },
];

function event(
  overrides: Partial<ListenEventForFold> & { tokenId: string },
): ListenEventForFold {
  return {
    accountId: "listener.sonata.testnet",
    seconds: 60,
    startedAt: DAY,
    clientEventId: `${overrides.tokenId}:${overrides.startedAt ?? DAY}`,
    ...overrides,
  };
}

describe("listen aggregation", () => {
  it("caps one account at 4 hours per UTC day across all songs", () => {
    const events = [
      event({
        tokenId: "alpha-song",
        seconds: 3600,
        startedAt: DAY,
        clientEventId: "a1",
      }),
      event({
        tokenId: "beta-song",
        seconds: 3600,
        startedAt: DAY + 60,
        clientEventId: "b1",
      }),
      event({
        tokenId: "alpha-song",
        seconds: 3600,
        startedAt: DAY + 120,
        clientEventId: "a2",
      }),
      event({
        tokenId: "beta-song",
        seconds: 3600,
        startedAt: DAY + 180,
        clientEventId: "b2",
      }),
      /* The cap is already exhausted, so this event earns zero. */
      event({
        tokenId: "alpha-song",
        seconds: 3600,
        startedAt: DAY + 240,
        clientEventId: "a3",
      }),
    ];

    const folded = foldListenEvents(events, songs);

    expect(folded.totalSeconds).toBe(DAILY_CAP_SEC);
    expect(folded.entries).toEqual([
      { tokenId: "alpha-song", seconds: 7200 },
      { tokenId: "beta-song", seconds: 7200 },
    ]);
    expect(
      folded.hours.find((hour) => hour.tokenId === "alpha-song")?.capped,
    ).toBe(true);
  });

  it("re-applies the cap on the next UTC day", () => {
    const nextDay = DAY + 86_400;
    const folded = foldListenEvents(
      [
        event({ tokenId: "alpha-song", seconds: 3600, clientEventId: "d1" }),
        event({
          tokenId: "alpha-song",
          seconds: 3600,
          startedAt: nextDay,
          clientEventId: "d2",
        }),
      ],
      songs,
    );

    expect(folded.entries).toEqual([{ tokenId: "alpha-song", seconds: 7200 }]);
    expect(folded.hours).toHaveLength(2);
  });

  it("excludes owner and creator self-listens", () => {
    const folded = foldListenEvents(
      [
        event({
          accountId: "collector.sonata.testnet",
          tokenId: "alpha-song",
          seconds: 900,
          clientEventId: "owner",
        }),
        event({
          accountId: "nadia-sonata.testnet",
          tokenId: "alpha-song",
          seconds: 900,
          clientEventId: "creator",
        }),
        event({
          tokenId: "alpha-song",
          seconds: 600,
          clientEventId: "fan",
        }),
      ],
      songs,
    );

    expect(folded.entries).toEqual([{ tokenId: "alpha-song", seconds: 600 }]);
  });

  it("dedupes repeated client event ids", () => {
    const folded = foldListenEvents(
      [
        event({ tokenId: "alpha-song", seconds: 30, clientEventId: "same" }),
        event({ tokenId: "alpha-song", seconds: 30, clientEventId: "same" }),
        event({ tokenId: "alpha-song", seconds: 15, clientEventId: "other" }),
      ],
      songs,
    );

    expect(folded.entries).toEqual([{ tokenId: "alpha-song", seconds: 45 }]);
    expect(folded.eventCount).toBe(2);
  });

  it("sorts entries and produces a stable listen root", () => {
    const events = [
      event({ tokenId: "beta-song", seconds: 120, clientEventId: "b" }),
      event({ tokenId: "alpha-song", seconds: 60, clientEventId: "a" }),
    ];

    const forward = foldListenEvents(events, songs);
    const reversed = foldListenEvents([...events].reverse(), songs);

    expect(forward.entries.map((entry) => entry.tokenId)).toEqual([
      "alpha-song",
      "beta-song",
    ]);
    expect(reversed.listenRoot).toBe(forward.listenRoot);
    expect(forward.listenRoot).toBe(
      listenRootOf([
        { tokenId: "alpha-song", seconds: 60 },
        { tokenId: "beta-song", seconds: 120 },
      ]),
    );
    expect(forward.listenRoot).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores unverified events and unknown masters", () => {
    const folded = foldListenEvents(
      [
        event({
          tokenId: "alpha-song",
          seconds: 60,
          clientEventId: "preview",
          verified: false,
        }),
        event({
          tokenId: "missing-song",
          seconds: 60,
          clientEventId: "missing",
        }),
      ],
      songs,
    );

    expect(folded.entries).toEqual([]);
    expect(folded.totalSeconds).toBe(0);
  });
});

describe("payout math", () => {
  const entries: PayoutEntry[] = [
    { tokenId: "alpha-song", seconds: 3600 },
    { tokenId: "beta-song", seconds: 1 },
  ];

  it("pays the fixed rate when the balance can fund it", () => {
    const result = computePayouts(entries, {
      balanceBeforeUsdc: "1000000000",
      ratePerHourUsdc: RATE_PER_HOUR_USDC_MICRO,
    });

    expect(result.mode).toBe("constant");
    expect(result.effectiveRatePerHour).toBe("30000");
    expect(result.payouts).toEqual([
      { tokenId: "alpha-song", seconds: 3600, amountUsdc: "30000" },
      { tokenId: "beta-song", seconds: 1, amountUsdc: "8" },
    ]);
    expect(result.totalPaidUsdc).toBe("30008");
  });

  it("pays pro-rata when the balance cannot fund R", () => {
    const result = computePayouts(
      [
        { tokenId: "alpha-song", seconds: 36_000 },
        { tokenId: "beta-song", seconds: 36_000 },
      ],
      {
        /* 72,000s = 20h; $0.25 / 20h = 12,500 micro-USDC/hour. */
        balanceBeforeUsdc: "250000",
        ratePerHourUsdc: RATE_PER_HOUR_USDC_MICRO,
      },
    );

    expect(result.mode).toBe("pro-rata");
    expect(result.effectiveRatePerHour).toBe("12500");
    expect(result.totalPaidUsdc).toBe("250000");
    expect(
      result.payouts.reduce(
        (sum, payout) => sum + BigInt(payout.amountUsdc),
        0n,
      ),
    ).toBeLessThanOrEqual(250_000n);
  });

  it("floors at both the effective rate and the per-song payout", () => {
    expect(
      payoutRowsForRate([{ tokenId: "alpha-song", seconds: 3599 }], "30000"),
    ).toEqual([{ tokenId: "alpha-song", seconds: 3599, amountUsdc: "29991" }]);
  });
});

describe("epoch id mapping", () => {
  const chainEpoch: Epoch = {
    id: 42,
    startedAtSec: DAY,
    closedAtSec: DAY + 604_800,
    balanceBeforeUsdc: "1000000000",
    totalSeconds: 72_000,
    effectiveRatePerHourUsdc: "30000",
    totalPaidUsdc: "600000000",
    listenRoot: "root-42",
    entriesCount: 11,
    mode: "constant",
  };

  it("takes the id from the chain, never minting a DB id", () => {
    const row = mapChainEpoch(chainEpoch, "fallback", "0xabc");

    expect(row.id).toBe(42);
    expect(row.listenRoot).toBe("root-42");
    expect(row.txHash).toBe("0xabc");
    expect(row.startedAt).toEqual(new Date(DAY * 1000));
    expect(row.mode).toBe("constant");
  });

  it("derives pro-rata mode from the effective rate", () => {
    const row = mapChainEpoch({
      ...chainEpoch,
      effectiveRatePerHourUsdc: "12500",
      mode: "constant",
    });

    expect(row.mode).toBe("pro-rata");
  });
});

describe("settleEpoch", () => {
  const entries: PayoutEntry[] = [{ tokenId: "alpha-song", seconds: 3600 }];
  const root = listenRootOf(entries);

  function chainWith(
    overrides: Partial<SettlementChain> = {},
  ): SettlementChain {
    return {
      settleEpoch: async () => ({ txHash: "0xtx", outcome: "success" }),
      getEpoch: async () => ({
        id: 9,
        startedAtSec: DAY,
        closedAtSec: DAY + 604_800,
        balanceBeforeUsdc: "1000000000",
        totalSeconds: 3600,
        effectiveRatePerHourUsdc: "30000",
        totalPaidUsdc: "30000",
        listenRoot: root,
        entriesCount: 1,
        mode: "constant",
      }),
      ...overrides,
    };
  }

  it("submits the oracle call and returns the chain epoch", async () => {
    const seen: Array<{ epochId: number; root: string }> = [];
    const result = await settleEpoch(9, entries, root, {
      chain: chainWith({
        settleEpoch: async (epochId, _entries, listenRoot) => {
          seen.push({ epochId, root: listenRoot });
          return { txHash: "0xtx", outcome: "success" };
        },
      }),
    });

    expect(seen).toEqual([{ epochId: 9, root }]);
    expect(result.txHash).toBe("0xtx");
    expect(result.epoch.id).toBe(9);
  });

  it("rejects a chain epoch whose id or root does not match", async () => {
    await expect(
      settleEpoch(9, entries, root, {
        chain: chainWith({
          getEpoch: async () => ({
            ...(await chainWith().getEpoch(9))!,
            id: 10,
          }),
        }),
      }),
    ).rejects.toMatchObject({ code: "chain-mismatch" });

    await expect(
      settleEpoch(9, entries, root, {
        chain: chainWith({
          getEpoch: async () => ({
            ...(await chainWith().getEpoch(9))!,
            listenRoot: "other-root",
          }),
        }),
      }),
    ).rejects.toMatchObject({ code: "chain-mismatch" });
  });

  it("rejects unsorted or duplicate entries before calling the chain", async () => {
    let called = false;

    await expect(
      settleEpoch(
        9,
        [
          { tokenId: "beta-song", seconds: 10 },
          { tokenId: "alpha-song", seconds: 10 },
        ],
        "root",
        {
          chain: chainWith({
            settleEpoch: async () => {
              called = true;
              return { txHash: "0x", outcome: "success" };
            },
          }),
        },
      ),
    ).rejects.toThrow("sorted");
    expect(called).toBe(false);
  });
});
