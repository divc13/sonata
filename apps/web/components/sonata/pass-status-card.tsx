import Link from "next/link";

import { passDaysLabel, type PassStatus } from "~/lib/sonata-catalog";

type PassStatusCardProps = {
  status: PassStatus;
};

/**
 * The listener's pass, stated on one quiet line. Active shows the expiry date
 * and days remaining; otherwise it offers the 30 day pass.
 */
export function PassStatusCard({ status }: PassStatusCardProps) {
  return (
    <section
      aria-label="Your pass"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 sm:px-5"
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-primary"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{status.label}</p>
        <p className="text-sm leading-6 text-muted-foreground">
          {status.detail}
        </p>
      </div>
      {status.active ? (
        <span className="text-sm font-medium text-foreground tabular-nums">
          {passDaysLabel(status.daysLeft)}
        </span>
      ) : (
        <Link
          href="/pass"
          className="inline-flex h-(--ctl) items-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Get 30 days
        </Link>
      )}
    </section>
  );
}
