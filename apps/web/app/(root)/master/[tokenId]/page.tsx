import { formatDuration } from "@infinitunes/types";
import { Badge } from "@infinitunes/ui/components/badge";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ImageWithFallback } from "~/components/image-with-fallback";
import { CopyField } from "~/components/sonata/copy-field";
import { EarningsBars } from "~/components/sonata/earnings-bars";
import { MasterTabs } from "~/components/sonata/master-tabs";
import { PlayMaster } from "~/components/sonata/play-master";
import { Receipt } from "~/components/sonata/receipt";
import { ReceiptRow } from "~/components/sonata/receipt-row";
import { Stat } from "~/components/sonata/stat";
import { pageMetadata } from "~/lib/metadata";
import {
  chartLabels,
  earnings30d,
  earningsSeries,
  formatHours,
  formatUsd,
  masterByToken,
  RATE_PER_HOUR,
} from "~/lib/sonata-demo";

type MasterPageProps = { params: Promise<{ tokenId: string }> };

export async function generateMetadata({
  params,
}: MasterPageProps): Promise<Metadata> {
  const { tokenId } = await params;
  const master = masterByToken(tokenId);
  if (!master)
    return pageMetadata({
      title: "Master not found",
      description: "This master is no longer in the Sonata catalogue.",
      url: "/market",
    });

  return pageMetadata({
    title: `${master.title} by ${master.artistName}`,
    description: master.description,
    url: `/master/${master.tokenId}`,
    image: master.coverUrl,
    square: true,
  });
}

const regions = [
  { name: "United States", share: 38 },
  { name: "Germany", share: 17 },
  { name: "Japan", share: 12 },
  { name: "Brazil", share: 9 },
  { name: "Elsewhere", share: 24 },
];

