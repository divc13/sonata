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
let buyResult: () => Promise<{
  txHash: string;
  outcome: "success";
}> = async () => ({
  txHash: "0xabc123",
  outcome: "success",
});
const buy = mock(() => buyResult());

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
  trpc: { sonata: { pass: { buy: { mutate: buy } } } },
}));

const { PassBuyAction } =
  await import("../../components/sonata/pass-buy-action");

const roots: Root[] = [];

async function mount(active: boolean) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<PassBuyAction active={active} />);
  });
  const button = container.querySelector("button");
  if (!button) throw new Error("PassBuyAction did not render a button");
  return button;
}

beforeEach(() => {
  toasts.length = 0;
  refresh.mockClear();
  buy.mockClear();
  buyResult = async () => ({ txHash: "0xabc123", outcome: "success" });
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

describe("PassBuyAction", () => {
  it("shows Pass active and never calls the mutation when the cache says active", async () => {
    const button = await mount(true);

    expect(button.textContent).toBe("Pass active");
    expect(button.disabled).toBe(true);

    await act(async () => button.click());

    expect(buy).not.toHaveBeenCalled();
  });

  it("buys as the demo listener, announces the change and refreshes", async () => {
    const button = await mount(false);
    expect(button.textContent).toBe("Get 30 days");

    let changedCount = 0;
    const onChange = () => {
      changedCount++;
    };
    window.addEventListener("sonata:pass-changed", onChange);
    try {
      await act(async () => button.click());
    } finally {
      window.removeEventListener("sonata:pass-changed", onChange);
    }

    expect(buy).toHaveBeenCalledWith({ role: "listener" });
    expect(toasts).toEqual([
      {
        kind: "success",
        message: "Pass active for 30 days",
        description: "Receipt 0xabc123",
      },
    ]);
    expect(changedCount).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the testnet-disabled server message and leaves the button usable", async () => {
    buyResult = async () => {
      throw new Error("Testnet actions are unavailable on this deployment.");
    };
    const button = await mount(false);

    await act(async () => button.click());

    expect(toasts).toEqual([
      {
        kind: "error",
        message: "Could not buy the pass",
        description: "Testnet actions are unavailable on this deployment.",
      },
    ]);
    expect(refresh).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Get 30 days");
  });

  it("keeps the readable chain message for a precondition failure", async () => {
    buyResult = async () => {
      throw Object.assign(
        new Error(
          "Insufficient balance: the account does not hold enough USDC.",
        ),
        { code: "PRECONDITION_FAILED" },
      );
    };
    const button = await mount(false);

    await act(async () => button.click());

    expect(toasts).toEqual([
      {
        kind: "error",
        message: "Could not buy the pass",
        description:
          "Insufficient balance: the account does not hold enough USDC.",
      },
    ]);
  });
});
