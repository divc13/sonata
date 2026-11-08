import { RATE_PER_HOUR_USDC_MICRO } from "@infinitunes/near";
import Link from "next/link";
import { Suspense } from "react";

import { ImageWithFallback } from "~/components/image-with-fallback";
import { DashboardRange } from "~/components/sonata/dashboard-range";
import { EarningsBars } from "~/components/sonata/earnings-bars";
import { Receipt } from "~/components/sonata/receipt";
import { ReceiptRow } from "~/components/sonata/receipt-row";
import { WithdrawAction } from "~/components/sonata/withdraw-action";
import { getErrorCode } from "~/lib/error-code";
import { pageMetadata } from "~/lib/metadata";
import { masterHref } from "~/lib/sonata-demo";
import {
  earningsByEpoch,
  epochAxisLabel,
  formatEpochLabel,
  formatListenHours,
  formatRatePerHour,
  sumMicro,
} from "~/lib/sonata-display";
import { readSongAccountBalances } from "~/lib/sonata/balances";
import { formatBalanceMicro, formatUsdMicro2 } from "~/lib/sonata/market";
import { api } from "~/lib/trpc/server";

export const metadata = pageMetadata({
  title: "Your masters",
  description:
    "Earnings, balances, and payouts for the masters you have published.",
  url: "/artist/dashboard",
});

/** The seeded demo artist; the dashboard is not tied to a signed-in account. */
const ARTIST_HANDLE = "nadia";

async function loadArtist() {
  try {
    return await api.sonata.artist.byHandle({ handle: ARTIST_HANDLE });
  } catch (error) {
    /* A missing seed is an empty dashboard, not a broken page. */
    if (getErrorCode(error) === "NOT_FOUND") return null;
    throw error;
  }
}

