import { describe, expect, it } from "bun:test";

import type { Network } from "@near-wallet-selector/core";

import {
  SONATA_WALLET_MODAL_DESCRIPTION,
  SONATA_WALLET_NETWORK,
  setupSonataWalletModules,
} from "../lib/sonata/wallet-modules";

/*
 * The module factories only read `options.network` to render their download
 * links, so a plain testnet preset is enough: no browser, no DOM and no wallet
 * extension. `wallet-selector.ts` itself cannot be imported here (client chunk,
 * modal CSS), which is why the module list lives in its own file.
 */
const network: Network = {
  networkId: "testnet",
  nodeUrl: "https://rpc.testnet.fastnear.com",
  helperUrl: "https://helper.testnet.near.org",
  explorerUrl: "https://testnet.nearblocks.io",
  indexerUrl: "https://testnet-api.kitwallet.app",
};

const options = {
  languageCode: undefined,
  network,
  debug: false,
  optimizeWalletOrder: false,
  randomizeWalletOrder: false,
  relayerUrl: undefined,
};

async function moduleMetadata() {
  const modules = await Promise.all(
    setupSonataWalletModules().map(async (factory) => {
      const walletModule = await factory({ options });
      if (!walletModule) {
        throw new Error("wallet module factory returned no module");
      }
      return walletModule;
    }),
  );

  return modules.map((walletModule) => ({
    id: walletModule.id,
    name: walletModule.metadata.name,
  }));
}

describe("Sonata wallet selector modules", () => {
  it("leads with Meteor Wallet on testnet", async () => {
    const modules = await moduleMetadata();

    expect(modules[0]).toEqual({ id: "meteor-wallet", name: "Meteor Wallet" });
    expect(SONATA_WALLET_NETWORK).toBe("testnet");
  });

  it("keeps MyNearWallet as the legacy fallback, second", async () => {
    const modules = await moduleMetadata();

    expect(modules.map((module) => module.id)).toEqual([
      "meteor-wallet",
      "my-near-wallet",
    ]);
    expect(modules.map((module) => module.name)).toEqual([
      "Meteor Wallet",
      "MyNearWallet",
    ]);
  });

  it("names Meteor Wallet and testnet in the modal description", () => {
    expect(SONATA_WALLET_MODAL_DESCRIPTION).toContain("Meteor Wallet");
    expect(SONATA_WALLET_MODAL_DESCRIPTION).toContain("NEAR testnet");
    expect(SONATA_WALLET_MODAL_DESCRIPTION).not.toMatch(/mainnet/i);
  });
});
