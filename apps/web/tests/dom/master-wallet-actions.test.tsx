import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

const refresh = mock(() => {});
const sign = mock(async () => {});
const refreshBalance = mock(async () => {});
const syncPurchase = mock(async () => ({}));
const connect = mock(async () => {});

type WalletState = {
  accountId: string | null;
  balanceUsdc: string | null;
  connecting: boolean;
  signing: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  sign: (transactions: readonly unknown[]) => Promise<void>;
};

const wallet: WalletState = {
  accountId: null,
  balanceUsdc: null,
  connecting: false,
  signing: false,
  connect,
  disconnect: async () => {},
  refreshBalance,
  sign,
};

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
mock.module("sonner", () => ({
  toast: { success: () => {}, error: () => {} },
}));
mock.module("~/lib/trpc/vanilla", () => ({
  trpc: {
    sonata: {
      wallet: { syncPurchase: { mutate: syncPurchase } },
    },
  },
}));
mock.module("../../components/sonata/wallet-provider", () => ({
  useWallet: () => wallet,
}));

const { MasterWalletActions } =
  await import("../../components/sonata/master-wallet-actions");

const base = {
  tokenId: "midnight-drive",
  ownerAccountId: "nadia-sonata.testnet",
  listingPriceUsdc: "50000000",
};

const roots: Root[] = [];

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(<MasterWalletActions {...base} accountId={wallet.accountId} />);
  });

  return container;
}

function buttonNamed(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );
}

beforeEach(() => {
  refresh.mockClear();
  sign.mockClear();
  refreshBalance.mockClear();
  syncPurchase.mockClear();
  connect.mockClear();
  wallet.accountId = null;
  wallet.balanceUsdc = null;
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

describe("MasterWalletActions", () => {
  it("invites a disconnected visitor to connect before buying", () => {
    const html = renderToStaticMarkup(
      <MasterWalletActions {...base} accountId={null} />,
    );

    expect(html).toContain("Connect wallet to buy");
    expect(html).toContain("Testnet wallet");
    expect(html).not.toContain("Buy as");
    expect(html).not.toContain("collector");
  });

  it("points the current owner at the manage page instead of a buy button", () => {
    const html = renderToStaticMarkup(
      <MasterWalletActions {...base} accountId="nadia-sonata.testnet" />,
    );

    expect(html).toContain("You hold this master");
    expect(html).toContain('href="/master/midnight-drive/manage"');
    expect(html).not.toContain("Buy for");
  });

  it("renders nothing when the master is not for sale", () => {
    const html = renderToStaticMarkup(
      <MasterWalletActions
        {...base}
        listingPriceUsdc={null}
        accountId="mira.testnet"
      />,
    );

    expect(html).toBe("");
  });

  it("signs the resale transfer, then syncs the purchase", async () => {
    wallet.accountId = "mira.testnet";
    wallet.balanceUsdc = "60000000";

    const container = await mount();
    await act(async () => buttonNamed(container, "Buy for $50.00")?.click());

    expect(sign).toHaveBeenCalledTimes(1);
    const [transactions] = sign.mock.calls[0] as unknown as [
      { actions: { params: { args: { msg: string } } }[] }[],
    ];
    expect(transactions[0].actions[0].params.args.msg).toBe(
      "buy:midnight-drive",
    );

    expect(syncPurchase).toHaveBeenCalledWith({
      accountId: "mira.testnet",
      tokenId: "midnight-drive",
    });
    expect(refreshBalance).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the cache untouched when the wallet rejects the transfer", async () => {
    wallet.accountId = "mira.testnet";
    sign.mockImplementationOnce(async () => {
      throw new Error("User rejected the transaction");
    });

    const container = await mount();
    await act(async () => buttonNamed(container, "Buy for $50.00")?.click());

    expect(syncPurchase).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("User rejected the transaction");
  });

  it("opens the wallet modal from the connect prompt", async () => {
    const container = await mount();
    await act(async () =>
      buttonNamed(container, "Connect wallet to buy")?.click(),
    );

    expect(connect).toHaveBeenCalledTimes(1);
  });
});
