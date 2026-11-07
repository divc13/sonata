import { io } from "next/cache";
import { Suspense } from "react";

import { MarketControls } from "~/components/sonata/market-controls";
import { MasterCard } from "~/components/sonata/master-card";
import { pageMetadata } from "~/lib/metadata";
import { masterHref } from "~/lib/sonata-demo";
import { formatUsdMicro2 } from "~/lib/sonata/market";
import { api } from "~/lib/trpc/server";

export const metadata = pageMetadata({
  title: "Masters for sale",
  description: "Buy the recording, and its account comes with it.",
  url: "/market",
});

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

function MarketSkeleton() {
  return (
    <ul
      aria-hidden="true"
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <li key={index} className="flex min-w-0 flex-col gap-3">
          <div className="aspect-square rounded-xl bg-fill" />
          <div className="h-4 w-3/4 rounded bg-fill" />
          <div className="h-3 w-1/2 rounded bg-fill" />
        </li>
      ))}
    </ul>
  );
}

async function MarketGrid() {
  await io();
  const listings = await api.sonata.market.listings({ sort: "recent" });

  if (listings.length === 0) return <NoListings />;

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {listings.map((listing, index) => {
        const song = listing.song;

        return (
          <li key={listing.id} className="min-w-0">
            <MasterCard
              title={song.title}
              artist={song.artistName}
              coverUrl={song.coverUrl}
              href={masterHref(song.tokenId)}
              price={formatUsdMicro2(listing.priceUsdc)}
              earnings={formatUsdMicro2(song.earnings30dUsdc)}
              priority={index < 4}
            />
          </li>
        );
      })}
    </ul>
  );
}

export default function MarketPage() {
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

      <Suspense fallback={<MarketSkeleton />}>
        <MarketGrid />
      </Suspense>

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
