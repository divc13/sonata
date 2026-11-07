import type {
  SonataListingRow,
  SonataOwnershipRow,
  SonataPayoutRow,
} from "@infinitunes/types";
import { ArrowLeftRight, Coins, Sparkles, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  buildMasterHistory,
  hasHistoryBeyondMint,
  historyEventAmount,
  historyEventLabel,
  historyEventMeta,
  shortTxHash,
  type MasterHistoryEvent,
} from "~/lib/sonata/history";
import { cn } from "~/lib/utils";

type MasterHistoryProps = {
  ownership: readonly SonataOwnershipRow[];
  listings: readonly SonataListingRow[];
  payouts: readonly SonataPayoutRow[];
  className?: string;
};

const EVENT_ICON: Record<MasterHistoryEvent["kind"], LucideIcon> = {
  mint: Sparkles,
  listing: Tag,
  sale: ArrowLeftRight,
  transfer: ArrowLeftRight,
  payout: Coins,
};

/** The icon bubble reads as a quiet marker, with mint and sales a shade louder. */
const EVENT_TONE: Record<MasterHistoryEvent["kind"], string> = {
  mint: "border-primary/30 bg-primary/10 text-primary",
  listing: "border-border/60 bg-fill/60 text-muted-foreground",
  sale: "border-primary/30 bg-primary/10 text-primary",
  transfer: "border-border/60 bg-fill/60 text-muted-foreground",
  payout: "border-border/60 bg-card text-foreground",
};

/**
 * The master's per-token timeline: mint, ownership changes, listings and
 * settled epoch payouts. It renders database rows only, oldest first; nothing
 * is inferred from the current owner or listing.
 */
export function MasterHistory({
  ownership,
  listings,
  payouts,
  className,
}: MasterHistoryProps) {
  const events = buildMasterHistory({ ownership, listings, payouts });
  const onlyMint = !hasHistoryBeyondMint(events);

  return (
    <section
      aria-labelledby="master-history-heading"
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 sm:p-5",
        className,
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3
            id="master-history-heading"
            className="font-heading text-sm font-semibold tracking-[-0.01em]"
          >
            Master history
          </h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Every recorded event for this token, oldest first.
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {events.length} {events.length === 1 ? "event" : "events"}
        </p>
      </header>

      {events.length > 0 ? (
        <ol className="flex min-w-0 flex-col">
          {events.map((event, index) => (
            <HistoryLine
              key={event.key}
              event={event}
              last={index === events.length - 1}
            />
          ))}
        </ol>
      ) : null}

      {onlyMint ? (
        <p className="rounded-lg border border-dashed border-border/70 bg-fill/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
          {events.length === 0
            ? "No history recorded yet. Mint, sale and payout events appear here as they are indexed."
            : "No ownership changes, listings or payouts yet. This master is still held by its creator."}
        </p>
      ) : null}
    </section>
  );
}

function HistoryLine({
  event,
  last,
}: {
  event: MasterHistoryEvent;
  last: boolean;
}) {
  const Icon = EVENT_ICON[event.kind];
  const amount = historyEventAmount(event);
  const meta = historyEventMeta(event);

  return (
    <li className="relative flex min-w-0 gap-3 pb-5 last:pb-0 sm:gap-4">
      {last ? null : (
        <span
          aria-hidden="true"
          className="absolute top-9 bottom-0 left-4 w-px bg-border/70"
        />
      )}

      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border",
          EVENT_TONE[event.kind],
        )}
      >
        <Icon className="size-3.5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-1 pt-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {historyEventLabel(event)}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs leading-5 text-muted-foreground">
            <span className="tabular-nums">{meta.date}</span>
            {meta.detail ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{meta.detail}</span>
              </>
            ) : null}
            {meta.txHash ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[0.6875rem]">
                  {shortTxHash(meta.txHash)}
                </span>
              </>
            ) : null}
          </p>
        </div>

        {amount ? (
          <p className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
            {amount}
          </p>
        ) : null}
      </div>
    </li>
  );
}
