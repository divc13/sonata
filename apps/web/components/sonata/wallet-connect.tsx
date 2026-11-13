"use client";

import { LogOut, Wallet } from "lucide-react";

import {
  SONATA_WALLET_NETWORK_LABEL,
  truncateAccountId,
} from "~/lib/sonata/wallet";
import { cn } from "~/lib/utils";

import { useWallet } from "./wallet-provider";

const pillClassName =
  "inline-flex h-(--ctl) items-center gap-2 rounded-full border border-border/60 bg-card px-3 text-xs font-medium transition-colors duration-fast hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60";

type WalletConnectButtonProps = {
  className?: string;
};

/**
 * The compact wallet control for the toolbar and the sidebar: connect when
 * there is no wallet, otherwise the truncated account, its USDC balance and a
 * disconnect control. Signing never happens here.
 */
export function WalletConnectButton({ className }: WalletConnectButtonProps) {
  const {
    accountId,
    shortAccount,
    balanceLabel,
    connecting,
    connect,
    disconnect,
  } = useWallet();

  if (!accountId) {
    return (
      <button
        type="button"
        onClick={() => void connect()}
        disabled={connecting}
        aria-busy={connecting}
        title="Connect a NEAR testnet wallet"
        className={cn(pillClassName, "shrink-0", className)}
      >
        <Wallet aria-hidden="true" className="size-3.5 text-primary" />
        <span className="hidden sm:inline">
          {connecting ? "Connecting…" : "Connect wallet"}
        </span>
        <span className="sm:hidden">
          {connecting ? "Connecting…" : "Wallet"}
        </span>
      </button>
    );
  }

  return (
    <span
      title={`${SONATA_WALLET_NETWORK_LABEL} · ${accountId}`}
      className={cn(
        "inline-flex h-(--ctl) max-w-full shrink-0 items-center gap-2 rounded-full border border-border/60 bg-card pr-1 pl-3 text-xs font-medium",
        className,
      )}
    >
      <Wallet aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
      <span className="sr-only">{SONATA_WALLET_NETWORK_LABEL}:</span>
      <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">
        {shortAccount ?? truncateAccountId(accountId)}
      </span>
      <span className="shrink-0 text-foreground tabular-nums">
        {balanceLabel}
      </span>
      <button
        type="button"
        onClick={() => void disconnect()}
        aria-label={`Disconnect ${accountId}`}
        title="Disconnect"
        className="inline-grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-fast hover:bg-fill hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <LogOut aria-hidden="true" className="size-3.5" />
      </button>
    </span>
  );
}

type WalletConnectPromptProps = {
  title?: string;
  description?: string;
  /** What this page needs the wallet for, shown as a quiet footnote. */
  note?: string;
  className?: string;
};

/**
 * The page-level "connect a wallet" card. Pages render it when the wallet
 * cookie is absent; connecting writes the cookie, refreshes and the server
 * renders the real content.
 */
export function WalletConnectPrompt({
  title = "Connect a NEAR testnet wallet",
  description = "Your wallet is the only identity Sonata needs. There is no email sign-in and no card.",
  note,
  className,
}: WalletConnectPromptProps) {
  const { accountId, connecting, connect } = useWallet();

  return (
    <section
      aria-label="Connect a wallet"
      className={cn(
        "flex max-w-xl flex-col items-start gap-4 rounded-2xl border border-border/60 bg-card p-5 sm:p-6",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-fill text-primary">
        <Wallet aria-hidden="true" className="size-5" />
      </span>

      <div className="flex flex-col gap-1.5">
        <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {SONATA_WALLET_NETWORK_LABEL}
        </p>
        <h2 className="font-heading text-xl leading-7 font-bold tracking-[-0.015em]">
          {title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      <button
        type="button"
        onClick={() => void connect()}
        disabled={connecting || accountId !== null}
        aria-busy={connecting}
        className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-70"
      >
        {connecting
          ? "Opening your wallet…"
          : accountId
            ? "Wallet connected"
            : "Connect wallet"}
      </button>

      <p className="text-xs leading-5 text-muted-foreground">
        {accountId
          ? "Loading this page for your wallet…"
          : (note ??
            "Testnet only. Get testnet USDC from the faucet on the pass page.")}
      </p>
    </section>
  );
}
