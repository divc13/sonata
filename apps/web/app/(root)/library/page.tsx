import { DEMO_ACCOUNT_IDS } from "@infinitunes/near";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

import { MasterCard } from "~/components/sonata/master-card";
import { PassStatusCard } from "~/components/sonata/pass-status-card";
import { SectionHeading } from "~/components/sonata/section-heading";
import { pageMetadata } from "~/lib/metadata";
import {
  buildCatalogue,
  libraryMasters,
  passStatus,
} from "~/lib/sonata-catalog";
import { api } from "~/lib/trpc/server";

export const metadata = pageMetadata({
  title: "Your library",
  description: "The masters you own, the songs you keep, and your playlists.",
  url: "/library",
});

function EmptyLibrary() {
  return (
    <section className="flex max-w-2xl flex-col items-start gap-4 rounded-xl border border-border/60 bg-card p-6">
      <h2 className="font-heading text-xl font-bold tracking-[-0.01em]">
        Nothing on the shelf yet
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Buy a master on the market and it appears here with its song account,
        listener hours, and earnings. Listening history arrives with your next
        session.
      </p>
      <Link
        href="/market"
        className="inline-flex h-(--ctl) items-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Browse the market
      </Link>
    </section>
  );
}

function LibrarySkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="h-16 rounded-xl border border-border/60 bg-fill" />
      <div className="flex flex-col gap-5">
        <div className="h-6 w-48 rounded bg-fill" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex min-w-0 flex-col gap-3">
              <div className="aspect-square rounded-xl bg-fill" />
              <div className="h-4 w-3/4 rounded bg-fill" />
              <div className="h-3 w-1/2 rounded bg-fill" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function LibraryContent() {
  await io();

  const [pass, songs] = await Promise.all([
    api.sonata.pass.byAccount({ accountId: DEMO_ACCOUNT_IDS.listener }),
    api.sonata.songs.list({ limit: 100 }),
  ]);

  const catalogue = buildCatalogue(songs);
  const owned = libraryMasters(catalogue);
  const status = passStatus(pass);

  return (
    <div className="flex flex-col gap-8">
      <PassStatusCard status={status} />

      {owned.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <section className="flex flex-col gap-5">
          <SectionHeading
            title="Masters you own"
            description={`${owned.length} ${
              owned.length === 1 ? "recording" : "recordings"
            }, each with its song account and earnings.`}
            action={{ label: "Find another", href: "/market" }}
          />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {owned.map((master, index) => (
              <li key={master.tokenId} className="min-w-0">
                <MasterCard
                  title={master.title}
                  artist={master.artistName}
                  coverUrl={master.coverUrl}
                  href={master.href}
                  earnings={master.earningsLabel}
                  priority={index < 4}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Collection
        </p>
        <h1 className="font-heading text-3xl leading-tight font-bold tracking-[-0.02em]">
          Your library
        </h1>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          Masters you own, songs you have kept, and the playlists you have
          pressed. Signed in, this page follows you across devices.
        </p>
      </header>

      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryContent />
      </Suspense>
    </div>
  );
}
