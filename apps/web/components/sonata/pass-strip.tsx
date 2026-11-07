import type { Route } from "next";
import Link from "next/link";

import { cn } from "~/lib/utils";

type PassStripProps = {
  active?: boolean;
  daysLeft?: number;
  href?: Route;
  className?: string;
};

/**
 * The one-line pass status in the home page. Quiet on an active pass, one
 * amber action when there is none.
 */
export function PassStrip({
  active = false,
  daysLeft = 23,
  href = "/pass",
  className,
}: PassStripProps) {
  return (
    <section
      aria-label="Sonata pass"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 sm:px-5",
        className,
      )}
    >
      {active ? (
        <>
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-primary"
          />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            Pass active,{" "}
            <span className="tabular-nums">
              {daysLeft} {daysLeft === 1 ? "day" : "days"}
            </span>{" "}
            left
          </p>
          <Link
            href={href}
            className="text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            View pass
          </Link>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-sm text-foreground">
            Listen to everything for{" "}
            <span className="font-semibold tabular-nums">$5</span> / 30 days
          </p>
          <Link
            href={href}
            className="inline-flex h-(--ctl) items-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Get 30 days
          </Link>
        </>
      )}
    </section>
  );
}
