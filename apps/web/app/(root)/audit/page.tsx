import { RATE_PER_HOUR_USDC_MICRO } from "@infinitunes/near";
import Link from "next/link";
import { Suspense } from "react";

import { Receipt } from "~/components/sonata/receipt";
import { ReceiptRow } from "~/components/sonata/receipt-row";
import { SettleEpochAction } from "~/components/sonata/settle-epoch-action";
import { pageMetadata } from "~/lib/metadata";
import {
  formatEpochDate,
  formatEpochLabel,
  formatEpochRange,
  formatListenHours,
  formatMicroUsd,
  formatRatePerHour,
  nextEpochId,
  payoutsToReceipts,
  shortHash,
  sumMicro,
} from "~/lib/sonata-display";
import { formatUsdMicro2 } from "~/lib/sonata/market";
import { api } from "~/lib/trpc/server";
import { cn } from "~/lib/utils";

export const metadata = pageMetadata({
  title: "How the money works",
  description:
    "Every epoch, verified listening hours are settled against the platform reserve and paid to song accounts.",
  url: "/audit",
});

async function AuditContent() {
  const [overview, epochs, songs] = await Promise.all([
    api.sonata.stats.overview(),
    api.sonata.epochs.list({ limit: 100 }),
    api.sonata.songs.list({ limit: 100 }),
  ]);

  /* `epochs.list` is newest settlement first, which is the chain's next-to-
   * settle history; seeded demo epochs (negative ids) sit behind it. */
  const latest = epochs[0];
  const detail = latest
    ? await api.sonata.epochs.byId({ id: latest.id })
    : null;
  const titles = new Map(songs.map((song) => [song.tokenId, song.title]));
  const nextId = nextEpochId(epochs);
  const totalSeconds = epochs.reduce(
    (sum, epoch) => sum + epoch.totalSeconds,
    0,
  );
  const totalPaid = sumMicro(epochs.map((epoch) => epoch.totalPaidUsdc));
  const totalPayouts = epochs.reduce(
    (sum, epoch) => sum + epoch.entriesCount,
    0,
  );

  const stats = [
    {
      label: "Total paid",
      value: formatUsdMicro2(overview.totalPaidUsdc),
      hint: "Across every settled epoch",
    },
    {
      label: "Verified listening",
      value: formatListenHours(overview.totalSeconds),
      hint: "Aggregate, never per listener",
    },
    {
      label: "Masters",
      value: overview.songsCount.toLocaleString("en-US"),
      hint: "Each with a song account",
    },
    {
      label: "Active listings",
      value: overview.activeListings.toLocaleString("en-US"),
      hint: "For sale on the market",
    },
    {
      label: "Settled epochs",
      value: epochs.length.toLocaleString("en-US"),
      hint:
        epochs.length === 1 ? "One settlement window" : "Settlement windows",
    },
    {
      label: "Next epoch",
      value: `Epoch ${nextId}`,
      hint: latest
        ? `Last settled ${formatEpochDate(latest.closedAt)}`
        : "Nothing settled yet",
    },
  ];

  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-7 border-y border-border/60 py-6 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">
              {stat.label}
            </dt>
            <dd className="font-heading text-xl leading-7 font-semibold tracking-[-0.015em] tabular-nums">
              {stat.value}
            </dd>
            <p className="text-xs text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="max-w-2xl">
            <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
              Settled history
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Seeded demo history, shown as Demo 1–Demo 8. Real contract
              settlements begin at epoch 0 and are listed alongside it.
            </p>
          </div>
          <SettleEpochAction nextEpochId={nextId} />
        </div>

        {epochs.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
            No epochs have settled yet. The first settlement will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Epoch
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Dates
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Hours
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Effective rate
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Total paid
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Mode
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Proof
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {epochs.map((epoch) => (
                  <tr key={epoch.id}>
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      <span className="tabular-nums">
                        {formatEpochLabel(epoch.id)}
                      </span>
                      {epoch.id === latest?.id ? (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-primary uppercase">
                          Latest
                        </span>
                      ) : null}
                    </th>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatEpochRange(epoch)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatListenHours(epoch.totalSeconds)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatRatePerHour(epoch.effectiveRatePerHour)}
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {formatUsdMicro2(epoch.totalPaidUsdc)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border border-border/60 px-2 py-0.5 text-[0.6875rem]",
                          epoch.mode === "constant"
                            ? "text-muted-foreground"
                            : "text-foreground",
                        )}
                      >
                        {epoch.mode}
                      </span>
                    </td>
                    <td
                      aria-label={`Root ${epoch.listenRoot}, transaction ${epoch.txHash ?? "recorded off chain"}`}
                      className="px-4 py-3"
                    >
                      <div className="flex flex-col gap-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                        <span title={epoch.listenRoot}>
                          root {shortHash(epoch.listenRoot)}
                        </span>
                        <span title={epoch.txHash ?? undefined}>
                          tx{" "}
                          {epoch.txHash
                            ? shortHash(epoch.txHash)
                            : "recorded off chain"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60 text-xs text-muted-foreground">
                  <td colSpan={2} className="px-4 py-3">
                    {epochs.length} epochs · {totalPayouts} payouts
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatListenHours(totalSeconds)}
                  </td>
                  <td className="px-3 py-3 text-right text-muted-foreground">
                    —
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-foreground tabular-nums">
                    {formatUsdMicro2(totalPaid)}
                  </td>
                  <td colSpan={2} className="px-4 py-3 text-muted-foreground">
                    {latest
                      ? `Epoch ${nextId} settles next`
                      : "No settlement yet"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          A constant epoch pays the fixed rate. A pro-rata epoch splits a
          smaller reserve across the hours listened, and the effective rate is
          shown rather than hidden. Proofs are published with every settlement.
        </p>
        <p className="text-xs text-muted-foreground">
          Hours are aggregate. Sonata never publishes who listened.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
            Latest epoch payouts
          </h2>
          <p className="text-sm text-muted-foreground">
            Every song account paid once, read from the settled ledger.
          </p>
        </div>
        {detail ? (
          <Receipt
            title={formatEpochLabel(detail.id)}
            meta={`${detail.payouts.length} song accounts · ${formatListenHours(detail.totalSeconds)}`}
          >
            {payoutsToReceipts(detail.payouts, titles).map((receipt) => (
              <ReceiptRow
                key={receipt.key}
                title={receipt.title}
                meta={`${formatListenHours(receipt.seconds)} · ${receipt.tokenId}`}
                value={formatMicroUsd(receipt.amountUsdc)}
                detail={
                  receipt.txHash
                    ? `tx ${shortHash(receipt.txHash)}`
                    : "Recorded in the ledger"
                }
              />
            ))}
          </Receipt>
        ) : (
          <p className="rounded-xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
            The first epoch payout will appear here.
          </p>
        )}
      </section>
    </>
  );
}

function AuditSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-10">
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-y border-border/60 py-6 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="h-3 w-20 rounded-full bg-fill" />
            <div className="h-6 w-24 rounded-md bg-fill" />
            <div className="h-3 w-28 rounded-full bg-fill" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-xl bg-fill/60" />
      <div className="h-48 rounded-xl bg-fill/60" />
    </div>
  );
}

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex max-w-2xl min-w-0 flex-col gap-2">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Audit
          </p>
          <h1 className="font-heading text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
            How the money works
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Listening is measured in verified hours. Each epoch, the platform
            pays a fixed {formatRatePerHour(RATE_PER_HOUR_USDC_MICRO)} from its
            reserve, and every song account is paid once. Nothing is hidden
            behind a dashboard.{" "}
            <Link
              href="/artist/dashboard"
              className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              See an artist&apos;s masters
            </Link>
            .
          </p>
        </div>
      </header>

      <Suspense fallback={<AuditSkeleton />}>
        <AuditContent />
      </Suspense>
    </div>
  );
}
