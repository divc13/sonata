import Link from "next/link";

import { pageMetadata } from "~/lib/metadata";

export const metadata = pageMetadata({
  title: "Your library",
  description: "The masters you own, the songs you keep, and your playlists.",
  url: "/library",
});

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
    </div>
  );
}
