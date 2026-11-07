import type { Route } from "next";
import Link from "next/link";

import { ImageWithFallback } from "~/components/image-with-fallback";
import { cn } from "~/lib/utils";

type MasterCardProps = {
  title: string;
  artist: string;
  coverUrl: string;
  href: Route;
  /** Trailing 30 day earnings, already formatted. */
  earnings?: string;
  /** Asking price, already formatted. */
  price?: string;
  /** Song account balance included with the purchase, already formatted. */
  included?: string;
  priority?: boolean;
  className?: string;
};

/**
 * A master in a shelf or grid: square cover with a quiet inner rim, title,
 * artist, and one optional money line. The whole card is one link.
 */
export function MasterCard({
  title,
  artist,
  coverUrl,
  href,
  earnings,
  price,
  included,
  priority,
  className,
}: MasterCardProps) {
  return (
    <article
      data-morph="song"
      className={cn("group flex min-w-0 flex-col", className)}
    >
      <Link
        href={href}
        className="flex min-w-0 flex-col gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          data-morph-art=""
          className="relative aspect-square overflow-hidden rounded-xl bg-fill shadow-sm ring-1 ring-foreground/10 transition-[transform,box-shadow] duration-base ease-spring group-hover:-translate-y-1 group-hover:shadow-md group-active:translate-y-0"
        >
          <ImageWithFallback
            src={coverUrl}
            fallback="/images/placeholder/song.jpg"
            alt={`${title} cover`}
            width={600}
            height={600}
            sizes="(min-width: 1024px) 240px, (min-width: 640px) 30vw, 45vw"
            loading={priority ? "eager" : undefined}
            fetchPriority={priority ? "high" : undefined}
            className="size-full object-cover transition-transform duration-slow ease-out group-hover:scale-105"
          />
          {price ? (
            <span className="absolute right-2.5 bottom-2.5 rounded-lg bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground tabular-nums shadow-sm backdrop-blur-sm">
              {price}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 px-0.5">
          <h3 className="truncate font-heading text-[0.9375rem] leading-5 font-semibold tracking-[-0.01em]">
            {title}
          </h3>
          <p className="truncate text-[0.8125rem] leading-5 text-muted-foreground">
            {artist}
          </p>
          {earnings ? (
            <p className="mt-1 text-xs font-medium text-primary tabular-nums">
              {earnings}
              <span className="text-muted-foreground"> / 30 days</span>
            </p>
          ) : null}
          {included ? (
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              Includes {included}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
