import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { PassStatusCard } from "../../components/sonata/pass-status-card";
import { passStatus } from "../../lib/sonata-catalog";

const now = new Date("2026-11-07T00:00:00Z");

describe("PassStatusCard", () => {
  it("shows an active pass with its expiry date and days left", () => {
    const html = renderToStaticMarkup(
      <PassStatusCard
        status={passStatus(
          {
            id: 1,
            accountId: "listener.sonata.testnet",
            tokenId: "pass-1",
            startsAt: new Date("2026-11-01T00:00:00Z"),
            expiresAt: new Date("2026-11-30T00:00:00Z"),
            priceUsdc: "5000000",
            txHash: "0xpass",
            createdAt: new Date("2026-11-01T00:00:00Z"),
          },
          now,
        )}
      />,
    );

    expect(html).toContain("Pass active");
    expect(html).toContain("Listening until Nov 30, 2026");
    expect(html).toContain("23 days left");
    expect(html).not.toContain("Get 30 days");
  });

  it("offers the pass on the free tier", () => {
    const html = renderToStaticMarkup(
      <PassStatusCard status={passStatus(null, now)} />,
    );

    expect(html).toContain("Free tier");
    expect(html).toContain('href="/pass"');
    expect(html).not.toContain("days left");
  });
});
