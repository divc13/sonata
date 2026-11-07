import { describe, expect, it } from "bun:test";

import type { SonataPayoutRow } from "@infinitunes/types";

import {
  earningsByEpoch,
  epochAxisLabel,
  formatEpochLabel,
  formatListenHours,
  formatMicroUsd,
  formatRatePerHour,
  isDemoEpochId,
  nextEpochId,
  payoutsToReceipts,
  sumMicro,
} from "../lib/sonata-display";

function payout(
  overrides: Partial<SonataPayoutRow> & { tokenId: string; epochId: number },
): SonataPayoutRow {
  return {
    seconds: 3600,
    amountUsdc: "30000",
    txHash: "0xtx",
    createdAt: new Date("2026-11-02T00:00:00Z"),
    ...overrides,
  };
}

describe("Sonata USD formatting", () => {
  it("formats micro-USDC as dollars without floating point drift", () => {
    expect(formatMicroUsd("50000000")).toBe("$50.00");
    expect(formatMicroUsd("0")).toBe("$0.00");
    expect(formatMicroUsd("1")).toBe("$0.000001");
    expect(formatMicroUsd("128400123")).toBe("$128.400123");
    expect(formatMicroUsd(null)).toBe("$0.00");
  });

  it("formats the fixed per-hour rate", () => {
    expect(formatRatePerHour("30000")).toBe("$0.03 / hr");
  });

  it("sums micro-USDC exactly beyond Number.MAX_SAFE_INTEGER", () => {
    expect(sumMicro(["9007199254740991", "1"])).toBe("9007199254740992");
    expect(sumMicro(["0", ""])).toBe("0");
    expect(sumMicro([])).toBe("0");
  });

  it("formats listen seconds as hours", () => {
    expect(formatListenHours(3600)).toBe("1.0 h");
    expect(formatListenHours(43560)).toBe("12.1 h");
    expect(formatListenHours(0)).toBe("0.0 h");
  });
});

describe("next epoch calculation", () => {
  it("returns 0 when no epoch has settled yet", () => {
    expect(nextEpochId([])).toBe(0);
  });

  it("ignores seeded demo history with negative ids", () => {
    expect(nextEpochId([{ id: -1 }, { id: -8 }, { id: -3 }])).toBe(0);
    expect(nextEpochId([{ id: -8 }, { id: 0 }])).toBe(1);
  });

  it("continues at max(chain id) + 1, not the array length", () => {
    expect(nextEpochId([{ id: 1 }, { id: 8 }, { id: 3 }])).toBe(9);
    expect(nextEpochId([{ id: 8 }])).toBe(9);
    expect(nextEpochId([{ id: -1 }, { id: 4 }, { id: -2 }])).toBe(5);
  });

  it("keeps the chain id when the first id is zero", () => {
    expect(nextEpochId([{ id: 0 }])).toBe(1);
  });
});

describe("epoch labels", () => {
  it("separates seeded demo history from chain epochs", () => {
    expect(isDemoEpochId(-1)).toBe(true);
    expect(isDemoEpochId(0)).toBe(false);
    expect(formatEpochLabel(-1)).toBe("Demo 1");
    expect(formatEpochLabel(-8)).toBe("Demo 8");
    expect(formatEpochLabel(0)).toBe("Epoch 0");
    expect(formatEpochLabel(12)).toBe("Epoch 12");
  });

  it("keeps chart labels compact", () => {
    expect(epochAxisLabel(-3)).toBe("D3");
    expect(epochAxisLabel(0)).toBe("E0");
  });
});

describe("payout to receipt mapping", () => {
  const payouts = [
    payout({ epochId: 8, tokenId: "midnight-drive", amountUsdc: "60000" }),
    payout({
      epochId: 8,
      tokenId: "slow-arc",
      seconds: 1800,
      amountUsdc: "15000",
      txHash: null,
    }),
  ];

  it("keeps the router order and fills titles by token id", () => {
    const receipts = payoutsToReceipts(
      payouts,
      new Map([
        ["midnight-drive", "Midnight Drive"],
        ["slow-arc", "Slow Arc"],
      ]),
    );

    expect(receipts).toEqual([
      {
        key: "8:midnight-drive",
        tokenId: "midnight-drive",
        title: "Midnight Drive",
        seconds: 3600,
        amountUsdc: "60000",
        txHash: "0xtx",
      },
      {
        key: "8:slow-arc",
        tokenId: "slow-arc",
        title: "Slow Arc",
        seconds: 1800,
        amountUsdc: "15000",
        txHash: null,
      },
    ]);
  });

  it("falls back to the token id when a title is missing", () => {
    const [receipt] = payoutsToReceipts(
      [payout({ epochId: 9, tokenId: "unknown" })],
      new Map(),
    );

    expect(receipt?.title).toBe("unknown");
  });
});

describe("earnings by epoch", () => {
  it("sums only the requested songs and sorts epochs oldest first", () => {
    const epochs = earningsByEpoch(
      [
        payout({ epochId: 8, tokenId: "slow-arc", amountUsdc: "15000" }),
        payout({ epochId: 7, tokenId: "midnight-drive", amountUsdc: "30000" }),
        payout({ epochId: 8, tokenId: "midnight-drive", amountUsdc: "45000" }),
        payout({ epochId: 8, tokenId: "paper-moons", amountUsdc: "90000" }),
      ],
      new Set(["midnight-drive", "slow-arc"]),
    );

    expect(epochs).toEqual([
      { epochId: 7, amountUsdc: "30000", seconds: 3600 },
      { epochId: 8, amountUsdc: "60000", seconds: 7200 },
    ]);
  });

  it("returns an empty series when none of the songs were paid", () => {
    expect(
      earningsByEpoch(
        [payout({ epochId: 8, tokenId: "someone-else" })],
        new Set(["midnight-drive"]),
      ),
    ).toEqual([]);
  });
});
