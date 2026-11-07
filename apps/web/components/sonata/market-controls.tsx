"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import {
  DEFAULT_MARKET_FILTER,
  DEFAULT_MARKET_SORT,
  MARKET_FILTER_LABELS,
  MARKET_FILTERS,
  MARKET_SORT_LABELS,
  MARKET_SORTS,
  type MarketFilter,
  type MarketSort,
  marketHref,
  parseMarketFilter,
  parseMarketSort,
} from "~/lib/sonata/market-view";
import { asRoute, cn } from "~/lib/utils";

const pill =
  "inline-flex h-(--ctl) items-center rounded-(--r-ctl) px-3 text-xs font-medium transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const idle = "text-muted-foreground hover:bg-fill hover:text-foreground";
const active = "bg-fill text-foreground";

type ControlsProps = {
  sort: MarketSort;
  filter: MarketFilter;
};

function Controls({ sort, filter }: ControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border/60 py-2">
      <nav
        aria-label="Filter listings"
        className="flex flex-wrap items-center gap-1"
      >
        {MARKET_FILTERS.map((item) => (
          <Link
            key={item}
            href={asRoute(marketHref(sort, item))}
            aria-current={filter === item ? "page" : undefined}
            className={cn(pill, filter === item ? active : idle)}
          >
            {MARKET_FILTER_LABELS[item]}
          </Link>
        ))}
      </nav>

      <nav
        aria-label="Sort listings"
        className="flex min-w-0 items-center gap-1"
      >
        <span aria-hidden="true" className="mr-1 text-xs text-muted-foreground">
          Sort
        </span>
        {MARKET_SORTS.map((item) => (
          <Link
            key={item}
            href={asRoute(marketHref(item, filter))}
            aria-current={sort === item ? "page" : undefined}
            className={cn(pill, sort === item ? active : idle)}
          >
            {MARKET_SORT_LABELS[item]}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function CurrentControls() {
  const params = useSearchParams();
  return (
    <Controls
      sort={parseMarketSort(params.get("sort"))}
      filter={parseMarketFilter(params.get("filter"))}
    />
  );
}

/**
 * Sort and filter controls for the market grid. Each control is a link to a
 * `?sort=`/`?filter=` view, so the server renders the same grid a shared or
 * reloaded URL asks for and the default `/market` stays canonical.
 */
export function MarketControls() {
  return (
    <Suspense
      fallback={
        <Controls sort={DEFAULT_MARKET_SORT} filter={DEFAULT_MARKET_FILTER} />
      }
    >
      <CurrentControls />
    </Suspense>
  );
}
