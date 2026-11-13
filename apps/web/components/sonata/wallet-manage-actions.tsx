"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { canManageMaster } from "~/lib/sonata/manage-access";
import { formatUsdMicro2, usdToMicroUsdc } from "~/lib/sonata/market";
import {
  buildListTransactions,
  buildWithdrawTransaction,
  SONATA_WALLET_NETWORK_LABEL,
  truncateAccountId,
} from "~/lib/sonata/wallet";
import { trpc } from "~/lib/trpc/vanilla";
import { userMessage } from "~/lib/user-message";

import { useWallet } from "./wallet-provider";

type WalletManageActionsProps = {
  tokenId: string;
  songAccountId: string;
  ownerAccountId: string;
  /** Active listing price in micro-USDC; `null` when the master is not listed. */
  listingPriceUsdc: string | null;
  /** The account in the wallet cookie, read on the server. */
  accountId: string | null;
};

type Pending = "list" | "withdraw" | null;

const primaryButton =
  "inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60";
const secondaryButton =
  "inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) border border-border/60 bg-transparent px-4 text-sm font-semibold transition-colors duration-fast hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60";

/**
 * Holder-only wallet actions. Both flows are signed by the connected account
 * and only then mirrored into the cache: `withdraw_all` on the master's song
 * account, or `nft_approve` + `market.list` for a resale.
 */
export function WalletManageActions({
  tokenId,
  songAccountId,
  ownerAccountId,
  listingPriceUsdc,
  accountId,
}: WalletManageActionsProps) {
  const router = useRouter();
  const { refreshBalance, sign, signing } = useWallet();
  const [pending, setPending] = useState<Pending>(null);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isOwner =
    accountId !== null && canManageMaster(accountId, ownerAccountId);
  if (!accountId || !isOwner) return null;

  const busy = pending !== null || signing;

  async function withdraw() {
    if (!accountId || busy) return;

    setPending("withdraw");
    setError(null);
    try {
      await sign([buildWithdrawTransaction(songAccountId)]);
      toast.success("Earnings withdrawn", {
        description: "The song account balance is in your wallet now.",
      });
      await refreshBalance();
      router.refresh();
    } catch (cause) {
      const message = userMessage(cause, "The withdrawal did not go through.");
      setError(message);
      toast.error("Could not withdraw", { description: message });
    } finally {
      setPending(null);
    }
  }

  async function list() {
    if (!accountId || busy) return;

    const priceUsdc = usdToMicroUsdc(price);
    if (!priceUsdc) {
      setError("Enter a price in US dollars, like 50.00.");
      return;
    }

    setPending("list");
    setError(null);
    try {
      await sign(buildListTransactions(tokenId, priceUsdc));
      await trpc.sonata.wallet.syncListing.mutate({
        accountId,
        tokenId,
        priceUsdc,
      });
      toast.success("Listed for sale", {
        description: `Asking ${formatUsdMicro2(priceUsdc)}.`,
      });
      setPrice("");
      router.refresh();
    } catch (cause) {
      const message = userMessage(cause, "The listing did not go through.");
      setError(message);
      toast.error("Could not list the master", { description: message });
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-col gap-1">
        <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {SONATA_WALLET_NETWORK_LABEL}
        </p>
        <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
          Holder actions
        </h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Signed by{" "}
          <span className="font-mono" title={accountId}>
            {truncateAccountId(accountId)}
          </span>
          . Nothing is written until the wallet transaction resolves.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => void withdraw()}
          disabled={busy}
          aria-busy={pending === "withdraw"}
          className={secondaryButton}
        >
          {pending === "withdraw"
            ? "Confirm in your wallet…"
            : "Withdraw earnings"}
        </button>
        <p className="text-[0.6875rem] leading-4 text-muted-foreground">
          Moves the song account balance to your wallet.
        </p>
      </div>

      {listingPriceUsdc !== null ? (
        <div className="flex flex-col gap-1 rounded-lg bg-fill/60 px-3 py-2.5">
          <span className="text-sm font-medium">
            Already for sale at {formatUsdMicro2(listingPriceUsdc)}
          </span>
          <p className="text-[0.6875rem] leading-4 text-muted-foreground">
            The listing has to sell before the master can be listed again.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`manage-price-${tokenId}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Asking price (USD)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`manage-price-${tokenId}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="50.00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              disabled={busy}
              className="h-(--ctl) w-28 rounded-(--r-ctl) border border-border/60 bg-background px-3 text-sm tabular-nums transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void list()}
              disabled={busy}
              aria-busy={pending === "list"}
              className={primaryButton}
            >
              {pending === "list" ? "Listing…" : "List for resale"}
            </button>
          </div>
          <p className="text-[0.6875rem] leading-4 text-muted-foreground">
            Two signatures: approve the market, then create the listing. The
            song account balance and future earnings go with the sale.
          </p>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
