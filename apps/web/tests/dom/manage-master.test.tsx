import { describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
mock.module("~/lib/sonata/demo-viewer-actions", () => ({
  selectDemoViewer: async () => {},
}));
mock.module("~/lib/trpc/vanilla", () => ({
  trpc: {
    sonata: {
      songs: { withdraw: { mutate: async () => ({ txHash: "0x1" }) } },
      market: { list: { mutate: async () => ({ txHash: "0x2" }) } },
    },
  },
}));
mock.module("sonner", () => ({
  toast: { success: () => {}, error: () => {} },
}));

const { ManageMasterView } =
  await import("../../components/sonata/manage-master-view");

const base = {
  tokenId: "midnight-drive",
  title: "Midnight Drive",
  artistName: "Nadia Vale",
  artistHandle: "@nadia",
  ownerAccountId: "nadia-sonata.testnet",
  songAccountId: "midnight-drive.masters-sonata.testnet",
  balanceUsdc: "18400000",
  listingPriceUsdc: null,
  earnings30dUsdc: "128400123",
};

describe("manage master view", () => {
  it("blocks anyone who is not the current owner", () => {
    const html = renderToStaticMarkup(
      <ManageMasterView
        {...base}
        viewerAccountId="collector.sonata.testnet"
        isOwner={false}
      />,
    );

    expect(html).toContain("Only the current owner can manage this master");
    expect(html).toContain("Viewing only");
    expect(html).not.toContain("Withdraw earnings");
    expect(html).not.toContain("List for resale");
    expect(html).toContain('href="/master/midnight-drive"');
  });

  it("shows the holder view with withdraw and resale actions", () => {
    const html = renderToStaticMarkup(
      <ManageMasterView
        {...base}
        viewerAccountId="nadia-sonata.testnet"
        isOwner
      />,
    );

    expect(html).toContain("Manage Midnight Drive");
    expect(html).toContain("You hold this master");
    expect(html).toContain("Withdraw earnings");
    expect(html).toContain("List for resale");
    expect(html).toContain("$18.40");
    expect(html).toContain("$128.40");
    expect(html).toContain('href="/master/midnight-drive"');
    expect(html).not.toContain("Only the current owner can manage");
  });

  it("reports an existing listing instead of offering another one", () => {
    const html = renderToStaticMarkup(
      <ManageMasterView
        {...base}
        viewerAccountId="nadia-sonata.testnet"
        isOwner
        listingPriceUsdc="50000000"
      />,
    );

    expect(html).toContain("Already for sale at $50.00");
    expect(html).not.toContain("List for resale");
  });

  it("explains the missing signer instead of rendering dead holder buttons", () => {
    const html = renderToStaticMarkup(
      <ManageMasterView
        {...base}
        ownerAccountId="kofi-sonata.testnet"
        viewerAccountId="nadia-sonata.testnet"
        isOwner
      />,
    );

    expect(html).toContain("no demo signer");
    expect(html).not.toContain("Withdraw earnings");
  });

  it("always renders the clearly-labelled demo switcher", () => {
    const html = renderToStaticMarkup(
      <ManageMasterView
        {...base}
        viewerAccountId="listener.sonata.testnet"
        isOwner={false}
      />,
    );

    expect(html).toContain("Demo: view as");
    expect(html).toContain("Nadia");
    expect(html).toContain("Collector");
    expect(html).toContain("Listener");
    expect(html).toContain("owner check");
  });
});
