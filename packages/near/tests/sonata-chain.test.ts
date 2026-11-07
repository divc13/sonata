import { describe, expect, it } from "bun:test";

import {
  assertMicroUsdc,
  buildListCalls,
  buildPassCall,
  buyMasterMsg,
  createSonataChain,
  extractContractPanic,
  getDemoAccount,
  mapContractError,
  SonataChainError,
  toChainError,
  type CallOptions,
  type ChainAccount,
  type ChainResult,
  type DemoRole,
} from "../src";
import type { DemoSigner } from "../src/demo-accounts";

type CapturedCall = {
  accountId: string;
  contractId: string;
  method: string;
  args: Record<string, unknown>;
  options: CallOptions;
};

function setup(
  options: {
    viewResult?: unknown;
    viewError?: Error;
    callError?: Error;
  } = {},
) {
  const calls: CapturedCall[] = [];
  const views: Array<{
    contractId: string;
    method: string;
    args: Record<string, unknown>;
  }> = [];
  let nonce = 0;

  const chain = createSonataChain({
    resolveSigner: (role): DemoSigner => ({
      ...getDemoAccount(role),
      secretKey: "ed25519:test-only",
    }),
    createSignedAccount: (accountId): ChainAccount => ({
      accountId,
      /* Never used: the fake `callFunction` replaces the network. */
      account: {} as ChainAccount["account"],
    }),
    viewFunction: async (contractId, method, args = {}) => {
      views.push({ contractId, method, args });
      if (options.viewError) throw options.viewError;
      return options.viewResult as never;
    },
    callFunction: async (
      account,
      contractId,
      method,
      args = {},
      callOptions = {},
    ): Promise<ChainResult> => {
      calls.push({
        accountId: account.accountId,
        contractId,
        method,
        args,
        options: callOptions,
      });
      if (options.callError) throw options.callError;
      nonce += 1;
      return { txHash: `0x${nonce}`, outcome: "success" };
    },
  });

  return { chain, calls, views };
}

describe("micro-USDC argument building", () => {
  it("normalizes positive integer strings and rejects floats/zero", () => {
    expect(assertMicroUsdc("05000000")).toBe("5000000");
    expect(() => assertMicroUsdc("1.5")).toThrow(SonataChainError);
    expect(() => assertMicroUsdc("0")).toThrow(SonataChainError);
    expect(() => assertMicroUsdc("-5")).toThrow(SonataChainError);
    expect(() => assertMicroUsdc("5e6")).toThrow(SonataChainError);
  });

  it("builds the pass call with the frozen $5 price and msg", () => {
    expect(buildPassCall()).toMatchObject({
      contractId: "usdc-sonata.testnet",
      method: "ft_transfer_call",
      deposit: 1n,
      args: {
        receiver_id: "platform-sonata.testnet",
        amount: "5000000",
        msg: "pass",
        memo: null,
      },
    });
  });

  it("builds the market buy message and validates the token slug", () => {
    expect(buyMasterMsg("midnight-drive")).toBe("buy:midnight-drive");
    expect(() => buyMasterMsg("Not A Slug")).toThrow(SonataChainError);
  });

  it("builds approve-then-list calls with the required deposits", () => {
    const [approve, list] = buildListCalls("midnight-drive", "50000000");

    expect(approve).toMatchObject({
      contractId: "masters-sonata.testnet",
      method: "nft_approve",
      deposit: 10_000_000_000_000_000_000n,
      args: {
        token_id: "midnight-drive",
        account_id: "market-sonata.testnet",
        msg: null,
      },
    });
    expect(list).toMatchObject({
      contractId: "market-sonata.testnet",
      method: "list",
      deposit: 10_000_000_000_000_000_000_000n,
      args: { token_id: "midnight-drive", price: "50000000" },
    });
  });
});

describe("contract error mapping", () => {
  it("extracts a panic from nested RPC failure payloads", () => {
    const panic = extractContractPanic({
      status: {
        Failure: {
          ActionError: {
            kind: {
              FunctionCallError: {
                ExecutionError: "Smart contract panicked: Not the owner",
              },
            },
          },
        },
      },
    });
    expect(panic).toBe("Not the owner");
  });

  it("keeps the frozen panic text and adds a readable explanation", () => {
    expect(mapContractError("Not approved")).toBe(
      "Not approved: the seller must approve the market for this master first.",
    );
    expect(mapContractError("Nothing to withdraw")).toContain(
      "no USDC to withdraw",
    );
    expect(mapContractError("Some new panic")).toBe("Some new panic");
  });

  it("classifies panics and transport errors", () => {
    expect(
      toChainError(
        "Smart contract panicked: Listing not active",
        "market-sonata.testnet.list",
      ),
    ).toMatchObject({
      code: "contract-panic",
      panic: "Listing not active",
    });

    const transport = toChainError(
      new Error("fetch failed"),
      "usdc-sonata.testnet.ft_balance_of",
    );
    expect(transport.code).toBe("rpc");
    expect(transport.message).toContain("ft_balance_of");
    expect(transport.message).toContain("fetch failed");
  });
});

