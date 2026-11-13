"use client";

/**
 * The browser half of the wallet flow. This module is only ever reached through
 * a dynamic `import()` from a click or a signing action, so the wallet selector
 * (and its CSS) stay out of first-load JS.
 *
 * The selector signs on NEAR testnet with My NEAR Wallet. Transactions are
 * built as plain `FunctionCall` actions (`lib/sonata/wallet.ts`) and converted
 * to the near-api-js action classes the selector expects right here.
 */
import {
  internalActionToNaj,
  setupWalletSelector,
  type WalletSelector,
} from "@near-wallet-selector/core";
import {
  setupModal,
  type WalletSelectorModal,
} from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

import {
  WALLET_CONTRACTS,
  WALLET_CONNECT_CANCELLED,
  type WalletTransaction,
} from "./wallet";

// oxlint-disable-next-line import/no-unassigned-import -- the modal styles load with the selector chunk
import "@near-wallet-selector/modal-ui/styles.css";

type SelectorBundle = {
  selector: WalletSelector;
  modal: WalletSelectorModal;
};

let bundle: Promise<SelectorBundle> | undefined;

async function createBundle(): Promise<SelectorBundle> {
  const selector = await setupWalletSelector({
    network: "testnet",
    modules: [setupMyNearWallet()],
    allowMultipleSelectors: false,
    optimizeWalletOrder: false,
  });

  const modal = setupModal(selector, {
    contractId: WALLET_CONTRACTS.market,
    theme: "auto",
    description:
      "Connect a NEAR testnet wallet to buy the pass, buy masters and manage what you own.",
  });

  return { selector, modal };
}

/** One selector per tab; the first caller pays for loading the chunk. */
export function getWalletSelector(): Promise<SelectorBundle> {
  bundle ??= createBundle();
  return bundle;
}

function firstAccount(selector: WalletSelector): string | null {
  return selector.store.getState().accounts[0]?.accountId ?? null;
}

/**
 * Opens the wallet modal and resolves with the account the visitor approved.
 * A selector that already holds a session resolves at once.
 */
export async function connectWallet(): Promise<string> {
  const { selector, modal } = await getWalletSelector();

  const existing = firstAccount(selector);
  if (existing) return existing;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (accountId: string | null, reason?: string) => {
      if (settled) return;
      settled = true;
      subscription.remove();
      hideSubscription.remove();
      modal.hide();
      if (accountId) resolve(accountId);
      else reject(new Error(reason ?? "The wallet did not return an account."));
    };

    const subscription = selector.on("signedIn", ({ accounts }) => {
      finish(accounts[0]?.accountId ?? null);
    });

    /* Closing the modal must not leave the connect button pending forever. */
    const hideSubscription = modal.on("onHide", ({ hideReason }) => {
      if (hideReason === "user-triggered") {
        finish(null, WALLET_CONNECT_CANCELLED);
      }
    });

    modal.show();
  });
}

/** Signs and sends the wallet's transactions in one approval. */
export async function signWalletTransactions(
  transactions: readonly WalletTransaction[],
): Promise<void> {
  const { selector } = await getWalletSelector();

  if (!selector.isSignedIn()) {
    throw new Error("Connect your NEAR testnet wallet to continue.");
  }

  const wallet = await selector.wallet();
  await wallet.signAndSendTransactions({
    transactions: transactions.map((transaction) => ({
      receiverId: transaction.receiverId,
      actions: transaction.actions.map(internalActionToNaj),
    })),
  });
}

/** Clears the selector's own session; the cookie is the caller's job. */
export async function disconnectWallet(): Promise<void> {
  if (!bundle) return;

  const { selector } = await bundle;
  if (!selector.isSignedIn()) return;

  const wallet = await selector.wallet();
  await wallet.signOut();
}
