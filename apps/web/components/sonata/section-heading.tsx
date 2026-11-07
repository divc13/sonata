import type { Route } from "next";
import Link from "next/link";

import { cn } from "~/lib/utils";

type SectionHeadingProps = {
  title: string;
  description?: string;
  action?: { label: string; href: Route };
  className?: string;
};

/** A shelf or section title with one optional quiet action link. */
export function SectionHeading({
  title,
  description,
  action,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-heading text-xl leading-7 font-bold tracking-[-0.015em] text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="shrink-0 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
