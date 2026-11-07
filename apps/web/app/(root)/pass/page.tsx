import {
  DEMO_ACCOUNT_IDS,
  PASS_DURATION_SEC,
  PASS_PRICE_USDC_MICRO,
} from "@infinitunes/near";
import { Check } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PassBuyAction } from "~/components/sonata/pass-buy-action";
import { pageMetadata } from "~/lib/metadata";
import {
  formatMicroUsd,
  formatPassDate,
  passDailyPriceCents,
  passDaysRemaining,
  passStatus,
  passStatusLabel,
  shortHash,
} from "~/lib/sonata-display";
import { api } from "~/lib/trpc/server";
import { asRoute, cn } from "~/lib/utils";

export const metadata = pageMetadata({
  title: "The Sonata pass",
  description: "Get 30 days of everything for $5.",
  url: "/pass",
});

const PASS_DAYS = PASS_DURATION_SEC / 86_400;
const PASS_PRICE_LABEL = formatMicroUsd(PASS_PRICE_USDC_MICRO);
const DEMO_LISTENER = DEMO_ACCOUNT_IDS.listener;

/**
 * The pass row is fetched per request, so its status is read against the
 * request clock. Going through a module-level helper keeps the render body
 * free of a bare `new Date()` (the React purity lint).
 */
const requestNow = () => new Date();

const included = [
  "Every master in the catalogue",
  "Full playback, no 30-second previews",
  "Verified listening pays each song account by the hour",
  "One payment, no auto-renew, not transferable",
];

const comparison = [
  {
    label: "Playback",
    free: "30-second previews",
    pass: "Every master, in full",
  },
  {
    label: "Verified listening",
    free: "Not counted",
    pass: "Pays the artist by the hour",
  },
  {
    label: "Price",
    free: "$0",
    pass: `${PASS_PRICE_LABEL} / ${PASS_DAYS} days`,
  },
];

async function PassContent() {
  const [pass, overview] = await Promise.all([
    api.sonata.pass.byAccount({ accountId: DEMO_LISTENER }),
    api.sonata.stats.overview(),
  ]);

  const now = requestNow();
  const status = passStatus(pass, now);
  const active = status === "active";
  const daysLeft = pass ? passDaysRemaining(pass.expiresAt, now) : 0;
  const dailyCents = passDailyPriceCents(PASS_PRICE_USDC_MICRO, PASS_DAYS);

  return (
    <>
      <section
        aria-label="Pass status"
        className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={cn(
              "inline-flex rounded-full border border-border/60 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase",
              active
                ? "border-primary/40 text-primary"
                : "text-muted-foreground",
            )}
          >
            {passStatusLabel(status)}
          </span>
          {active ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {daysLeft} {daysLeft === 1 ? "day" : "days"} left
            </span>
          ) : null}
        </div>

        {active && pass ? (
          <>
            <h2 className="font-heading text-xl leading-7 font-bold tracking-[-0.015em]">
              Active until {formatPassDate(pass.expiresAt)}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Every master plays in full, and every verified hour pays the
              artist.
            </p>
            <p className="font-mono text-[0.6875rem] leading-5 text-muted-foreground">
              Receipt · {formatMicroUsd(pass.priceUsdc)} ·{" "}
              {formatPassDate(pass.createdAt)}
              {pass.txHash ? (
                <>
                  {" "}
                  · tx <span title={pass.txHash}>{shortHash(pass.txHash)}</span>
                </>
              ) : null}
            </p>
          </>
        ) : (
          <>
            <h2 className="font-heading text-xl leading-7 font-bold tracking-[-0.015em]">
              {status === "expired" && pass
                ? `Your pass ended ${formatPassDate(pass.expiresAt)}`
                : "Thirty-second previews, on the house"}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Free listening gives you 30 seconds of every master. The pass
              opens the whole recording and turns your hours into artist
              earnings.
            </p>
          </>
        )}
      </section>

      <section
        aria-labelledby="pass-price-title"
        className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card p-6 sm:p-8"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="pass-price-title" className="sr-only">
            The pass price
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-5xl leading-none font-bold tracking-[-0.03em] tabular-nums">
              {PASS_PRICE_LABEL}
            </span>
            <span className="text-sm text-muted-foreground">
              / {PASS_DAYS} days
            </span>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            One payment of {PASS_PRICE_LABEL} covers the full {PASS_DAYS} days —
            about {dailyCents}¢ a day.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-3 rounded-xl border border-border/60 bg-fill/40 px-4 py-3 text-sm">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">You pay</dt>
            <dd className="font-semibold tabular-nums">{PASS_PRICE_LABEL}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">You get</dt>
            <dd className="font-semibold tabular-nums">{PASS_DAYS} days</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Works out to</dt>
            <dd className="font-semibold tabular-nums">{dailyCents}¢ / day</dd>
          </div>
        </dl>

        <ul className="flex flex-col gap-2.5 border-y border-border/60 py-5">
          {included.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm">
              <Check
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <PassBuyAction active={active} />
        <p className="text-center text-xs leading-5 text-muted-foreground">
          {active
            ? "Your pass is active. Listening now counts toward artist payouts."
            : `Demo checkout as ${DEMO_LISTENER}. No card is charged.`}
        </p>
      </section>

      <section
        aria-labelledby="pass-compare-title"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="pass-compare-title"
            className="font-heading text-lg font-bold tracking-[-0.015em]"
          >
            Free preview vs the pass
          </h2>
          <p className="text-sm text-muted-foreground">
            The free tier is a look. The pass is the whole record.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">
                  What you get
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Free
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Pass
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {comparison.map((row) => (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className="px-4 py-3 text-left font-medium text-foreground"
                  >
                    {row.label}
                  </th>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {row.free}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {row.pass}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col gap-2 border-t border-border/60 pt-6 text-xs leading-5 text-muted-foreground">
        <p>
          {overview.songsCount.toLocaleString("en-US")} masters in the catalogue
          · {formatMicroUsd(overview.totalPaidUsdc)} paid to song accounts so
          far.
        </p>
        <p>
          Hours are verified and capped at four per day. Owner and creator
          listens do not earn.
        </p>
      </div>
    </>
  );
}

function PassSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="h-32 rounded-2xl bg-fill/60" />
      <div className="h-96 rounded-2xl bg-fill/60" />
      <div className="h-56 rounded-xl bg-fill/60" />
    </div>
  );
}

export default function PassPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 py-4 sm:py-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          The pass
        </p>
        <h1 className="font-heading text-3xl leading-tight font-bold tracking-[-0.025em] sm:text-4xl">
          Thirty days of everything
        </h1>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          One pass covers every master on Sonata. Listening pays the artists,
          quietly and by the hour.
        </p>
      </header>

      <Suspense fallback={<PassSkeleton />}>
        <PassContent />
      </Suspense>

      <Link
        href={asRoute("/")}
        className="inline-flex h-(--ctl-lg) items-center justify-center rounded-(--r-ctl) border border-border/60 bg-transparent px-4 text-sm font-semibold transition-colors duration-fast hover:bg-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Start listening
      </Link>
    </div>
  );
}
