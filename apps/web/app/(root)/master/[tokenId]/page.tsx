import {
  CONTRACT_IDS,
  formatHours,
  shortAccount,
  RATE_PER_HOUR_USDC_MICRO,
} from "@infinitunes/near";
import { formatDuration } from "@infinitunes/types";
import { Badge } from "@infinitunes/ui/components/badge";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ImageWithFallback } from "~/components/image-with-fallback";
import { CopyField } from "~/components/sonata/copy-field";
import { EarningsBars } from "~/components/sonata/earnings-bars";
import { MasterActions } from "~/components/sonata/master-actions";
import { MasterTabs } from "~/components/sonata/master-tabs";
import { PlayMaster } from "~/components/sonata/play-master";
import { Receipt } from "~/components/sonata/receipt";
import { ReceiptRow } from "~/components/sonata/receipt-row";
import { Stat } from "~/components/sonata/stat";
import { getErrorCode } from "~/lib/error-code";
import { pageMetadata } from "~/lib/metadata";
import { readSongAccountBalance } from "~/lib/sonata/balances";
import {
  formatIncludedBalance,
  formatUsdMicro2,
  selectListingForToken,
} from "~/lib/sonata/market";
import { api } from "~/lib/trpc/server";

type MasterPageProps = { params: Promise<{ tokenId: string }> };