describe("createSonataChain", () => {
  it("buys a pass as the listener demo role", async () => {
    const { chain, calls } = setup();

    await expect(chain.buyPass("listener")).resolves.toEqual({
      txHash: "0x1",
      outcome: "success",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      accountId: "listener.sonata.testnet",
      contractId: "usdc-sonata.testnet",
      method: "ft_transfer_call",
      args: {
        receiver_id: "platform-sonata.testnet",
        amount: "5000000",
        msg: "pass",
      },
      options: { deposit: 1n },
    });
  });

  it("buys a master with the exact expected price", async () => {
    const { chain, calls, views } = setup({
      viewResult: { price: "50000000", active: true },
    });

    await chain.buyMaster("collector", "midnight-drive", "050000000");

    expect(views[0]).toMatchObject({
      contractId: "market-sonata.testnet",
      method: "get_listing",
      args: { token_id: "midnight-drive" },
    });
    expect(calls[0]).toMatchObject({
      accountId: "collector.sonata.testnet",
      contractId: "usdc-sonata.testnet",
      method: "ft_transfer_call",
      args: {
        receiver_id: "market-sonata.testnet",
        amount: "50000000",
        msg: "buy:midnight-drive",
      },
    });
  });

  it("refuses a stale price or an inactive listing before sending USDC", async () => {
    const stale = setup({
      viewResult: { price: "60000000", active: true },
    });
    await expect(
      stale.chain.buyMaster("collector", "midnight-drive", "50000000"),
    ).rejects.toMatchObject({ code: "invalid-input" });
    expect(stale.calls).toHaveLength(0);

    const inactive = setup({
      viewResult: { price: "50000000", active: false },
    });
    await expect(
      inactive.chain.buyMaster("collector", "midnight-drive", "50000000"),
    ).rejects.toMatchObject({ code: "invalid-input" });
    expect(inactive.calls).toHaveLength(0);
  });

  it("withdraws a partial amount or the whole song balance", async () => {
    const { chain, calls } = setup();

    await chain.withdrawFromSong("nadia", "midnight-drive", "1200000");
    expect(calls[0]).toMatchObject({
      contractId: "midnight-drive.masters-sonata.testnet",
      method: "withdraw",
      args: { amount: "1200000" },
      options: { deposit: 0n },
    });

    await chain.withdrawFromSong("nadia", "midnight-drive");
    expect(calls[1]).toMatchObject({
      contractId: "midnight-drive.masters-sonata.testnet",
      method: "withdraw_all",
      args: {},
    });
  });

  it("approves the market and then lists, returning the list tx", async () => {
    const { chain, calls } = setup();

    await expect(
      chain.listMaster("nadia", "midnight-drive", "50000000"),
    ).resolves.toEqual({ txHash: "0x2", outcome: "success" });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      contractId: "masters-sonata.testnet",
      method: "nft_approve",
      args: { account_id: "market-sonata.testnet" },
      options: { deposit: 10_000_000_000_000_000_000n },
    });
    expect(calls[1]).toMatchObject({
      contractId: "market-sonata.testnet",
      method: "list",
      args: { token_id: "midnight-drive", price: "50000000" },
      options: { deposit: 10_000_000_000_000_000_000_000n },
    });
  });

  it("never reaches the chain for invalid input or an unknown role", async () => {
    const { chain, calls } = setup();

    await expect(
      chain.buyMaster("collector", "UPPER", "1000000"),
    ).rejects.toMatchObject({ code: "invalid-input" });
    await expect(
      chain.buyMaster("collector", "midnight-drive", "0"),
    ).rejects.toMatchObject({ code: "invalid-input" });
    await expect(
      chain.withdrawFromSong("nadia", "midnight-drive", "1.25"),
    ).rejects.toMatchObject({ code: "invalid-input" });
    /* Runtime role input can bypass the TypeScript union. */
    await expect(chain.buyPass("admin" as DemoRole)).rejects.toMatchObject({
      code: "invalid-input",
    });

    expect(calls).toHaveLength(0);
  });

  it("reads pass expiry and treats an unreachable contract as expired", async () => {
    const active = setup({ viewResult: 1_900_000_000 });
    await expect(
      active.chain.getPassExpiry("listener.sonata.testnet"),
    ).resolves.toBe(1_900_000_000);
    expect(active.chain.isPassActive).toBeDefined();

    const down = setup({ viewError: new Error("fetch failed") });
    await expect(
      down.chain.getPassExpiry("listener.sonata.testnet"),
    ).resolves.toBe(0);
    await expect(
      down.chain.isPassActive("listener.sonata.testnet"),
    ).resolves.toBe(false);
  });

  it("reports active passes from the chain timestamp", async () => {
    const now = Math.floor(Date.now() / 1000);
    const future = setup({ viewResult: now + 3600 });
    const past = setup({ viewResult: now - 3600 });

    await expect(
      future.chain.isPassActive("listener.sonata.testnet"),
    ).resolves.toBe(true);
    await expect(
      past.chain.isPassActive("listener.sonata.testnet"),
    ).resolves.toBe(false);
  });

  it("reads the USDC balance as a micro-USDC string", async () => {
    const { chain } = setup({ viewResult: "123000000" });

    await expect(chain.getUsdcBalance("listener.sonata.testnet")).resolves.toBe(
      "123000000",
    );
  });

  it("propagates mapped chain failures", async () => {
    const { chain } = setup({
      callError: toChainError(
        "Smart contract panicked: Not approved",
        "market-sonata.testnet.list",
      ),
    });

    await expect(
      chain.listMaster("nadia", "midnight-drive", "50000000"),
    ).rejects.toMatchObject({
      code: "contract-panic",
      panic: "Not approved",
    });
  });
});
