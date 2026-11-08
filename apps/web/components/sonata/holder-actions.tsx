"use client";

import type { DemoRole } from "@infinitunes/near";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { formatUsdMicro2, usdToMicroUsdc } from "~/lib/sonata/market";
import { trpc } from "~/lib/trpc/vanilla";
import { userMessage } from "~/lib/user-message";
import { cn } from "~/lib/utils";

type HolderActionsProps = {
  tokenId: string;
  /** The demo signer for the owner account, or `null` when there is none. */
  role: DemoRole | null;
  /** Active listing price in micro-USDC; `null` when the master is not listed. */
  listingPriceUsdc: string | null;
};

type PendingAction = "list" | "withdraw";

const primaryButton =
  "inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) border border-border/60 bg-transparent px-4 text-sm font-semibold transition-colors duration-fast hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The holder-only write actions. Both mutations are demo-signed on the server;
 * this component only exposes them to the current owner. Without a demo signer
 * for the owner account it renders an explanation instead of dead buttons.
 */
export function HolderActions({
  tokenId,
  role,
  listingPriceUsdc,
}: HolderActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!role) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-5">
        <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
          Holder actions
        </h2>
        <p className="text-xs leading-5 text-muted-foreground">
          No testnet signer is configured for this account, so withdrawal and
          resale are unavailable. The owner record is unchanged.
        </p>
      </section>
    );
  }

  async function run(
    action: PendingAction,
    request: () => Promise<{ txHash: string }>,
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

  function withdraw() {
    if (!role) return;
    void run(
      "withdraw",
      () => trpc.sonata.songs.withdraw.mutate({ role, tokenId }),
      "Earnings withdrawn",
    );
  }

  function list() {
    if (!role) return;
    const priceUsdc = usdToMicroUsdc(price);
    if (!priceUsdc) {
      setError("Enter a price in US dollars, like 50.00.");
      return;
    }

    void run(
      "list",
      () => trpc.sonata.market.list.mutate({ role, tokenId, priceUsdc }),
      "Listed for sale",
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
          Holder actions
        </h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Testnet only. Actions are signed by the account that holds this
          master.
        </p>
      </div>

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
          Moves the song account balance to you.
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
              disabled={pending !== null}
              className="h-(--ctl) w-28 rounded-(--r-ctl) border border-border/60 bg-background px-3 text-sm tabular-nums transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <button
              type="button"
              onClick={list}
              disabled={pending !== null}
              className={cn(primaryButton, "h-(--ctl)")}
            >
              {pending === "list" ? "Listing…" : "List for resale"}
            </button>
          </div>
          <p className="text-[0.6875rem] leading-4 text-muted-foreground">
            The song account balance and future earnings go with the sale.
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
