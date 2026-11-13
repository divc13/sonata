import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const connect = mock(async () => {});
const disconnect = mock(async () => {});

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
  connect,
  disconnect,
  refreshBalance: async () => {},
  sign: async () => {},
};

mock.module("../../components/sonata/wallet-provider", () => ({
  useWallet: () => wallet,
}));

const { WalletConnectButton, WalletConnectPrompt } =
  await import("../../components/sonata/wallet-connect");

const roots: Root[] = [];

async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(node);
  });

  return container;
}

beforeEach(() => {
  connect.mockClear();
  disconnect.mockClear();
  wallet.accountId = null;
  wallet.shortAccount = null;
  wallet.balanceLabel = "—";
  wallet.connecting = false;
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

describe("WalletConnectButton", () => {
  it("opens the wallet modal when disconnected", async () => {
    const container = await mount(<WalletConnectButton />);
    const button = container.querySelector("button");

    expect(button?.textContent).toContain("Connect wallet");
    await act(async () => button?.click());
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("shows the truncated account, its balance and a disconnect control", async () => {
    wallet.accountId = "collector.sonata.testnet";
    wallet.shortAccount = "collecto…estnet";
    wallet.balanceLabel = "$25.00";

    const container = await mount(<WalletConnectButton />);
    const html = container.innerHTML;

    expect(html).toContain("collecto…estnet");
    expect(html).toContain("$25.00");
    expect(html).toContain("Testnet wallet");
    expect(html).toContain("Disconnect collector.sonata.testnet");

    const disconnectButton = container.querySelector(
      'button[aria-label^="Disconnect"]',
    );
    await act(async () => disconnectButton?.click());
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("WalletConnectPrompt", () => {
  it("states that the wallet is the only identity", async () => {
    const container = await mount(
      <WalletConnectPrompt note="Testnet USDC only." />,
    );

    expect(container.textContent).toContain("Connect a NEAR testnet wallet");
    expect(container.textContent).toContain("no email sign-in");
    expect(container.textContent).toContain("Testnet USDC only.");
    expect(container.textContent).toContain("Testnet wallet");

    const button = container.querySelector("button");
    await act(async () => button?.click());
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("does not offer a second connection once a wallet is present", async () => {
    wallet.accountId = "mira.testnet";
    wallet.shortAccount = "mira.testnet";

    const container = await mount(<WalletConnectPrompt />);
    const button = container.querySelector("button");

    expect(button?.textContent).toContain("Wallet connected");
    expect(button?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Loading this page for your wallet",
    );
  });
});
