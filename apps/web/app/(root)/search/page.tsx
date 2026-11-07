import Link from "next/link";

import { KeyedByParams } from "~/components/search-params-boundary";
import { MasterCard } from "~/components/sonata/master-card";
import { pageMetadata } from "~/lib/metadata";
import { masterHref } from "~/lib/sonata-demo";
import { formatUsdMicro2 } from "~/lib/sonata/market";
import { firstParam } from "~/lib/sonata/market-view";
import { searchMasters } from "~/lib/sonata/search";
import { api } from "~/lib/trpc/server";

import { SonataSearchForm } from "./_components/sonata-search-form";

export const metadata = pageMetadata({
  title: "Search",
  description: "Search masters by title, artist name, or handle on Sonata.",
  url: "/search",
});

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

function SearchResultsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="h-4 w-40 rounded bg-fill" />
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

function NoResults({ query }: { query: string }) {
  return (
    <section className="flex max-w-xl flex-col items-start gap-4 rounded-xl border border-border/60 bg-card p-6">
      <h2 className="font-heading text-xl font-bold tracking-[-0.015em]">
        No masters match “{query}”
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Search by the recording&apos;s title, the artist&apos;s name, or their
        handle. Try “Midnight Drive”, “Nadia Vale”, or “@nadia”.
      </p>
      <Link
        href="/search"
        className="inline-flex h-(--ctl) items-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Show all masters
      </Link>
    </section>
  );
}

async function SearchResults({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = (firstParam(params.q) ?? "").trim();

  const masters = await api.sonata.songs.list({ limit: 100 });
  const results = searchMasters(masters, query);

  if (results.length === 0) {
    return query ? (
      <NoResults query={query} />
    ) : (
      <section className="flex max-w-xl flex-col gap-2 rounded-xl border border-border/60 bg-card p-6">
        <h2 className="font-heading text-xl font-bold tracking-[-0.015em]">
          No masters yet
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          The catalogue is empty right now. Published masters appear here as
          soon as they are minted.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        {query
          ? `${results.length} ${results.length === 1 ? "master" : "masters"} matching “${query}”`
          : `${results.length} ${results.length === 1 ? "master" : "masters"} in the catalogue`}
      </p>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {results.map((master, index) => (
          <li key={master.tokenId} className="min-w-0">
            <MasterCard
              title={master.title}
              artist={master.artistName}
              coverUrl={master.coverUrl}
              href={masterHref(master.tokenId)}
              earnings={formatUsdMicro2(master.earnings30dUsdc)}
              priority={index < 4}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex max-w-2xl flex-col gap-3 pt-2">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Search
        </p>
        <h1 className="font-heading text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-4xl">
          Find a master
        </h1>
        <p className="text-sm leading-6 text-muted-foreground sm:text-base">
          Search the Sonata catalogue by title, artist name, or handle.
        </p>
      </header>

      <SonataSearchForm />

      <KeyedByParams params={["q"]} fallback={<SearchResultsSkeleton />}>
        <SearchResults searchParams={searchParams} />
      </KeyedByParams>
    </div>
  );
}
