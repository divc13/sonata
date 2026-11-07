"use client";

import { useState } from "react";

import { cn } from "~/lib/utils";

const sorts = ["Recent", "Price", "Earnings"] as const;
const filters = ["All masters", "Owned by you", "Created by you"] as const;

const pill =
  "inline-flex h-(--ctl) items-center rounded-(--r-ctl) px-3 text-xs font-medium transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const idle = "text-muted-foreground hover:bg-fill hover:text-foreground";
const active = "bg-fill text-foreground";

/** Static sort and filter controls for the market grid. */
export function MarketControls() {
  const [sort, setSort] = useState<(typeof sorts)[number]>("Recent");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All masters");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border/60 py-2">
      <div className="flex flex-wrap items-center gap-1">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
            className={cn(pill, filter === item ? active : idle)}
          >
            {item}
          </button>
        ))}
      </div>

      <fieldset
        aria-label="Sort listings"
        className="flex min-w-0 items-center gap-1 border-0 p-0"
      >
        <span aria-hidden="true" className="mr-1 text-xs text-muted-foreground">
          Sort
        </span>
        {sorts.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={sort === item}
            onClick={() => setSort(item)}
            className={cn(pill, sort === item ? active : idle)}
          >
            {item}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
