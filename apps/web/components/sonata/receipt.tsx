import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

type ReceiptProps = {
  title?: string;
  meta?: string;
  children: ReactNode;
  className?: string;
};

/** A quiet group of receipt rows, the ownership and payout record. */
export function Receipt({ title, meta, children, className }: ReceiptProps) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border/60 bg-card",
        className,
      )}
    >
      {title ? (
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 px-4 py-3 sm:px-5">
          <h3 className="font-heading text-sm font-semibold tracking-[-0.01em]">
            {title}
          </h3>
          {meta ? (
            <p className="text-xs text-muted-foreground tabular-nums">{meta}</p>
          ) : null}
        </header>
      ) : null}
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  );
}
