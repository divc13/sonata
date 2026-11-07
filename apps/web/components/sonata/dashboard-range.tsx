"use client";

import { useState } from "react";

import { cn } from "~/lib/utils";

const ranges = ["7d", "30d", "90d"] as const;

/**
 * Segmented range switch for the artist earnings chart. Presentational until
 * the indexer exposes per-range totals.
 */
export function DashboardRange() {
  const [range, setRange] = useState<(typeof ranges)[number]>("30d");

  return (
    <fieldset
      aria-label="Earnings range"
      className="inline-flex h-(--ctl) min-w-0 items-center gap-0.5 rounded-full border border-border/60 bg-card p-0.5 pointer-coarse:h-12"
    >
      {ranges.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={range === item}
          onClick={() => setRange(item)}
          className={cn(
            "inline-flex h-full min-w-11 items-center justify-center rounded-full px-3 text-xs font-semibold tabular-nums transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            range === item
              ? "bg-fill-2 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item}
        </button>
      ))}
    </fieldset>
  );
}
