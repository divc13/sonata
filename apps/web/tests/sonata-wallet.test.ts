import { describe, expect, it } from "bun:test";

import {
  APPROVAL_STORAGE_YOCTO,
  CONTRACT_IDS,
  FAUCET_GRANT_USDC_MICRO,
  FT_TRANSFER_CALL_GAS,
  LISTING_STORAGE_YOCTO,
  PASS_PRICE_USDC_MICRO,
} from "@infinitunes/near";

import {
  buildBuyTransaction,
  buildListTransactions,
  buildPassTransaction,
  buildWithdrawTransaction,
  buyMasterMsg,
  canAffordPass,
  formatUsdcMicro,
  isWalletAccountId,
  parseWalletCookie,
  SONATA_WALLET_COOKIE,
  SONATA_WALLET_COOKIE_MAX_AGE,
  STORAGE_YOCTO,
  truncateAccountId,
  WALLET_CONTRACTS,
  WALLET_GAS,
  walletCookieValue,
} from "../lib/sonata/wallet";

describe("wallet cookie", () => {
  it("uses a readable, 30 day, lax cookie name", () => {
    expect(SONATA_WALLET_COOKIE).toBe("sonata_wallet");
    expect(SONATA_WALLET_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });

  it("reads a valid account and trims the value", () => {
    expect(parseWalletCookie("mira.testnet")).toBe("mira.testnet");
    expect(parseWalletCookie("  mira.testnet  ")).toBe("mira.testnet");
  });

  it("accepts an implicit 64 character account", () => {
    const implicit = "a".repeat(64);
    expect(parseWalletCookie(implicit)).toBe(implicit);
  });

  it("decodes a percent-encoded cookie", () => {
    expect(parseWalletCookie("mira%2Etestnet")).toBe("mira.testnet");
  });

  it("rejects a missing, malformed or uppercase value", () => {
    expect(parseWalletCookie(undefined)).toBeNull();
    expect(parseWalletCookie(null)).toBeNull();
    expect(parseWalletCookie("")).toBeNull();
    expect(parseWalletCookie("Mira.testnet")).toBeNull();
    expect(parseWalletCookie("mira..testnet")).toBeNull();
    expect(parseWalletCookie("-mira.testnet")).toBeNull();
    expect(parseWalletCookie("a".repeat(65))).toBeNull();
  });

  it("writes a normalized value and refuses an invalid account", () => {
    expect(walletCookieValue("  mira.testnet ")).toBe("mira.testnet");
    expect(() => walletCookieValue("Mira Testnet")).toThrow(
      /Invalid NEAR account id/,
    );
  });

  it("validates account ids", () => {
    expect(isWalletAccountId("collector.sonata.testnet")).toBe(true);
    expect(isWalletAccountId("a")).toBe(false);
    expect(isWalletAccountId("UPPER.testnet")).toBe(false);
    expect(isWalletAccountId(42)).toBe(false);
  });
});

describe("truncateAccountId", () => {
  it("keeps a short account whole", () => {
    expect(truncateAccountId("mira.testnet")).toBe("mira.testnet");
  });

  it("keeps the head and tail of a long account", () => {
    expect(truncateAccountId("collector.sonata.testnet")).toBe(
      "collecto…estnet",
    );
  });

  it("honours custom head and tail lengths", () => {
    expect(truncateAccountId("collector.sonata.testnet", 10, 6)).toBe(
      "collector.…estnet",
    );
  });
});

describe("micro-USDC formatting", () => {
  it("formats whole and fractional dollars with two decimals", () => {
    expect(formatUsdcMicro("25000000")).toBe("$25.00");
    expect(formatUsdcMicro("5000000")).toBe("$5.00");
    expect(formatUsdcMicro("1234567")).toBe("$1.23");
    expect(formatUsdcMicro("0")).toBe("$0.00");
  });

  it("rounds dust to whole cents", () => {
    expect(formatUsdcMicro("18499999")).toBe("$18.50");
    expect(formatUsdcMicro("1234567890")).toBe("$1,234.57");
  });

  it("renders an unknown or malformed balance as a dash", () => {
    expect(formatUsdcMicro(null)).toBe("—");
    expect(formatUsdcMicro(undefined)).toBe("—");
    expect(formatUsdcMicro("1.5")).toBe("—");
  });
});

describe("pass affordability", () => {
  it("needs at least the pass price", () => {
    expect(canAffordPass("4999999")).toBe(false);
    expect(canAffordPass(PASS_PRICE_USDC_MICRO)).toBe(true);
    expect(canAffordPass("25000000")).toBe(true);
  });

  it("is false when the balance is unknown", () => {
    expect(canAffordPass(null)).toBe(false);
    expect(canAffordPass("")).toBe(false);
    expect(canAffordPass("abc")).toBe(false);
  });
});

describe("wallet transactions", () => {
  it("mirrors the deployed testnet contracts and gas", () => {
    expect(WALLET_CONTRACTS.masters).toBe(CONTRACT_IDS.masters);
    expect(WALLET_CONTRACTS.platform).toBe(CONTRACT_IDS.platform);
    expect(WALLET_CONTRACTS.market).toBe(CONTRACT_IDS.market);
    expect(WALLET_CONTRACTS.usdc).toBe(CONTRACT_IDS.usdc);

    expect(PASS_PRICE_USDC_MICRO).toBe("5000000");
    expect(FAUCET_GRANT_USDC_MICRO).toBe("25000000");

    expect(BigInt(WALLET_GAS.ftTransferCall)).toBe(FT_TRANSFER_CALL_GAS);
    expect(BigInt(WALLET_GAS.withdraw)).toBe(100_000_000_000_000n);
    expect(BigInt(WALLET_GAS.approve)).toBe(100_000_000_000_000n);
    /* 0.01 NEAR per storage deposit, as the task and the market require. */
    expect(BigInt(STORAGE_YOCTO)).toBe(LISTING_STORAGE_YOCTO);
    expect(BigInt(STORAGE_YOCTO) >= APPROVAL_STORAGE_YOCTO).toBe(true);
  });

  it("buys the pass with ft_transfer_call to the platform", () => {
    expect(buildPassTransaction()).toEqual({
      receiverId: "usdc-sonata.testnet",
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer_call",
            args: {
              receiver_id: "platform-sonata.testnet",
              amount: "5000000",
              msg: "pass",
              memo: null,
            },
            gas: "200000000000000",
            deposit: "1",
          },
        },
      ],
    });
  });

  it("buys a master with the listing price and a buy message", () => {
    const [action] = buildBuyTransaction("midnight-drive", "50000000").actions;

    expect(action.params.args).toEqual({
      receiver_id: "market-sonata.testnet",
      amount: "50000000",
      msg: "buy:midnight-drive",
      memo: null,
    });
    expect(action.params.gas).toBe("200000000000000");
    expect(action.params.deposit).toBe("1");
    expect(buyMasterMsg("midnight-drive")).toBe("buy:midnight-drive");
  });

  it("withdraws everything from the master's song account", () => {
    expect(
      buildWithdrawTransaction("midnight-drive.masters-sonata.testnet"),
    ).toEqual({
      receiverId: "midnight-drive.masters-sonata.testnet",
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "withdraw_all",
            args: {},
            gas: "100000000000000",
            deposit: "0",
          },
        },
      ],
    });
  });

  it("approves the market then lists with 0.01 NEAR storage each", () => {
    const [approve, list] = buildListTransactions("midnight-drive", "50000000");

    expect(approve.receiverId).toBe("masters-sonata.testnet");
    expect(approve.actions[0].params).toEqual({
      methodName: "nft_approve",
      args: {
        token_id: "midnight-drive",
        account_id: "market-sonata.testnet",
        msg: null,
      },
      gas: "100000000000000",
      deposit: "10000000000000000000000",
    });

    expect(list.receiverId).toBe("market-sonata.testnet");
    expect(list.actions[0].params).toEqual({
      methodName: "list",
      args: { token_id: "midnight-drive", price: "50000000" },
      gas: "100000000000000",
      deposit: "10000000000000000000000",
    });
  });
});
