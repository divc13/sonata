import { beforeEach, describe, expect, it } from "bun:test";

import {
  clearWalletAccount,
  getWalletAccountSnapshot,
  refreshWalletAccount,
  subscribeWalletAccount,
  writeWalletAccount,
} from "../../lib/sonata/wallet-store";

beforeEach(() => {
  clearWalletAccount();
  document.cookie = "sonata_wallet=; path=/; max-age=0";
  refreshWalletAccount();
});

describe("wallet cookie store", () => {
  it("writes a readable, path-scoped, lax cookie", () => {
    writeWalletAccount("collector.sonata.testnet");

    expect(document.cookie).toContain("sonata_wallet=collector.sonata.testnet");
    expect(getWalletAccountSnapshot()).toBe("collector.sonata.testnet");
  });

  it("notifies subscribers and clears on disconnect", () => {
    let changes = 0;
    const unsubscribe = subscribeWalletAccount(() => {
      changes++;
    });

    writeWalletAccount("mira.testnet");
    expect(changes).toBe(1);
    expect(getWalletAccountSnapshot()).toBe("mira.testnet");

    clearWalletAccount();
    expect(changes).toBe(2);
    expect(getWalletAccountSnapshot()).toBeNull();

    unsubscribe();
  });

  it("ignores a hand-edited cookie that is not a NEAR account", () => {
    document.cookie = "sonata_wallet=Not%20An%20Account; path=/";
    refreshWalletAccount();

    expect(getWalletAccountSnapshot()).toBeNull();
  });
});
