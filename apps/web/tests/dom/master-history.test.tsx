import { describe, expect, it } from "bun:test";

import type {
  SonataListingRow,
  SonataOwnershipRow,
  SonataPayoutRow,
} from "@infinitunes/types";
import { renderToStaticMarkup } from "react-dom/server";

import { MasterHistory } from "../../components/sonata/master-history";
import {
  buildMasterHistory,
  historyEventLabel,
} from "../../lib/sonata/history";

const tokenId = "midnight-drive";
const hash = (letter: string) => `0x${letter.repeat(64)}`;

const mint: SonataOwnershipRow = {
  id: 1,
  tokenId,
  ownerAccountId: "nadia-sonata.testnet",
  acquiredAt: new Date("2026-01-01T00:00:00Z"),
  priceUsdc: null,
  txHash: hash("a"),
  eventType: "mint",
};

const listing: SonataListingRow = {
  id: 1,
  tokenId,
  sellerAccountId: "nadia-sonata.testnet",
  priceUsdc: "45000000",
  active: false,
  txHash: hash("b"),
  createdAt: new Date("2026-02-01T00:00:00Z"),
  cancelledAt: null,
  soldAt: new Date("2026-03-01T00:00:00Z"),
};

const payment: SonataPayoutRow = {
  epochId: -2,
  tokenId,
  seconds: 43_200,
  amountUsdc: "1250000",
  txHash: hash("c"),
  createdAt: new Date("2026-02-15T00:00:00Z"),
};

const sale: SonataOwnershipRow = {
  id: 2,
  tokenId,
  ownerAccountId: "buyer.sonata.testnet",
  acquiredAt: new Date("2026-03-01T00:00:00Z"),
  priceUsdc: "50000000",
  txHash: hash("d"),
  eventType: "sale",
};

describe("master history timeline", () => {
  it("orders every event oldest first and names each kind", () => {
    const events = buildMasterHistory({
      ownership: [sale, mint],
      listings: [listing],
      payouts: [payment],
    });

    expect(events.map(historyEventLabel)).toEqual([
      "Minted",
      "Listed for sale",
      "Archive 2 payout",
      "Sold to buyer.sonata.testnet",
    ]);
    expect(events.map((event) => event.at.toISOString())).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
      "2026-02-15T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    ]);
  });

  it("renders labels, UTC dates, short hashes and 2-decimal USD", () => {
    const html = renderToStaticMarkup(
      <MasterHistory
        ownership={[mint, sale]}
        listings={[listing]}
        payouts={[payment]}
      />,
    );

    const labels = [
      "Minted",
      "Listed for sale",
      "Archive 2 payout",
      "Sold to buyer.sonata.testnet",
    ];
    const positions = labels.map((label) => html.indexOf(label));
    for (const [index, position] of positions.entries()) {
      expect(position).toBeGreaterThan(-1);
      if (index > 0) expect(position).toBeGreaterThan(positions[index - 1]!);
    }

    expect(html).toContain("Jan 1, 2026");
    expect(html).toContain("Feb 15, 2026");
    expect(html).toContain("$45.00");
    expect(html).toContain("$50.00");
    expect(html).toContain("$1.25");
    expect(html).toContain("12.00 h verified");
    expect(html).toContain("0xaaaaaa…aaaaaa");
    expect(html).toContain("4 events");
  });

  it("shows the empty state when only the mint is recorded", () => {
    const html = renderToStaticMarkup(
      <MasterHistory ownership={[mint]} listings={[]} payouts={[]} />,
    );

    expect(html).toContain("Minted");
    expect(html).toContain(
      "No ownership changes, listings or payouts yet. This master is still held by its creator.",
    );
    expect(html).toContain("1 event");
  });

  it("shows a distinct empty state with no rows at all", () => {
    const html = renderToStaticMarkup(
      <MasterHistory ownership={[]} listings={[]} payouts={[]} />,
    );

    expect(html).toContain(
      "No history recorded yet. Mint, sale and payout events appear here as they are indexed.",
    );
    expect(html).toContain("0 events");
  });
});
