import { describe, expect, it } from "bun:test";

import {
  buildUsdcStorageDepositCall,
  buildUsdcTransferCall,
  createSonataWallet,
  DEFAULT_FUNCTION_CALL_GAS,
  FAUCET_ACCOUNT_ID,
  FAUCET_FALLBACK_SECRET_KEY_ENV,
  FAUCET_GRANT_USDC_MICRO,
  FAUCET_SECRET_KEY_ENV,
  FT_TRANSFER_GAS,
  getFaucetSigner,
  SonataChainError,
  USDC_STORAGE_DEPOSIT_YOCTO,
  type CallOptions,
  type ChainAccount,
  type ChainResult,
  type FaucetSigner,
} from "../src";
import { assertNearAccountId, isValidNearAccountId } from "../src/account-id";

type CapturedCall = {
  accountId: string;
  contractId: string;
  method: string;
  args: Record<string, unknown>;
  options: CallOptions;
};

type CapturedView = {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
};

const TEST_SECRET = "ed25519:test-only";

function setup(
  options: {
    viewResult?: unknown;
    viewError?: Error;
    callError?: Error;
    /** 1-based call index that throws `callError`; all calls when omitted. */
    failAtCall?: number;
    signer?: FaucetSigner;
  } = {},
) {
  const calls: CapturedCall[] = [];
  const views: CapturedView[] = [];

  const wallet = createSonataWallet({
    resolveFaucetSigner: () =>
      options.signer ?? {
        accountId: FAUCET_ACCOUNT_ID,
        secretKey: TEST_SECRET,
        secretKeyEnv: FAUCET_SECRET_KEY_ENV,
      },
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
      if (
        options.callError &&
        (options.failAtCall === undefined ||
          options.failAtCall === calls.length)
      ) {
        throw options.callError;
      }
      return { txHash: "0xfaucet", outcome: "success" };
    },
  });

  return { wallet, calls, views };
}

function env(values: Record<string, string | undefined>) {
  return values;
}

