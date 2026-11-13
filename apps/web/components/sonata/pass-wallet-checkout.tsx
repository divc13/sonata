"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  buildPassTransaction,
  canAffordPass,
  FAUCET_GRANT_USDC_MICRO,
  formatUsdcMicro,
  PASS_PRICE_USDC_MICRO,
  SONATA_WALLET_NETWORK_LABEL,
  WALLET_CONTRACTS,
} from "~/lib/sonata/wallet";
import { trpc } from "~/lib/trpc/vanilla";
import { userMessage } from "~/lib/user-message";

import { useWallet } from "./wallet-provider";

type PassWalletCheckoutProps = {
  accountId: string;
  /** The balance the page read on the server; the live value wins once read. */
  initialBalanceUsdc: string | null;
  /** The cache says the pass has not expired. */
  active: boolean;
};

type Pending = "buy" | "faucet" | null;

/**
 * The wallet checkout: a one-time testnet grant when the balance cannot cover
 * the pass, then a signed `ft_transfer_call` to the platform. The cached pass
 * is synced only after the wallet transaction resolves, and the page refreshes
 * so the status card reads the new expiry.
 */
export function PassWalletCheckout({
  accountId,
  initialBalanceUsdc,
  active,
}: PassWalletCheckoutProps) {
  const router = useRouter();
  const { balanceUsdc, refreshBalance, sign, signing } = useWallet();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  const balance = balanceUsdc ?? initialBalanceUsdc;
  const affordable = canAffordPass(balance);
  const busy = pending !== null || signing;

  async function faucet() {
    if (busy) return;
    setPending("faucet");
    setError(null);

    try {
      const grant = await trpc.sonata.wallet.faucet.mutate({ accountId });
      toast.success(
        `${formatUsdcMicro(grant.amountUsdc)} of testnet USDC added`,
        {
          description: `One-time grant · ${grant.txHash}`,
        },
      );
      await refreshBalance();
      router.refresh();
    } catch (cause) {
      const message = userMessage(
        cause,
        "The faucet could not fund this wallet.",
      );
      setError(message);
      toast.error("Could not get testnet USDC", { description: message });
    } finally {
      setPending(null);
    }
  }

  async function buy() {
    if (active || busy) return;
    setPending("buy");
    setError(null);

    try {
      await sign([buildPassTransaction()]);
      await trpc.sonata.wallet.syncPass.mutate({ accountId });
      toast.success("Pass active for 30 days", {
        description: "Paid with your NEAR testnet wallet.",
      });
      window.dispatchEvent(new CustomEvent("sonata:pass-changed"));
      await refreshBalance();
      router.refresh();
    } catch (cause) {
      const message = userMessage(
        cause,
        "The pass could not be purchased. Please try again.",
      );
      setError(message);
      toast.error("Could not buy the pass", { description: message });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold tracking-[0.08em] uppercase">
          {SONATA_WALLET_NETWORK_LABEL}
        </span>
        <span className="tabular-nums">
          Balance{" "}
          <span className="font-medium text-foreground">
            {balance === null ? "reading…" : formatUsdcMicro(balance)}
          </span>
        </span>
      </div>

      {active ? (
        <button
          type="button"
          disabled
          className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground opacity-70"
        >
          Pass active
        </button>
      ) : (
        <>
          {balance !== null && !affordable ? (
            <button
              type="button"
              onClick={() => void faucet()}
              disabled={busy}
              aria-busy={pending === "faucet"}
              className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
            >
              {pending === "faucet"
                ? "Sending testnet USDC…"
                : `Get ${formatUsdcMicro(FAUCET_GRANT_USDC_MICRO)} testnet USDC`}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void buy()}
            disabled={busy || !affordable}
            aria-busy={pending === "buy"}
            className={
              affordable
                ? "inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                : "inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) border border-border/60 bg-transparent px-4 text-sm font-semibold transition-colors duration-fast hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {pending === "buy"
              ? "Confirm in your wallet…"
              : balance === null
                ? "Reading your balance…"
                : affordable
                  ? `Buy the pass · ${formatUsdcMicro(PASS_PRICE_USDC_MICRO)}`
                  : `Needs ${formatUsdcMicro(PASS_PRICE_USDC_MICRO)} USDC`}
          </button>

          <p className="text-xs leading-5 text-muted-foreground">
            {balance === null
              ? "Reading the USDC balance of your connected wallet."
              : affordable
                ? `Your wallet signs one transfer to ${WALLET_CONTRACTS.platform}. Testnet only; no card is charged.`
                : `The faucet sends ${formatUsdcMicro(FAUCET_GRANT_USDC_MICRO)} once per wallet, enough for the pass and a little extra.`}
          </p>
        </>
      )}

      {error ? (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