/** Shared by `generateMetadata` and the page body (one read per request). */
const getMaster = cache(async (tokenId: string) => {
  try {
    return await api.sonata.songs.byId({ tokenId });
  } catch (error) {
    if (getErrorCode(error) === "NOT_FOUND") return null;
    throw error;
  }
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatDate = (value: Date) => dateFormat.format(value);

export async function generateMetadata({
  params,
}: MasterPageProps): Promise<Metadata> {
  const { tokenId } = await params;
  const master = await getMaster(tokenId);

  if (!master) {
    return pageMetadata({
      title: "Master not found",
      description: "This master is no longer in the Sonata catalogue.",
      url: "/market",
    });
  }

  return pageMetadata({
    title: `${master.title} by ${master.artistName}`,
    description:
      master.description ??
      `${master.artistName}'s master, its song account and its verified earnings.`,
    url: `/master/${master.tokenId}`,
    image: master.coverUrl,
    square: true,
  });
}

export default async function MasterPage({ params }: MasterPageProps) {
  const { tokenId } = await params;
  const [master, listingRow] = await Promise.all([
    getMaster(tokenId),
    api.sonata.market.listingByToken({ tokenId }),
  ]);

  if (!master) notFound();

  const songBalanceMicro = await readSongAccountBalance(master.subAccount);
  const included = formatIncludedBalance(songBalanceMicro);

  const listing = selectListingForToken(listingRow, master.tokenId);
  const listed = listing !== null;
  const earningsMicro = master.earnings30dUsdc;
  const annualEstimateMicro = (BigInt(earningsMicro) * 12n).toString();
  const annualMultiple =
    listing && BigInt(listing.priceUsdc) > 0n
      ? Number(annualEstimateMicro) / Number(listing.priceUsdc)
      : 0;

  const payouts = master.recentPayouts;
  const payoutSeries = [...payouts].reverse();
  const payoutData = payoutSeries.map(
    (payout) => Number(payout.amountUsdc) / 1_000_000,
  );
  const labelIndexes = new Set([
    0,
    Math.floor((payoutSeries.length - 1) / 2),
    payoutSeries.length - 1,
  ]);
  const payoutLabels = [...labelIndexes]
    .filter((index) => index >= 0 && index < payoutSeries.length)
    .map((index) => `E${payoutSeries[index].epochId}`);

  const recentSeconds = payouts.reduce(
    (total, payout) => total + payout.seconds,
    0,
  );
  const recentTotalMicro = payouts
    .reduce((total, payout) => total + BigInt(payout.amountUsdc), 0n)
    .toString();
  const averagePayoutMicro =
    payouts.length > 0
      ? (BigInt(recentTotalMicro) / BigInt(payouts.length)).toString()
      : "0";

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
                {listed ? "For sale" : "Not for sale"}
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
                Earns {formatUsdMicro2(RATE_PER_HOUR_USDC_MICRO)} per verified
                hour
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
                    value={formatUsdMicro2(earningsMicro)}
                    hint="Paid to the song account"
                  />
                  <Stat
                    label="Recent verified hours"
                    value={formatHours(recentSeconds)}
                    hint={`${payouts.length} settled ${payouts.length === 1 ? "epoch" : "epochs"}`}
                  />
                  <Stat
                    label="Effective rate"
                    value={`${formatUsdMicro2(RATE_PER_HOUR_USDC_MICRO)} / hr`}
                    hint="Fixed at publish"
                  />
                  <Stat
                    label="Current owner"
                    value={
                      <span className="font-mono text-sm">
                        {shortAccount(master.ownerAccountId)}
                      </span>
                    }
                    hint={master.ownerAccountId}
                  />
                  <Stat
                    label="Creator"
                    value={
                      <span className="font-mono text-sm">
                        {master.artistHandle}
                      </span>
                    }
                    hint={`${master.artistName} · 5.0% royalty`}
                  />
                  <Stat
                    label="Song account"
                    value={
                      <span className="font-mono text-sm">
                        {shortAccount(master.subAccount)}
                      </span>
                    }
                    hint="Moves with the master"
                  />
                </dl>

                <section className="flex flex-col gap-3">
                  <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                    Earnings by settled epoch
                  </h2>
                  {payoutData.length > 0 ? (
                    <EarningsBars
                      data={payoutData}
                      labels={payoutLabels}
                      summary={`${master.title} earned ${formatUsdMicro2(recentTotalMicro)} across ${payouts.length} recent ${payouts.length === 1 ? "payout" : "payouts"}.`}
                    />
                  ) : (
                    <p className="text-sm leading-6 text-muted-foreground">
                      No settled payouts yet. Earnings appear here after the
                      first epoch closes.
                    </p>
                  )}
                </section>

                <section className="flex max-w-2xl flex-col gap-2 border-t border-border/60 pt-6">
                  <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                    What this means
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Every verified hour of listening pays the song account a
                    fixed {formatUsdMicro2(RATE_PER_HOUR_USDC_MICRO)}. The
                    account belongs to whoever owns the master, so its balance
                    and the earnings arrive with the sale. The creator keeps a
                    5.0% royalty on every payout.
                  </p>
                </section>
              </div>
            }
            ownership={
              <div className="flex flex-col gap-6">
                <Receipt title="Ownership record">
                  <ReceiptRow
                    title="Master minted"
                    meta={formatDate(master.createdAt)}
                    value="1 of 1"
                    detail={`to ${master.artistHandle}`}
                  />
                  <ReceiptRow
                    title="Current owner"
                    meta={master.ownerAccountId}
                    value={shortAccount(master.ownerAccountId)}
                    detail={master.subAccount}
                  />
                  <ReceiptRow
                    title={listed ? "Listed for sale" : "Held by owner"}
                    meta={
                      listing
                        ? formatDate(listing.createdAt)
                        : "No active listing"
                    }
                    value={
                      listing
                        ? formatUsdMicro2(listing.priceUsdc)
                        : "Not listed"
                    }
                    detail={
                      listing
                        ? `Seller ${shortAccount(listing.sellerAccountId)}`
                        : master.artistHandle
                    }
                  />
                </Receipt>

                <Receipt
                  title="Recent payouts"
                  meta={
                    payouts.length > 0
                      ? `${payouts.length} settled`
                      : "Nothing yet"
                  }
                >
                  {payouts.length > 0 ? (
                    payouts.map((payout) => (
                      <ReceiptRow
                        key={payout.epochId}
                        title={`Epoch ${payout.epochId}`}
                        meta={formatDate(payout.createdAt)}
                        value={formatUsdMicro2(payout.amountUsdc)}
                        detail={`${formatHours(payout.seconds)} verified`}
                      />
                    ))
                  ) : (
                    <ReceiptRow
                      title="No payouts yet"
                      meta="Settles after the first closed epoch"
                    />
                  )}
                </Receipt>
              </div>
            }
            listeners={
              <div className="flex flex-col gap-8">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
                  <Stat
                    label="Recent verified hours"
                    value={formatHours(recentSeconds)}
                    hint={`Across ${payouts.length} settled ${payouts.length === 1 ? "epoch" : "epochs"}`}
                  />
                  <Stat
                    label="Recent payouts"
                    value={payouts.length.toString()}
                    hint="Settled epochs"
                  />
                  <Stat
                    label="Average payout"
                    value={
                      payouts.length > 0
                        ? formatUsdMicro2(averagePayoutMicro)
                        : "—"
                    }
                    hint="Per settled epoch"
                  />
                </dl>

                <section className="flex max-w-xl flex-col gap-2">
                  <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                    Listener detail
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Region and session detail is not part of the market feed
                    yet. Every payout above comes from verified listening hours.
                  </p>
                </section>
              </div>
            }
            chain={
              <div className="flex max-w-xl flex-col gap-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  The master is one record in the masters contract. Its song
                  account is where listening earnings collect, and the market
                  holds the active resale listing.
                </p>
                <CopyField
                  label="Masters contract"
                  value={CONTRACT_IDS.masters}
                />
                <CopyField label="Token id" value={master.tokenId} />
                <CopyField label="Song account" value={master.subAccount} />
                <CopyField
                  label="Owner account"
                  value={master.ownerAccountId}
                />
                <CopyField
                  label="Creator account"
                  value={master.creatorAccountId}
                />
                <CopyField
                  label="Market contract"
                  value={CONTRACT_IDS.market}
                />
                {listing?.txHash ? (
                  <CopyField
                    label="Listing transaction"
                    value={listing.txHash}
                  />
                ) : null}
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Testnet deployment. Amounts settle in USDC.
                </p>
              </div>
            }
          />
        </div>

        <aside className="order-first flex min-w-0 flex-col gap-4 lg:order-none lg:sticky lg:top-20">
          {listing ? (
            <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                  Buy this master
                </h2>
                <span className="font-heading text-2xl font-bold tabular-nums">
                  {formatUsdMicro2(listing.priceUsdc)}
                </span>
              </div>

              <div className="flex flex-col gap-1 rounded-lg bg-fill/60 px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">Includes</span>
                  <span className="font-heading text-base font-semibold tabular-nums">
                    {included ?? "—"}
                  </span>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {included
                    ? "Read from the song account"
                    : "The song account balance is unavailable right now."}
                </p>
              </div>

              <dl className="flex flex-col gap-2 border-y border-border/60 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Trailing 30 days</dt>
                  <dd className="font-medium tabular-nums">
                    {formatUsdMicro2(earningsMicro)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">
                    Recent verified hours
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {formatHours(recentSeconds)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Annual estimate</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {formatUsdMicro2(annualEstimateMicro)}
                    {annualMultiple > 0 ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {annualMultiple.toFixed(1)}x
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>

              <p className="text-xs leading-5 text-muted-foreground">
                Estimate, not a promise. Earnings vary with listening. The song
                account moves with the master.
              </p>
            </section>
          ) : (
            <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5">
              <div className="flex flex-col gap-1">
                <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
                  Not for sale
                </h2>
                <p className="text-xs text-muted-foreground">
                  Held by {shortAccount(master.ownerAccountId)}
                </p>
              </div>

              <div className="flex flex-col gap-1 border-y border-border/60 py-3">
                <span className="text-xs text-muted-foreground">
                  Trailing 30 day earnings
                </span>
                <span className="font-heading text-2xl font-bold tabular-nums">
                  {formatUsdMicro2(earningsMicro)}
                </span>
              </div>

              <p className="text-xs leading-5 text-muted-foreground">
                Earnings are paid to the song, not to the owner personally.
                Selling the master moves the account with it.
              </p>
            </section>
          )}

          <MasterActions
            tokenId={master.tokenId}
            ownerAccountId={master.ownerAccountId}
            listingPriceUsdc={listing?.priceUsdc ?? null}
          />

          <section className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-5">
            <h2 className="font-heading text-sm font-semibold tracking-[-0.01em]">
              The rate is fixed
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              {formatUsdMicro2(RATE_PER_HOUR_USDC_MICRO)} per verified hour, set
              when the master was published. It does not move with the market.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