describe("faucet signer", () => {
  it("prefers SONATA_FAUCET_SECRET_KEY and defaults the account", () => {
    const signer = getFaucetSigner(
      env({
        [FAUCET_SECRET_KEY_ENV]: "ed25519:faucet",
        [FAUCET_FALLBACK_SECRET_KEY_ENV]: "ed25519:collector",
      }),
    );

    expect(signer).toEqual({
      accountId: FAUCET_ACCOUNT_ID,
      secretKey: "ed25519:faucet",
      secretKeyEnv: FAUCET_SECRET_KEY_ENV,
    });
  });

  it("uses the collector demo key only as a local fallback", () => {
    const signer = getFaucetSigner(
      env({ [FAUCET_FALLBACK_SECRET_KEY_ENV]: "ed25519:collector" }),
    );

    expect(signer.accountId).toBe(FAUCET_ACCOUNT_ID);
    expect(signer.secretKeyEnv).toBe(FAUCET_FALLBACK_SECRET_KEY_ENV);
  });

  it("honours SONATA_FAUCET_ACCOUNT_ID", () => {
    const signer = getFaucetSigner(
      env({
        SONATA_FAUCET_ACCOUNT_ID: "faucet.sonata.testnet",
        [FAUCET_SECRET_KEY_ENV]: "ed25519:faucet",
      }),
    );

    expect(signer.accountId).toBe("faucet.sonata.testnet");
  });

  it("names the environment variables, never a key, when unconfigured", () => {
    expect(() => getFaucetSigner(env({}))).toThrow(SonataChainError);

    try {
      getFaucetSigner(env({}));
      throw new Error("expected getFaucetSigner to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SonataChainError);
      expect((error as SonataChainError).code).toBe("missing-key");
      expect((error as Error).message).toContain(FAUCET_SECRET_KEY_ENV);
      expect((error as Error).message).toContain(
        FAUCET_FALLBACK_SECRET_KEY_ENV,
      );
      expect((error as Error).message).not.toContain("ed25519");
    }
  });
});

describe("USDC transfer call", () => {
  it("builds a plain ft_transfer with 1 yocto and transfer gas", () => {
    expect(buildUsdcTransferCall("alice.testnet", "025000000")).toMatchObject({
      contractId: "usdc-sonata.testnet",
      method: "ft_transfer",
      deposit: 1n,
      gas: FT_TRANSFER_GAS,
      args: {
        receiver_id: "alice.testnet",
        amount: FAUCET_GRANT_USDC_MICRO,
        memo: null,
      },
    });
  });

  it("rejects invalid receivers and non-positive amounts", () => {
    expect(() => buildUsdcTransferCall("Not An Account", "25000000")).toThrow(
      SonataChainError,
    );
    expect(() => buildUsdcTransferCall("alice.testnet", "0")).toThrow(
      SonataChainError,
    );
    expect(() => buildUsdcTransferCall("alice.testnet", "1.5")).toThrow(
      SonataChainError,
    );
  });

  it("builds the registration call with the 0.01 NEAR storage deposit", () => {
    expect(buildUsdcStorageDepositCall("alice.testnet")).toMatchObject({
      contractId: "usdc-sonata.testnet",
      method: "storage_deposit",
      deposit: 10_000_000_000_000_000_000_000n,
      gas: DEFAULT_FUNCTION_CALL_GAS,
      args: { account_id: "alice.testnet", registration_only: true },
    });
    expect(USDC_STORAGE_DEPOSIT_YOCTO).toBe(10_000_000_000_000_000_000_000n);
  });

  it("registers the receiver before transferring, in two separate calls", async () => {
    const { wallet, calls } = setup();

    await expect(
      wallet.transferUsdc({
        receiverId: "alice.testnet",
        amountUsdc: FAUCET_GRANT_USDC_MICRO,
      }),
    ).resolves.toEqual({ txHash: "0xfaucet", outcome: "success" });

    /* Order matters: a transfer to an unregistered account panics. */
    expect(calls.map((call) => call.method)).toEqual([
      "storage_deposit",
      "ft_transfer",
    ]);
    expect(calls).toEqual([
      {
        accountId: FAUCET_ACCOUNT_ID,
        contractId: "usdc-sonata.testnet",
        method: "storage_deposit",
        args: { account_id: "alice.testnet", registration_only: true },
        options: {
          deposit: USDC_STORAGE_DEPOSIT_YOCTO,
          gas: DEFAULT_FUNCTION_CALL_GAS,
        },
      },
      {
        accountId: FAUCET_ACCOUNT_ID,
        contractId: "usdc-sonata.testnet",
        method: "ft_transfer",
        args: {
          receiver_id: "alice.testnet",
          amount: FAUCET_GRANT_USDC_MICRO,
          memo: null,
        },
        options: { deposit: 1n, gas: FT_TRANSFER_GAS },
      },
    ]);
  });

  it("does not move funds when registration fails", async () => {
    const { wallet, calls } = setup({
      callError: new SonataChainError(
        "contract-panic",
        "The attached deposit is less than the required storage.",
      ),
      failAtCall: 1,
    });

    await expect(
      wallet.transferUsdc({
        receiverId: "alice.testnet",
        amountUsdc: FAUCET_GRANT_USDC_MICRO,
      }),
    ).rejects.toBeInstanceOf(SonataChainError);

    expect(calls.map((call) => call.method)).toEqual(["storage_deposit"]);
  });

  it("surfaces a chain failure without signing as anyone else", async () => {
    const { wallet, calls } = setup({
      callError: new SonataChainError(
        "contract-panic",
        "The account is not registered: the account is not registered on the USDC contract.",
      ),
    });

    await expect(
      wallet.transferUsdc({
        receiverId: "alice.testnet",
        amountUsdc: FAUCET_GRANT_USDC_MICRO,
      }),
    ).rejects.toBeInstanceOf(SonataChainError);
    /* The failure happens on the first faucet-signed call (registration). */
    expect(calls).toHaveLength(1);
    expect(calls[0]?.accountId).toBe(FAUCET_ACCOUNT_ID);
  });
});

describe("chain views", () => {
  it("reads ft_balance_of as a normalized micro-USDC string", async () => {
    const { wallet, views } = setup({ viewResult: "0042000000" });

    await expect(wallet.getUsdcBalance("alice.testnet")).resolves.toBe(
      "42000000",
    );
    expect(views).toEqual([
      {
        contractId: "usdc-sonata.testnet",
        method: "ft_balance_of",
        args: { account_id: "alice.testnet" },
      },
    ]);
  });

  it("reads platform.pass_expiry and treats an outage as expired", async () => {
    const active = setup({ viewResult: 1_900_000_000 });
    await expect(active.wallet.getPassExpiry("alice.testnet")).resolves.toBe(
      1_900_000_000,
    );
    expect(active.views[0]).toMatchObject({
      contractId: "platform-sonata.testnet",
      method: "pass_expiry",
      args: { account_id: "alice.testnet" },
    });

    const broken = setup({ viewError: new Error("rpc down") });
    await expect(broken.wallet.getPassExpiry("alice.testnet")).resolves.toBe(0);
  });

  it("maps nft_token JSON to the ownership view", async () => {
    const { wallet, views } = setup({
      viewResult: {
        token_id: "midnight-drive",
        owner_id: "alice.testnet",
        creator_id: "nadia-sonata.testnet",
        sub_account: "midnight-drive.masters-sonata.testnet",
        royalty_bps: 500,
        minted_at: 1_800_000_000,
        last_transfer_at: 1_800_000_100,
        transfer_count: "2",
      },
    });

    await expect(wallet.getNftToken("midnight-drive")).resolves.toEqual({
      tokenId: "midnight-drive",
      ownerId: "alice.testnet",
      creatorId: "nadia-sonata.testnet",
      subAccount: "midnight-drive.masters-sonata.testnet",
      royaltyBps: 500,
      mintedAtSec: 1_800_000_000,
      lastTransferAtSec: 1_800_000_100,
      transferCount: 2,
    });
    expect(views[0]).toMatchObject({
      contractId: "masters-sonata.testnet",
      method: "nft_token",
      args: { token_id: "midnight-drive" },
    });
  });

  it("returns null for an unknown token or listing", async () => {
    await expect(
      setup({ viewResult: null }).wallet.getNftToken("unknown-slug"),
    ).resolves.toBeNull();
    await expect(
      setup({ viewResult: null }).wallet.getListing("unknown-slug"),
    ).resolves.toBeNull();
  });

  it("maps get_listing JSON, including inactive listings", async () => {
    const active = setup({
      viewResult: {
        seller: "alice.testnet",
        price: "050000000",
        created_at: 1_800_000_000,
        active: true,
      },
    });
    await expect(active.wallet.getListing("midnight-drive")).resolves.toEqual({
      tokenId: "midnight-drive",
      seller: "alice.testnet",
      price: "50000000",
      createdAtSec: 1_800_000_000,
      active: true,
    });
    expect(active.views[0]).toMatchObject({
      contractId: "market-sonata.testnet",
      method: "get_listing",
    });

    const closed = setup({
      viewResult: {
        seller: "alice.testnet",
        price: 50_000_000,
        created_at: 1_800_000_000,
        active: false,
      },
    });
    await expect(
      closed.wallet.getListing("midnight-drive"),
    ).resolves.toMatchObject({ price: "50000000", active: false });
  });
});

describe("account ids", () => {
  it("accepts testnet accounts and implicit ids", () => {
    expect(isValidNearAccountId("alice.testnet")).toBe(true);
    expect(isValidNearAccountId("a".repeat(64))).toBe(true);
    expect(assertNearAccountId("  alice.testnet  ")).toBe("alice.testnet");
  });

  it("rejects uppercase, separators at the edges and short ids", () => {
    expect(isValidNearAccountId("Alice.testnet")).toBe(false);
    expect(isValidNearAccountId("-alice.testnet")).toBe(false);
    expect(isValidNearAccountId("alice..testnet")).toBe(false);
    expect(isValidNearAccountId("a")).toBe(false);
    expect(() => assertNearAccountId("Alice")).toThrow(SonataChainError);
  });
});
