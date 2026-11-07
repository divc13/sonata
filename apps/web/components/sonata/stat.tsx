import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

type StatProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
};

/** One money or listening figure: a quiet label, a tabular value, a hint. */
export function Stat({ label, value, hint, className }: StatProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="text-xs font-medium tracking-[0.01em] text-muted-foreground">
        {label}
      </dt>
      <dd className="font-heading text-xl leading-7 font-semibold tracking-[-0.01em] tabular-nums">
        {value}
      </dd>
      {hint ? (
        <p className="text-xs leading-4 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
