import { Check } from "lucide-react";
import Link from "next/link";

import { Receipt } from "~/components/sonata/receipt";
import { ReceiptRow } from "~/components/sonata/receipt-row";
import { WalletChip } from "~/components/sonata/wallet-chip";
import { pageMetadata } from "~/lib/metadata";
import { asRoute } from "~/lib/utils";

export const metadata = pageMetadata({
  title: "The Sonata pass",
  description: "Get 30 days of everything for $5.",
  url: "/pass",
});

const included = [
  "Every master in the catalogue",
  "Unlimited listening, no per song unlocks",
  "Earnings go straight to the song accounts",
  "No auto-renew, no stored card",
];

export default function PassPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 py-4 sm:py-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          The pass
        </p>
        <h1 className="font-heading text-3xl leading-tight font-bold tracking-[-0.025em] sm:text-4xl">
          Thirty days of everything
        </h1>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          One pass covers every master on Sonata. Listening pays the artists,
          quietly and by the hour.
        </p>
      </header>

      <section className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-5xl leading-none font-bold tracking-[-0.03em] tabular-nums">
            $5
          </span>
          <span className="text-sm text-muted-foreground">/ 30 days</span>
        </div>

        <ul className="flex flex-col gap-2.5 border-y border-border/60 py-5">
          {included.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm">
              <Check
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Payment</span>
          <span className="font-medium">USDC</span>
        </div>

        <button
          type="button"
          className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Get 30 days
        </button>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          Wallet connection and payment arrive with the live chain. A single
          network fee applies.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
              Pass active
            </h2>
            <p className="text-sm text-muted-foreground">
              23 days left. Expires December 1, 2026.
            </p>
          </div>
          <WalletChip address="nadia-sonata.testnet" balance="$12.40" />
        </div>

        <Receipt title="Receipt" meta="Nov 1, 2026">
          <ReceiptRow title="Sonata pass" meta="30 days" value="$5.00" />
          <ReceiptRow
            title="Paid in USDC"
            meta="Testnet"
            value="$5.00"
            detail="Confirmed"
          />
          <ReceiptRow
            title="Network fee"
            meta="One transaction"
            value="$0.01"
          />
        </Receipt>

        <Link
          href={asRoute("/")}
          className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) border border-border/60 bg-transparent px-4 text-sm font-semibold transition-colors duration-fast hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Start listening
        </Link>
      </section>
    </div>
  );
}
