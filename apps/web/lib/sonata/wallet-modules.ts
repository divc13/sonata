/**
 * The wallet-selector modules Sonata offers, in modal order.
 *
 * Meteor Wallet leads: it is the maintained NEAR wallet that works from a
 * browser without an extension. MyNearWallet is deprecated upstream and stays
 * only as a legacy fallback for a visitor who still holds that session. Both
 * are NEAR **testnet** wallets; there is no mainnet path.
 *
 * This module is separate from `wallet-selector.ts` so the order, ids and
 * labels can be asserted (`tests/sonata-wallet-modules.test.ts`) without the
 * modal chunk, its CSS or an actual wallet.
 */
import type { WalletModuleFactory } from "@near-wallet-selector/core";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

/** NEAR testnet only: the contracts and the faucet are testnet deployments. */
export const SONATA_WALLET_NETWORK = "testnet" as const;

/**
 * Modal order, Meteor first (`optimizeWalletOrder: false` in the selector keeps
 * this order). MyNearWallet is the legacy fallback.
 */
export function setupSonataWalletModules(): WalletModuleFactory[] {
  return [setupMeteorWallet(), setupMyNearWallet()];
}

/** The connect modal's subtitle; names the primary wallet and the network. */
export const SONATA_WALLET_MODAL_DESCRIPTION =
  "Connect Meteor Wallet (or another NEAR testnet wallet) to buy the pass, buy masters and manage what you own.";
