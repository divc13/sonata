import { beforeEach, describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
mock.module("~/lib/trpc/vanilla", () => ({
  trpc: {
    sonata: {
      wallet: {
        syncListing: { mutate: async () => ({}) },
      },
    },
  },
}));
mock.module("sonner", () => ({
  toast: { success: () => {}, error: () => {} },
}));

type WalletState = {
  accountId: string | null;
  shortAccount: string | null;
  balanceUsdc: string | null;
  balanceLabel: string;
  connecting: boolean;
  signing: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  sign: () => Promise<void>;
};

const wallet: WalletState = {
  accountId: null,
  shortAccount: null,
  balanceUsdc: null,
  balanceLabel: "—",
  connecting: false,
  signing: false,
  connect: async () => {},
  disconnect: async () => {},
  refreshBalance: async () => {},
  sign: async () => {},
};

mock.module("../../components/sonata/wallet-provider", () => ({
  useWallet: () => wallet,
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

function connected(accountId: string) {
  wallet.accountId = accountId;
  wallet.shortAccount = accountId;
}

beforeEach(() => {
  wallet.accountId = null;
  wallet.shortAccount = null;
});

describe("manage master view", () => {
  it("asks a disconnected visitor to connect instead of showing the gate", () => {
    const html = renderToStaticMarkup(
      <ManageMasterView {...base} walletAccountId={null} isOwner={false} />,
    );

    expect(html).toContain("Connect to manage this master");
    expect(html).toContain("Testnet wallet");
    expect(html).toContain("not connected");
    expect(html).not.toContain("Withdraw earnings");
    expect(html).not.toContain("Only the current owner can manage");
    expect(html).toContain('href="/master/midnight-drive"');
  });

  it("blocks a wallet that is not the current owner", () => {
    connected("collector.sonata.testnet");

    const html = renderToStaticMarkup(
      <ManageMasterView
        {...base}
        walletAccountId="collector.sonata.testnet"
        isOwner={false}
      />,
    );

    expect(html).toContain("Only the current owner can manage this master");
    expect(html).toContain("Viewing only");
    expect(html).toContain("collector.sonata.testnet");
    expect(html).not.toContain("Withdraw earnings");
    expect(html).not.toContain("List for resale");
    expect(html).not.toContain("Connect to manage this master");
    expect(html).toContain('href="/master/midnight-drive"');
  });

  it("shows the holder view with withdraw and resale actions", () => {
    connected("nadia-sonata.testnet");

    const html = renderToStaticMarkup(
      <ManageMasterView
        {...base}
        walletAccountId="nadia-sonata.testnet"
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
    connected("nadia-sonata.testnet");

    const html = renderToStaticMarkup(
      <ManageMasterView
        {...base}
        walletAccountId="nadia-sonata.testnet"
        isOwner
        listingPriceUsdc="50000000"
      />,
    );

    expect(html).toContain("Already for sale at $50.00");
    expect(html).not.toContain("List for resale");
  });

  it("never renders the demo viewer switcher", () => {
    connected("collector.sonata.testnet");

    const html = renderToStaticMarkup(
      <ManageMasterView
        {...base}
        walletAccountId="collector.sonata.testnet"
        isOwner={false}
      />,
    );

    expect(html).not.toContain("View as");
    expect(html).not.toContain("demo");
  });
});
