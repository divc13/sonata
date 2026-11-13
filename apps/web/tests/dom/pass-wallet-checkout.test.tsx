import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

type Toast = {
  kind: "success" | "error";
  message: string;
  description?: string;
};

const toasts: Toast[] = [];
const refresh = mock(() => {});
const sign = mock(async () => {});
const refreshBalance = mock(async () => {});
const syncPass = mock(async () => null);
const faucet = mock(async () => ({
  txHash: "0xfaucet",
  amountUsdc: "25000000",
}));

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
  accountId: "mira.testnet",
  balanceUsdc: "25000000",
  connecting: false,
  signing: false,
  connect: async () => {},
  disconnect: async () => {},
  refreshBalance,
  sign,
};

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
mock.module("sonner", () => ({
  toast: {
    success: (message: string, options?: { description?: string }) => {
      toasts.push({
        kind: "success",
        message,
        description: options?.description,
      });
    },
    error: (message: string, options?: { description?: string }) => {
      toasts.push({
        kind: "error",
        message,
        description: options?.description,
      });
    },
  },
}));
mock.module("~/lib/trpc/vanilla", () => ({
  trpc: {
    sonata: {
      wallet: {
        faucet: { mutate: faucet },
        syncPass: { mutate: syncPass },
      },
    },
  },
}));
mock.module("../../components/sonata/wallet-provider", () => ({
  useWallet: () => wallet,
}));

const { PassWalletCheckout } =
  await import("../../components/sonata/pass-wallet-checkout");

const roots: Root[] = [];

async function mount(
  props: Partial<{
    accountId: string;
    initialBalanceUsdc: string | null;
    active: boolean;
  }> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(
      <PassWalletCheckout
        accountId={props.accountId ?? "mira.testnet"}
        initialBalanceUsdc={
          props.initialBalanceUsdc === undefined
            ? "25000000"
            : props.initialBalanceUsdc
        }
        active={props.active ?? false}
      />,
    );
  });

  return container;
}

function buttonNamed(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );
}

beforeEach(() => {
  toasts.length = 0;
  refresh.mockClear();
  sign.mockClear();
  refreshBalance.mockClear();
  syncPass.mockClear();
  faucet.mockClear();
  wallet.accountId = "mira.testnet";
  wallet.balanceUsdc = "25000000";
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

describe("PassWalletCheckout", () => {
  it("shows the active pass without offering a purchase", async () => {
    const container = await mount({ active: true });

    const active = buttonNamed(container, "Pass active");
    expect(active?.disabled).toBe(true);
    expect(buttonNamed(container, "Buy the pass")).toBeUndefined();
    expect(buttonNamed(container, "testnet USDC")).toBeUndefined();
  });

  it("offers the faucet when the balance cannot cover the pass", async () => {
    wallet.balanceUsdc = "1000000";

    const container = await mount({ initialBalanceUsdc: "1000000" });

    expect(buttonNamed(container, "$25.00 testnet USDC")).toBeDefined();
    const buy = buttonNamed(container, "Needs $5.00 USDC");
    expect(buy?.disabled).toBe(true);
    expect(container.textContent).toContain("Balance $1.00");
  });

  it("signs the pass transfer, syncs after it lands and refreshes", async () => {
    const container = await mount();

    let changed = 0;
    const onChange = () => {
      changed++;
    };
    window.addEventListener("sonata:pass-changed", onChange);
    try {
      await act(async () => buttonNamed(container, "Buy the pass")?.click());
    } finally {
      window.removeEventListener("sonata:pass-changed", onChange);
    }

    expect(sign).toHaveBeenCalledTimes(1);
    const [transactions] = sign.mock.calls[0] as unknown as [
      { receiverId: string; actions: { params: { methodName: string } }[] }[],
    ];
    expect(transactions[0].receiverId).toBe("usdc-sonata.testnet");
    expect(transactions[0].actions[0].params.methodName).toBe(
      "ft_transfer_call",
    );

    expect(syncPass).toHaveBeenCalledWith({ accountId: "mira.testnet" });
    expect(refreshBalance).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(changed).toBe(1);
    expect(toasts[0]).toMatchObject({
      kind: "success",
      message: "Pass active for 30 days",
    });
  });

  it("does not sync the cache when the wallet rejects the transfer", async () => {
    sign.mockImplementationOnce(async () => {
      throw new Error("User rejected the transaction");
    });

    const container = await mount();
    await act(async () => buttonNamed(container, "Buy the pass")?.click());

    expect(syncPass).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(toasts[0]).toMatchObject({
      kind: "error",
      message: "Could not buy the pass",
      description: "User rejected the transaction",
    });
  });

  it("funds the wallet through the one-time faucet", async () => {
    wallet.balanceUsdc = "0";

    const container = await mount({ initialBalanceUsdc: "0" });
    await act(async () =>
      buttonNamed(container, "$25.00 testnet USDC")?.click(),
    );

    expect(faucet).toHaveBeenCalledWith({ accountId: "mira.testnet" });
    expect(refreshBalance).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(toasts[0]).toMatchObject({
      kind: "success",
      message: "$25.00 of testnet USDC added",
    });
  });
});
