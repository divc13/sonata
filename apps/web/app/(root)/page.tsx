import { RATE_PER_HOUR_USDC_MICRO } from "@infinitunes/near";
import { Badge } from "@infinitunes/ui/components/badge";
import { ArrowUpRight } from "lucide-react";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

import { ImageWithFallback } from "~/components/image-with-fallback";
import { MasterCard } from "~/components/sonata/master-card";
import { PassStrip } from "~/components/sonata/pass-strip";
import { PlayMaster } from "~/components/sonata/play-master";
import { SectionHeading } from "~/components/sonata/section-heading";
import { Stat } from "~/components/sonata/stat";
import { pageMetadata } from "~/lib/metadata";
import {
  buildCatalogue,
  featuredMaster,
  newReleases,
  overviewStats,
  topEarners,
} from "~/lib/sonata-catalog";
import { formatRatePerHour } from "~/lib/sonata-display";
import { api } from "~/lib/trpc/server";

export const metadata = pageMetadata({
  title: "Sonata — every song is an account",
  description:
    "A premium player where each master is 1 of 1. Listen by the hour, own the recording, and its account comes with it.",
  url: "/",
  alt: "Sonata, a premium player where every song is an account",
});

const SHELF_COLUMNS =
  "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6";

function EmptyCatalog() {
  return (
    <section className="flex max-w-xl flex-col items-start gap-4 rounded-2xl border border-border/60 bg-card p-8">
      <h1 className="font-heading text-2xl font-bold tracking-[-0.02em]">
        The catalog is being pressed
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        The first masters arrive shortly. If you have a recording, publish it
        and its song account starts earning from the first verified hour.
      </p>
    </section>
  );
}

/** Mirrors the hero and the two shelves while the catalogue streams in. */
function HomeSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-10 sm:gap-12">
      <div className="h-72 rounded-2xl border border-border/60 bg-fill sm:h-80" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-border/60 py-5 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="h-3 w-20 rounded bg-fill" />
            <div className="h-6 w-24 rounded bg-fill" />
          </div>
        ))}
      </div>
      <div className={SHELF_COLUMNS}>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex min-w-0 flex-col gap-3">
            <div className="aspect-square rounded-xl bg-fill" />
            <div className="h-4 w-3/4 rounded bg-fill" />
            <div className="h-3 w-1/2 rounded bg-fill" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function HomeContent() {
  await io();

  const [songs, listings, overview] = await Promise.all([
    api.sonata.songs.list({ limit: 100 }),
    api.sonata.market.listings({ sort: "recent" }),
    api.sonata.stats.overview(),
  ]);

  const catalogue = buildCatalogue(songs, listings);
  const featured = featuredMaster(catalogue);

  if (!featured) return <EmptyCatalog />;

  const earners = topEarners(catalogue);
  const releases = newReleases(catalogue);

  return (
    <div className="flex flex-col gap-10 sm:gap-12">
      <section
        data-morph="song"
        aria-labelledby="home-hero-title"
        className="relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card"
      >
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <ImageWithFallback
            src={featured.coverUrl}
            fallback="/images/placeholder/song.jpg"
            alt=""
            fill
            sizes="100vw"
            priority
            className="scale-110 object-cover opacity-30 blur-2xl"
          />
          <div className="absolute inset-0 bg-background/65" />
        </div>

        <div className="grid items-center gap-7 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:gap-12 lg:p-10">
          <div className="flex min-w-0 flex-col items-start gap-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">Master</Badge>
              <Badge variant="outline">1 of 1</Badge>
              {featured.priceLabel ? (
                <Badge
                  variant="outline"
                  className="border-primary/40 text-primary"
                >
                  For sale · {featured.priceLabel}
                </Badge>
              ) : null}
            </div>

            <div className="min-w-0">
              <h1
                id="home-hero-title"
                className="font-heading text-4xl leading-[1.02] font-bold tracking-[-0.035em] sm:text-5xl lg:text-6xl"
              >
                {featured.title}
              </h1>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                {featured.artistName}{" "}
                <span className="text-muted-foreground/70">
                  {featured.artistHandle}
                </span>
              </p>
            </div>

            {featured.description ? (
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                {featured.description}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <PlayMaster
                tokenId={featured.tokenId}
                title={featured.title}
                artistName={featured.artistName}
                artistHandle={featured.artistHandle}
                coverUrl={featured.coverUrl}
                audioUrl={featured.audioUrl}
                durationSec={featured.durationSec}
              />
              <p className="text-sm text-muted-foreground tabular-nums">
                Earns {formatRatePerHour(RATE_PER_HOUR_USDC_MICRO)} per verified
                hour
              </p>
            </div>

            <Link
              href={featured.href}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
              View the master
            </Link>
          </div>

          <Link
            href={featured.href}
            aria-label={`View ${featured.title}`}
            data-morph-art=""
            className="relative mx-auto aspect-square w-full max-w-64 overflow-hidden rounded-xl bg-fill shadow-md ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring md:max-w-none"
          >
            <ImageWithFallback
              src={featured.coverUrl}
              fallback="/images/placeholder/song.jpg"
              alt=""
              width={600}
              height={600}
              sizes="(min-width: 768px) 300px, 60vw"
              priority
              className="size-full object-cover"
            />
          </Link>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-border/60 py-5 sm:grid-cols-4">
        {overviewStats(overview).map((stat) => (
          <Stat
            key={stat.label}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
          />
        ))}
      </dl>

      <PassStrip />

      <section className="flex flex-col gap-5">
        <SectionHeading
          title="Top earning masters"
          description="The recordings people return to, and what they paid last month."
          action={{ label: "Browse the market", href: "/market" }}
        />
        <ul className={SHELF_COLUMNS}>
          {earners.map((master, index) => (
            <li key={master.tokenId} className="min-w-0">
              <MasterCard
                title={master.title}
                artist={master.artistName}
                coverUrl={master.coverUrl}
                href={master.href}
                earnings={master.earningsLabel}
                price={master.priceLabel}
                priority={index < 3}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeading
          title="New releases"
          description="Freshly pressed masters from the artists on Sonata."
        />
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {releases.map((master) => (
            <li key={master.tokenId} className="min-w-0">
              <MasterCard
                title={master.title}
                artist={master.artistName}
                coverUrl={master.coverUrl}
                href={master.href}
                price={master.priceLabel}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 border-t border-border/60 pt-8 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="max-w-xl">
          <h2 className="font-heading text-lg font-bold tracking-[-0.015em]">
            From the label
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            Every master is one recording, owned by one person. Listening pays
            its song account by the verified hour, and the account moves with
            the recording when it changes hands.
          </p>
        </div>
        <Link
          href="/audit"
          className="shrink-0 text-sm font-medium text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
        >
          How the money works
        </Link>
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
