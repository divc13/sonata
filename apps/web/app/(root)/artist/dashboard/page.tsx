import { Badge } from "@infinitunes/ui/components/badge";
import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";

import { ImageWithFallback } from "~/components/image-with-fallback";
import { DashboardRange } from "~/components/sonata/dashboard-range";
import { EarningsBars } from "~/components/sonata/earnings-bars";
import { Receipt } from "~/components/sonata/receipt";
import { ReceiptRow } from "~/components/sonata/receipt-row";
import { pageMetadata } from "~/lib/metadata";
import {
  chartLabels,
  earnings30d,
  earningsSeries,
  formatHours,
  formatUsd,
  masterHref,
  nadiaMasters,
  nadiaPayouts,
  RATE_PER_HOUR,
} from "~/lib/sonata-demo";

export const metadata = pageMetadata({
  title: "Your masters",
  description:
    "Earnings, balances, and payouts for the masters you have published.",
  url: "/artist/dashboard",
});

const LIFETIME_PAID = 1842.6;

export default function ArtistDashboardPage() {
  const totalEarnings = nadiaMasters.reduce(
    (sum, master) => sum + earnings30d(master),
    0,
  );
  const available = nadiaMasters.reduce(
    (sum, master) => sum + master.balanceUsd,
    0,
  );
  const totalHours = nadiaMasters.reduce(
    (sum, master) => sum + master.hours30d,
    0,
  );
  const baseTotal = earningsSeries.reduce((sum, value) => sum + value, 0);
  const series = earningsSeries.map(
    (value) => Math.round(value * (totalEarnings / baseTotal) * 100) / 100,
  );

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Creator
          </p>
          <h1 className="font-heading text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            Your masters
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Every verified hour pays the song account, and the account belongs
            to you.{" "}
            <Link
              href="/audit"
              className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              How the money works
            </Link>
            .
          </p>
        </div>

        <button
          type="button"
          className="inline-flex h-(--ctl-lg) items-center gap-2 rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Plus aria-hidden="true" className="size-4" />
          Publish a master
        </button>
      </header>

      <dl className="grid gap-6 border-y border-border/60 py-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Total earnings, 30 days
          </dt>
          <dd className="font-heading text-2xl leading-8 font-semibold tracking-[-0.015em] tabular-nums">
            {formatUsd(totalEarnings)}
          </dd>
          <p className="text-xs text-muted-foreground">
            From {formatHours(totalHours)} of listening
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Available to withdraw
          </dt>
          <dd className="font-heading text-2xl leading-8 font-semibold tracking-[-0.015em] tabular-nums">
            {formatUsd(available)}
          </dd>
          <p className="text-xs text-muted-foreground">
            Across {nadiaMasters.length} song accounts
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Lifetime paid
          </dt>
          <dd className="font-heading text-2xl leading-8 font-semibold tracking-[-0.015em] tabular-nums">
            {formatUsd(LIFETIME_PAID)}
          </dd>
          <p className="text-xs text-muted-foreground">Since January 2026</p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Fixed rate
          </dt>
          <dd className="font-heading text-2xl leading-8 font-semibold tracking-[-0.015em] tabular-nums">
            {formatUsd(RATE_PER_HOUR)}
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              / hr
            </span>
          </dd>
          <p className="text-xs text-muted-foreground">
            Set at publish, never adjusted
          </p>
        </div>
      </dl>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
              Earnings
            </h2>
            <p className="text-sm text-muted-foreground">
              Paid to your song accounts every epoch.
            </p>
          </div>
          <DashboardRange />
        </div>
        <EarningsBars
          data={series}
          labels={chartLabels}
          summary={`Your masters earned ${formatUsd(totalEarnings)} in the last 30 days.`}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
            Masters
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {nadiaMasters.length} published
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">
                  Master
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Owner
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  30d earnings
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Balance
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {nadiaMasters.map((master) => {
                const listed = Boolean(master.priceUsd);

                return (
                  <tr key={master.tokenId} className="group">
                    <th
                      scope="row"
                      aria-label={`${master.title} by ${master.artistName}`}
                      className="px-4 py-3 text-left font-normal"
                    >
                      <Link
                        href={masterHref(master.tokenId)}
                        className="flex min-w-0 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-fill ring-1 ring-foreground/10">
                          <ImageWithFallback
                            src={master.coverUrl}
                            fallback="/images/placeholder/song.jpg"
                            alt=""
                            width={80}
                            height={80}
                            className="size-full object-cover"
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {master.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {formatHours(master.hours30d)}
                          </span>
                        </span>
                      </Link>
                    </th>
                    <td className="px-3 py-3 text-muted-foreground">
                      <span className="font-mono text-xs">
                        {master.ownerHandle}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-primary tabular-nums">
                      {formatUsd(earnings30d(master))}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatUsd(master.balanceUsd)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant="outline"
                        className={
                          listed ? "border-primary/40 text-primary" : undefined
                        }
                      >
                        {listed ? "Listed" : "Held"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {listed ? (
                        <Link
                          href="/market"
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          View listing
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
            Payout history
          </h2>
          <p className="text-sm text-muted-foreground">
            Each epoch settles the hours listened and pays every song account
            once.
          </p>
        </div>
        <Receipt title="Recent payouts" meta="Last 3 settled epochs">
          {nadiaPayouts.map((payout) => (
            <ReceiptRow
              key={payout.epoch}
              title={`Epoch ${payout.epoch}`}
              meta={`${payout.date} · ${formatHours(payout.hours)}`}
              value={formatUsd(payout.total)}
              detail={
                payout.status === "paid"
                  ? "Paid in USDC"
                  : "Accruing, settles Nov 9"
              }
            />
          ))}
        </Receipt>
      </section>
    </div>
  );
}