export default async function MasterPage({ params }: MasterPageProps) {
  const { tokenId } = await params;
  const master = masterByToken(tokenId);
  if (!master) notFound();

  const earnings = earnings30d(master);
  const series = earningsSeries.map(
    (value) => Math.round(value * (earnings / 128.4) * 100) / 100,
  );
  const listed = Boolean(master.priceUsd);
  const annualEstimate = earnings * 12;
  const annualMultiple = master.priceUsd ? annualEstimate / master.priceUsd : 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8">
          <div className="relative aspect-square w-full max-w-60 overflow-hidden rounded-xl bg-fill ring-1 ring-foreground/10 md:max-w-none">
            <ImageWithFallback
              src={master.coverUrl}
              fallback="/images/placeholder/song.jpg"
              alt={`${master.title} cover`}
              width={600}
              height={600}
              sizes="(min-width: 768px) 240px, 60vw"
              priority
              className="size-full object-cover"
            />
          </div>

          <div className="flex min-w-0 flex-col justify-center gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">Master</Badge>
              <Badge variant="outline">1 of 1</Badge>
              <Badge
                variant="outline"
                className="border-primary/40 text-primary"
              >
                {listed ? "For sale" : "Owned by you"}
              </Badge>
            </div>

            <div className="min-w-0">
              <h1 className="font-heading text-3xl leading-tight font-bold tracking-[-0.025em] sm:text-4xl">
                {master.title}
              </h1>
              <p className="mt-1.5 text-base text-muted-foreground">
                {master.artistName}{" "}
                <span className="text-muted-foreground/70">
                  {master.artistHandle}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {formatDuration(master.durationSec, "mm:ss")}
              </span>
              <span
                aria-hidden="true"
                className="size-1 rounded-full bg-border"
              />
              <span className="tabular-nums">{master.releaseYear}</span>
              <span
                aria-hidden="true"
                className="size-1 rounded-full bg-border"
              />
              <span>{master.genre}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <PlayMaster
                tokenId={master.tokenId}
                title={master.title}
                artistName={master.artistName}
                artistHandle={master.artistHandle}
                coverUrl={master.coverUrl}
                audioUrl={master.audioUrl}
                durationSec={master.durationSec}
              />
              <p className="text-sm text-muted-foreground tabular-nums">
                Earns {formatUsd(RATE_PER_HOUR)} per verified hour
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="min-w-0">
          <MasterTabs
            overview={
              <div className="flex flex-col gap-8">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
                  <Stat
                    label="Trailing 30 day earnings"
                    value={formatUsd(earnings)}
                    hint="Paid to the song account"
                  />
                  <Stat
                    label="Verified hours"
                    value={formatHours(master.hours30d)}
                    hint="Trailing 30 days"
                  />
                  <Stat
                    label="Effective rate"
                    value={`${formatUsd(RATE_PER_HOUR)} / hr`}
                    hint="Fixed at publish"
                  />
                  <Stat
                    label="Current owner"
                    value={
                      <span className="font-mono text-sm">
                        {master.ownerHandle}
                      </span>
                    }
                    hint={master.owner}
                  />
                  <Stat
                    label="Creator"
                    value={
                      <span className="font-mono text-sm">
                        {master.artistHandle}
                      </span>
                    }
                    hint="Earns a 5.0% royalty"
                  />
                  <Stat
                    label="Song account balance"
                    value={formatUsd(master.balanceUsd)}
                    hint="Moves with the master"
                  />
                </dl>

                <section className="flex flex-col gap-3">
                  <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                    Earnings, last 30 days
                  </h2>
                  <EarningsBars
                    data={series}
                    labels={chartLabels}
                    summary={`${master.title} earned ${formatUsd(earnings)} over the last 30 days from ${formatHours(master.hours30d)} of verified listening.`}
                  />
                </section>

                <section className="flex max-w-2xl flex-col gap-2 border-t border-border/60 pt-6">
                  <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                    What this means
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Every verified hour of listening pays the song account a
                    fixed {formatUsd(RATE_PER_HOUR)}. The account belongs to
                    whoever owns the master, so the balance and the earnings
                    arrive with the sale. The creator keeps a 5.0% royalty on
                    every payout.
                  </p>
                </section>
              </div>
            }
            ownership={
              <Receipt title="Ownership record" meta="4 events">
                <ReceiptRow
                  title="Master minted"
                  meta="Jan 12, 2026"
                  value="1 of 1"
                  detail={`to ${master.artistHandle}`}
                />
                <ReceiptRow
                  title="First sale"
                  meta="Feb 3, 2026"
                  value={formatUsd(32)}
                  detail={`to ${master.ownerHandle}`}
                />
                <ReceiptRow
                  title="Royalty paid"
                  meta="Oct 26, 2026"
                  value={formatUsd(4.08)}
                  detail="Epoch 6"
                />
                <ReceiptRow
                  title={listed ? "Listed for sale" : "Held by owner"}
                  meta={listed ? "Nov 3, 2026" : "Since Feb 3, 2026"}
                  value={
                    listed ? formatUsd(master.priceUsd ?? 0) : "Not listed"
                  }
                  detail={listed ? "Active listing" : master.ownerHandle}
                />
              </Receipt>
            }
            listeners={
              <div className="flex flex-col gap-8">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
                  <Stat
                    label="Verified hours"
                    value={formatHours(master.hours30d)}
                    hint="Trailing 30 days"
                  />
                  <Stat
                    label="Average session"
                    value="24.6 min"
                    hint="Per listener, per day"
                  />
                  <Stat
                    label="Countries"
                    value="34"
                    hint="Aggregated, no identities"
                  />
                </dl>

                <section className="flex flex-col gap-4">
                  <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                    Where it is heard
                  </h2>
                  <ul className="flex max-w-xl flex-col gap-3">
                    {regions.map((region) => (
                      <li
                        key={region.name}
                        className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm"
                      >
                        <span className="truncate text-muted-foreground">
                          {region.name}
                        </span>
                        <span
                          aria-hidden="true"
                          className="h-1.5 overflow-hidden rounded-full bg-fill"
                        >
                          <span
                            className="block h-full rounded-full bg-primary/70"
                            style={{ width: `${region.share}%` }}
                          />
                        </span>
                        <span className="text-right text-xs text-muted-foreground tabular-nums">
                          {region.share}%
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                    Region totals are aggregated from verified listening hours.
                    Sonata never shows who listened.
                  </p>
                </section>
              </div>
            }
            chain={
              <div className="flex max-w-xl flex-col gap-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  The master is one record in the masters contract. Its song
                  account is where listening earnings collect, and the listen
                  root commits every settled epoch.
                </p>
                <CopyField
                  label="Masters contract"
                  value="masters.sonata.testnet"
                />
                <CopyField label="Token id" value={master.tokenId} />
                <CopyField
                  label="Song account"
                  value={`${master.tokenId}.sonata.testnet`}
                />
                <CopyField
                  label="Listen root"
                  value="0x8a19c4e2b7d0a5f1c9e3b6d84a2f7c0e91ab5d38f2c0"
                />
                <CopyField
                  label="Market contract"
                  value="market.sonata.testnet"
                />
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Testnet deployment. Amounts settle in USDC.
                </p>
              </div>
            }
          />
        </div>

        <aside className="order-first flex min-w-0 flex-col gap-4 lg:order-none lg:sticky lg:top-20">
          {listed ? (
            <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                  Buy this master
                </h2>
                <span className="font-heading text-2xl font-bold tabular-nums">
                  {formatUsd(master.priceUsd ?? 0)}
                </span>
              </div>

              <dl className="flex flex-col gap-2 border-y border-border/60 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Trailing 30 days</dt>
                  <dd className="font-medium tabular-nums">
                    {formatUsd(earnings)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Includes in account</dt>
                  <dd className="font-medium tabular-nums">
                    {formatUsd(master.balanceUsd)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Annual estimate</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {formatUsd(annualEstimate)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {annualMultiple.toFixed(1)}x
                    </span>
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Buy master
              </button>
              <p className="text-xs leading-5 text-muted-foreground">
                Estimate, not a promise. Earnings vary with listening. The
                account balance is included in the price.
              </p>
            </section>
          ) : (
            <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                  You own this master
                </h2>
                <p className="text-xs text-muted-foreground">
                  {master.ownerHandle} · {master.owner}
                </p>
              </div>

              <div className="flex flex-col gap-1 border-y border-border/60 py-3">
                <span className="text-xs text-muted-foreground">
                  Song account balance
                </span>
                <span className="font-heading text-2xl font-bold tabular-nums">
                  {formatUsd(master.balanceUsd)}
                </span>
              </div>

              <button
                type="button"
                className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Withdraw
              </button>
              <button
                type="button"
                className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) border border-border/60 bg-transparent px-4 text-sm font-semibold transition-colors duration-fast hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Sell master
              </button>
              <p className="text-xs leading-5 text-muted-foreground">
                Earnings are paid to the song, not to you personally. Selling
                the master moves the account with it.
              </p>
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-5">
            <h2 className="font-heading text-sm font-semibold tracking-[-0.01em]">
              The rate is fixed
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              {formatUsd(RATE_PER_HOUR)} per verified hour, set when the master
              was published. It does not move with the market.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
