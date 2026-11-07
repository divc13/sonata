import { DEMO_ACCOUNT_IDS } from "@infinitunes/near";
import { io } from "next/cache";
import Link from "next/link";

import { KeyedByParams } from "~/components/search-params-boundary";
import { MarketControls } from "~/components/sonata/market-controls";
import { MasterCard } from "~/components/sonata/master-card";
import { pageMetadata } from "~/lib/metadata";
import { masterHref } from "~/lib/sonata-demo";
import { readSongAccountBalances } from "~/lib/sonata/balances";
import { formatIncludedBalance, formatUsdMicro2 } from "~/lib/sonata/market";
import {
  type MarketFilter,
  filterMarketListings,
  firstParam,
  marketHref,
  parseMarketFilter,
  parseMarketSort,
  sortMarketListings,
} from "~/lib/sonata/market-view";
import { api } from "~/lib/trpc/server";
import { asRoute } from "~/lib/utils";

export const metadata = pageMetadata({
  title: "Masters for sale",
  description: "Buy the recording, and its account comes with it.",
  url: "/market",
});

type MarketPageProps = {
  searchParams: Promise<{
    sort?: string | string[];
    filter?: string | string[];
  }>;
};

function NoListings() {
  return (
    <section className="flex max-w-xl flex-col items-start gap-4 rounded-xl border border-border/60 bg-card p-6">
      <h2 className="font-heading text-xl font-bold tracking-[-0.015em]">
        No masters are listed
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        The first one could be yours. Publish a recording and its song account
        starts earning from the first verified hour.
      </p>
      <button
        type="button"
        className="inline-flex h-(--ctl) items-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Publish a master
      </button>
    </section>
  );
}

const EMPTY_FILTER_COPY: Record<Exclude<MarketFilter, "all">, string> = {
  owned:
    "None of the listed masters are owned by you yet. When you buy one and list it for resale, it appears here.",
  created:
    "None of the listed masters were created by you yet. Masters you publish appear here when they are for sale.",
};

function NoFilterMatches({ filter }: { filter: Exclude<MarketFilter, "all"> }) {
  return (
    <section className="flex max-w-xl flex-col items-start gap-4 rounded-xl border border-border/60 bg-card p-6">
      <h2 className="font-heading text-xl font-bold tracking-[-0.015em]">
        No masters match this filter
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        {EMPTY_FILTER_COPY[filter]}
      </p>
      <Link
        href={asRoute(marketHref("recent", "all"))}
        className="inline-flex h-(--ctl) items-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Show all masters
      </Link>
    </section>
  );
}

function MarketSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="h-4 w-28 rounded bg-fill" />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className="flex min-w-0 flex-col gap-3">
            <div className="aspect-square rounded-xl bg-fill" />
            <div className="h-4 w-3/4 rounded bg-fill" />
            <div className="h-3 w-1/2 rounded bg-fill" />
          </li>
        ))}
      </ul>
    </div>
  );
}

async function MarketGrid({ searchParams }: MarketPageProps) {
  await io();

  const params = await searchParams;
  const sort = parseMarketSort(firstParam(params.sort));
  const filter = parseMarketFilter(firstParam(params.filter));

  const allListings = await api.sonata.market.listings({ sort: "recent" });
  if (allListings.length === 0) return <NoListings />;

  const listings = sortMarketListings(
    filterMarketListings(allListings, filter, DEMO_ACCOUNT_IDS.listener),
    sort,
  );

  if (listings.length === 0) {
    return filter === "all" ? (
      <NoListings />
    ) : (
      <NoFilterMatches filter={filter} />
    );
  }

  // One parallel read per song account; a failed read only omits that amount.
  const balances = await readSongAccountBalances(
    listings.map((listing) => listing.song.subAccount),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        {listings.length} {listings.length === 1 ? "master" : "masters"} for
        sale
      </p>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {listings.map((listing, index) => {
          const song = listing.song;
          const included = formatIncludedBalance(
            balances.get(song.subAccount) ?? null,
          );

          return (
            <li key={listing.id} className="min-w-0">
              <MasterCard
                title={song.title}
                artist={song.artistName}
                coverUrl={song.coverUrl}
                href={masterHref(song.tokenId)}
                price={formatUsdMicro2(listing.priceUsdc)}
                earnings={formatUsdMicro2(song.earnings30dUsdc)}
                included={included ?? undefined}
                priority={index < 4}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MarketPage({ searchParams }: MarketPageProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex max-w-2xl flex-col gap-3">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Market
        </p>
        <h1 className="font-heading text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          Masters for sale
        </h1>
        <p className="text-sm leading-6 text-muted-foreground sm:text-base">
          Buy the recording, and its account comes with it.
        </p>
      </header>

      <MarketControls />

      <KeyedByParams params={["sort", "filter"]} fallback={<MarketSkeleton />}>
        <MarketGrid searchParams={searchParams} />
      </KeyedByParams>

      <section className="flex max-w-2xl flex-col gap-2 rounded-xl border border-border/60 bg-card p-5">
        <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
          What comes with a master
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          The recording, the song account, and every verified hour it has
          earned. The account moves with the master, so its balance and trailing
          earnings arrive with the sale.
        </p>
      </section>
    </div>
  );
}