async function DashboardContent() {
  const artist = await loadArtist();

  if (!artist) {
    return (
      <section className="flex max-w-xl flex-col items-start gap-3 rounded-xl border border-border/60 bg-card p-6">
        <h2 className="font-heading text-xl font-bold tracking-[-0.015em]">
          No masters published yet
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Publish a recording and its song account starts earning from the first
          verified hour.
        </p>
      </section>
    );
  }

  const details = await Promise.all(
    artist.songs.map((song) =>
      api.sonata.songs.byId({ tokenId: song.tokenId }),
    ),
  );
  // One parallel read per song account; a failed read stays `null` and shows `—`
  // in that row instead of breaking the page.
  const balances = await readSongAccountBalances(
    artist.songs.map((song) => song.subAccount),
  );
  const tokenIds = new Set(artist.songs.map((song) => song.tokenId));
  const recentPayouts = details.flatMap((detail) => detail.recentPayouts);
  const epochEarnings = earningsByEpoch(recentPayouts, tokenIds);
  const settledMicro = sumMicro(epochEarnings.map((epoch) => epoch.amountUsdc));
  const settledSeconds = epochEarnings.reduce(
    (sum, epoch) => sum + epoch.seconds,
    0,
  );
  const recentEpochs = epochEarnings.slice(-10);

  /* Bar heights only: chart geometry may be fractional, money never is. */
  const chartData = recentEpochs.map(
    (epoch) => Number(epoch.amountUsdc) / 1_000_000,
  );
  const chartLabels =
    recentEpochs.length > 1
      ? [
          epochAxisLabel(recentEpochs[0].epochId),
          epochAxisLabel(
            recentEpochs[Math.floor(recentEpochs.length / 2)].epochId,
          ),
          epochAxisLabel(recentEpochs[recentEpochs.length - 1].epochId),
        ]
      : recentEpochs.map((epoch) => epochAxisLabel(epoch.epochId));

  return (
    <>
      <dl className="grid gap-6 border-y border-border/60 py-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Total earnings, 30 days
          </dt>
          <dd className="font-heading text-2xl leading-8 font-semibold tracking-[-0.015em] tabular-nums">
            {formatUsdMicro2(artist.earnings30dUsdc)}
          </dd>
          <p className="text-xs text-muted-foreground">
            Settled payouts, trailing 30 days
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">Masters</dt>
          <dd className="font-heading text-2xl leading-8 font-semibold tracking-[-0.015em] tabular-nums">
            {artist.songCount}
          </dd>
          <p className="text-xs text-muted-foreground">
            Each with its own song account
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Settled history
          </dt>
          <dd className="font-heading text-2xl leading-8 font-semibold tracking-[-0.015em] tabular-nums">
            {formatUsdMicro2(settledMicro)}
          </dd>
          <p className="text-xs text-muted-foreground">
            {epochEarnings.length === 0
              ? "No settled payouts yet"
              : `${formatListenHours(settledSeconds)} across ${epochEarnings.length} epochs`}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            Fixed rate
          </dt>
          <dd className="font-heading text-2xl leading-8 font-semibold tracking-[-0.015em] tabular-nums">
            {formatRatePerHour(RATE_PER_HOUR_USDC_MICRO)}
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
        {chartData.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
            Your first settled epoch will appear here.
          </p>
        ) : (
          <EarningsBars
            data={chartData}
            labels={chartLabels}
            summary={`Your masters settled ${formatUsdMicro2(settledMicro)} across ${epochEarnings.length} epochs.`}
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
            Masters
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {artist.songCount} published
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
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
                <th scope="col" className="px-3 py-3 font-medium">
                  Song account
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Balance
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {artist.songs.map((song) => (
                <tr key={song.tokenId} className="group">
                  <th
                    scope="row"
                    aria-label={`${song.title} by ${song.artistName}`}
                    className="px-4 py-3 text-left font-normal"
                  >
                    <Link
                      href={masterHref(song.tokenId)}
                      className="flex min-w-0 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-fill ring-1 ring-foreground/10">
                        <ImageWithFallback
                          src={song.coverUrl}
                          fallback="/images/placeholder/song.jpg"
                          alt=""
                          width={80}
                          height={80}
                          className="size-full object-cover"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {song.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {song.genre}
                        </span>
                      </span>
                    </Link>
                  </th>
                  <td className="px-3 py-3 text-muted-foreground">
                    <span className="block max-w-44 truncate font-mono text-xs">
                      {song.ownerAccountId}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-primary tabular-nums">
                    {formatUsdMicro2(song.earnings30dUsdc)}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <span className="block max-w-44 truncate font-mono text-xs">
                      {song.subAccount}
                    </span>
                  </td>
                  <td
                    className="px-3 py-3 text-right text-muted-foreground tabular-nums"
                    title="Live balance held by this song account"
                  >
                    {formatBalanceMicro(balances.get(song.subAccount))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <WithdrawAction tokenId={song.tokenId} title={song.title} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
          Balances are read live from each song account. Withdraw sends a song
          account&apos;s full balance to your wallet.
        </p>
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
        {epochEarnings.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground">
            No payouts have settled yet.
          </p>
        ) : (
          <Receipt
            title="Recent payouts"
            meta={`Last ${Math.min(epochEarnings.length, 3)} settled epochs`}
          >
            {[...epochEarnings]
              .reverse()
              .slice(0, 3)
              .map((epoch) => (
                <ReceiptRow
                  key={epoch.epochId}
                  title={formatEpochLabel(epoch.epochId)}
                  meta={formatListenHours(epoch.seconds)}
                  value={formatUsdMicro2(epoch.amountUsdc)}
                  detail="Settled in USDC"
                />
              ))}
          </Receipt>
        )}
      </section>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-10">
      <div className="grid gap-6 border-y border-border/60 py-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="h-3 w-28 rounded-full bg-fill" />
            <div className="h-7 w-24 rounded-md bg-fill" />
            <div className="h-3 w-32 rounded-full bg-fill" />
          </div>
        ))}
      </div>
      <div className="h-32 rounded-xl bg-fill/60" />
      <div className="h-56 rounded-xl bg-fill/60" />
    </div>
  );
}

export default function ArtistDashboardPage() {
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

        <p className="max-w-56 text-right text-xs leading-5 text-muted-foreground">
          Publishing opens after the hackathon.
        </p>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
