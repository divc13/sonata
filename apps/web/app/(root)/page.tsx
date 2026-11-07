import { Badge } from "@infinitunes/ui/components/badge";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { ImageWithFallback } from "~/components/image-with-fallback";
import { MasterCard } from "~/components/sonata/master-card";
import { PassStrip } from "~/components/sonata/pass-strip";
import { PlayMaster } from "~/components/sonata/play-master";
import { SectionHeading } from "~/components/sonata/section-heading";
import { pageMetadata } from "~/lib/metadata";
import {
  demoMasters,
  earnings30d,
  formatUsd,
  masterByToken,
  masterHref,
  newReleases,
  RATE_PER_HOUR,
  topEarners,
} from "~/lib/sonata-demo";

export const metadata = pageMetadata({
  title: "Sonata — every song is an account",
  description:
    "A premium player where each master is 1 of 1. Listen by the hour, own the recording, and its account comes with it.",
  url: "/",
  alt: "Sonata, a premium player where every song is an account",
});

export default function HomePage() {
  const featured = masterByToken("midnight-drive") ?? demoMasters[0];

  if (!featured) {
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
              <Badge
                variant="outline"
                className="border-primary/40 text-primary"
              >
                For sale · {formatUsd(featured.priceUsd ?? 0)}
              </Badge>
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

            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              {featured.description}
            </p>

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
                Earns {formatUsd(RATE_PER_HOUR)} per verified hour
              </p>
            </div>

            <Link
              href={masterHref(featured.tokenId)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
              View the master
            </Link>
          </div>

          <Link
            href={masterHref(featured.tokenId)}
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

      <PassStrip />

      <section className="flex flex-col gap-5">
        <SectionHeading
          title="Top earning masters"
          description="The recordings people return to, and what they paid last month."
          action={{ label: "Browse the market", href: "/market" }}
        />
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {topEarners.map((master, index) => (
            <li key={master.tokenId} className="min-w-0">
              <MasterCard
                title={master.title}
                artist={master.artistName}
                coverUrl={master.coverUrl}
                href={masterHref(master.tokenId)}
                earnings={formatUsd(earnings30d(master))}
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
          {newReleases.map((master) => (
            <li key={master.tokenId} className="min-w-0">
              <MasterCard
                title={master.title}
                artist={master.artistName}
                coverUrl={master.coverUrl}
                href={masterHref(master.tokenId)}
                price={master.priceUsd ? formatUsd(master.priceUsd) : undefined}
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
