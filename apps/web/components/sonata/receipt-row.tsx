import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

type ReceiptRowProps = {
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  /** Secondary value line, right aligned under `value`. */
  detail?: ReactNode;
  className?: string;
};

/** One line of a receipt. Rows are deliberately flat: no icons, no colour. */
export function ReceiptRow({
  title,
  meta,
  value,
  detail,
  className,
}: ReceiptRowProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start justify-between gap-4 px-4 py-3 text-sm sm:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {meta ? (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {meta}
          </p>
        ) : null}
      </div>
      {value || detail ? (
        <div className="shrink-0 text-right">
          {value ? (
            <p className="font-medium tabular-nums text-foreground">{value}</p>
          ) : null}
          {detail ? (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground tabular-nums">
              {detail}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
