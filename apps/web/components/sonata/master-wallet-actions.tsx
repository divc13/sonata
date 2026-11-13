"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { canManageMaster } from "~/lib/sonata/manage-access";
import { formatUsdMicro2 } from "~/lib/sonata/market";
import {
  buildBuyTransaction,
  SONATA_WALLET_NETWORK_LABEL,
  truncateAccountId,
  WALLET_CONTRACTS,
} from "~/lib/sonata/wallet";
import { trpc } from "~/lib/trpc/vanilla";
import { userMessage } from "~/lib/user-message";
import { asRoute, cn } from "~/lib/utils";

import { useWallet } from "./wallet-provider";

type MasterWalletActionsProps = {
  tokenId: string;
  ownerAccountId: string;
  /** Active listing price in micro-USDC; `null` when the master is not listed. */
  listingPriceUsdc: string | null;
  /** The account in the wallet cookie, read on the server. */
  accountId: string | null;
};

const primaryButton =
  "inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60";

/**
 * The public master's wallet actions. The visitor's own wallet signs the
 * resale transfer; the cache is synced only after the transaction resolves.
 * The owner is pointed at the manage page instead of seeing a buy button.
 */
export function MasterWalletActions({
  tokenId,
  ownerAccountId,
  listingPriceUsdc,
  accountId,
}: MasterWalletActionsProps) {
  const router = useRouter();
  const { balanceUsdc, connect, connecting, refreshBalance, sign, signing } =
    useWallet();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner =
    accountId !== null && canManageMaster(accountId, ownerAccountId);

  if (accountId && isOwner) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-5">
        <div className="flex flex-col gap-1">
          <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {SONATA_WALLET_NETWORK_LABEL}
          </p>
          <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
            You hold this master
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            <span className="font-mono" title={accountId}>
              {truncateAccountId(accountId)}
            </span>{" "}
            owns it. Withdraw earnings or list it for resale from the manage
            page.
          </p>
        </div>
        <Link
          href={asRoute(`/master/${tokenId}/manage`)}
          className={cn(primaryButton, "no-underline")}
        >
          Manage your master
        </Link>
      </section>
    );
  }

  /* Nothing to buy and nobody to point at the manage page. */
  if (!listingPriceUsdc) return null;

  if (!accountId) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-5">
        <div className="flex flex-col gap-1">
          <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {SONATA_WALLET_NETWORK_LABEL}
          </p>
          <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
            Buy with your wallet
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Connect a NEAR testnet wallet to buy this master. The recording and
            its song account move to you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void connect()}
          disabled={connecting}
          aria-busy={connecting}
          className={primaryButton}
        >
          {connecting ? "Opening your wallet…" : "Connect wallet to buy"}
        </button>
      </section>
    );
  }

  async function buy() {
    if (!accountId || !listingPriceUsdc || pending || signing) return;

    setPending(true);
    setError(null);
    try {
      await sign([buildBuyTransaction(tokenId, listingPriceUsdc)]);
      await trpc.sonata.wallet.syncPurchase.mutate({ accountId, tokenId });
      toast.success("Master bought", {
        description: "Signed by your wallet. The song account is yours now.",
      });
      await refreshBalance();
      router.refresh();
    } catch (cause) {
      const message = userMessage(
        cause,
        "The purchase did not go through. Please try again.",
      );
      setError(message);
      toast.error("Could not buy the master", { description: message });
    } finally {
      setPending(false);
    }
  }

  const shortOnBalance =
    balanceUsdc !== null && BigInt(balanceUsdc) < BigInt(listingPriceUsdc);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-col gap-1">
        <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {SONATA_WALLET_NETWORK_LABEL}
        </p>
        <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
          Buy with your wallet
        </h2>
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-mono" title={accountId}>
            {truncateAccountId(accountId)}
          </span>{" "}
          signs the transfer to {WALLET_CONTRACTS.market}.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void buy()}
        disabled={pending || signing}
        aria-busy={pending}
        className={primaryButton}
      >
        {pending
          ? "Confirm in your wallet…"
          : `Buy for ${formatUsdMicro2(listingPriceUsdc)}`}
      </button>

      {shortOnBalance ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Your wallet balance is {formatUsdMicro2(balanceUsdc ?? "0")}. Get
          testnet USDC on the pass page.
        </p>
      ) : (
        <p className="text-[0.6875rem] leading-4 text-muted-foreground">
          Paid in testnet USDC. The sale is final on chain.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
