import { MarketControls } from "~/components/sonata/market-controls";
import { MasterCard } from "~/components/sonata/master-card";
import { pageMetadata } from "~/lib/metadata";
import {
  demoListings,
  earnings30d,
  formatUsd,
  masterHref,
} from "~/lib/sonata-demo";

export const metadata = pageMetadata({
  title: "Masters for sale",
  description: "Buy the recording, and its account comes with it.",
  url: "/market",
});

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

      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {demoListings.map((master, index) => (
          <li key={master.tokenId} className="min-w-0">
            <MasterCard
              title={master.title}
              artist={master.artistName}
              coverUrl={master.coverUrl}
              href={masterHref(master.tokenId)}
              price={formatUsd(master.priceUsd ?? 0)}
              earnings={formatUsd(earnings30d(master))}
              included={formatUsd(master.balanceUsd)}
              priority={index < 4}
            />
          </li>
        ))}
      </ul>

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
