"use client";

import type { ChainResult } from "@infinitunes/near";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  demoRoleForOwner,
  formatUsdMicro2,
  usdToMicroUsdc,
} from "~/lib/sonata/market";
import { trpc } from "~/lib/trpc/vanilla";
import { userMessage } from "~/lib/user-message";
import { cn } from "~/lib/utils";

type MasterActionsProps = {
  tokenId: string;
  ownerAccountId: string;
  /** Active listing price in micro-USDC; `null` when the master is not listed. */
  listingPriceUsdc: string | null;
};

type PendingAction = "buy" | "list" | "withdraw";

const primaryButton =
  "inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) border border-border/60 bg-transparent px-4 text-sm font-semibold transition-colors duration-fast hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

const BUYER_ACCOUNT = "collector.sonata.testnet";

/**
 * Demo-gated write actions for one master. This is the only surface that names
 * demo roles and account ids; the rest of the page stays product copy.
 */
export function MasterActions({
  tokenId,
  ownerAccountId,
  listingPriceUsdc,
}: MasterActionsProps) {
  const router = useRouter();
  const ownerRole = demoRoleForOwner(ownerAccountId);
  const canBuy = listingPriceUsdc !== null;
  const canList = ownerRole === "nadia" && !canBuy;
  const canWithdraw = ownerRole !== null;

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!canBuy && !canWithdraw) return null;

  async function run(
    action: PendingAction,
    request: () => Promise<ChainResult>,
    successTitle: string,
  ) {
    if (pending) return;
    setPending(action);
    setError(null);

    try {
      const result = await request();
      toast.success(successTitle, { description: result.txHash });
      router.refresh();
    } catch (cause) {
      const message = userMessage(cause);
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  function buy() {
    if (!listingPriceUsdc) return;
    void run(
      "buy",
      () =>
        trpc.sonata.market.buy.mutate({
          role: "collector",
          tokenId,
          expectedPriceUsdc: listingPriceUsdc,
        }),
      "Master bought",
    );
  }

  function withdraw() {
    if (!ownerRole) return;
    void run(
      "withdraw",
      () => trpc.sonata.songs.withdraw.mutate({ role: ownerRole, tokenId }),
      "Earnings withdrawn",
    );
  }

  function list() {
    const priceUsdc = usdToMicroUsdc(price);
    if (!priceUsdc) {
      setError("Enter a price in US dollars, like 50.00.");
      return;
    }
    if (!ownerRole) return;

    void run(
      "list",
      () =>
        trpc.sonata.market.list.mutate({
          role: ownerRole,
          tokenId,
          priceUsdc,
        }),
      "Listed for sale",
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
          Manage actions
        </h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Executed on NEAR testnet.
        </p>
      </div>

      {canBuy ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={buy}
            disabled={pending !== null}
            className={primaryButton}
          >
            {pending === "buy"
              ? "Buying…"
              : `Buy for ${formatUsdMicro2(listingPriceUsdc)}`}
          </button>
          <p className="text-[0.6875rem] leading-4 text-muted-foreground">
            Buys as <span className="font-mono">collector</span>{" "}
            <span className="font-mono">{BUYER_ACCOUNT}</span>
          </p>
        </div>
      ) : null}

      {canList ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`list-price-${tokenId}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Asking price (USD)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`list-price-${tokenId}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="50.00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              disabled={pending !== null}
              className="h-(--ctl) w-28 rounded-(--r-ctl) border border-border/60 bg-background px-3 text-sm tabular-nums transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <button
              type="button"
              onClick={list}
              disabled={pending !== null}
              className={cn(primaryButton, "h-(--ctl)")}
            >
              {pending === "list" ? "Listing…" : "List for sale"}
            </button>
          </div>
          <p className="text-[0.6875rem] leading-4 text-muted-foreground">
            Lists as <span className="font-mono">nadia</span>{" "}
            <span className="font-mono">{ownerAccountId}</span>
          </p>
        </div>
      ) : null}

      {canWithdraw ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={withdraw}
            disabled={pending !== null}
            className={secondaryButton}
          >
            {pending === "withdraw" ? "Withdrawing…" : "Withdraw earnings"}
          </button>
          <p className="text-[0.6875rem] leading-4 text-muted-foreground">
            Withdraws as <span className="font-mono">{ownerRole}</span>{" "}
            <span className="font-mono">{ownerAccountId}</span>
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
