import Link from "next/link";

import { PathnameBoundary } from "~/components/pathname-boundary";
import { isNavActive, primaryNav } from "~/config/nav";
import { cn } from "~/lib/utils";

type MainNavProps = {
  className?: string;
};

/**
 * The toolbar's primary links. One quiet row: Home, Search, Library, Market,
 * You. The old catalog mega menu is gone with the routes it served.
 */
export function MainNav({ className }: MainNavProps) {
  return (
    <PathnameBoundary
      render={(pathname) => (
        <nav
          aria-label="Primary"
          data-slot="main-nav"
          className={cn(
            "relative flex max-w-max shrink-0 grow-0 flex-none items-center gap-0.5",
            className,
          )}
        >
          {primaryNav.map(({ title, href }) => (
            <Link
              key={title}
              href={href}
              aria-current={isNavActive(pathname, href) ? "page" : undefined}
              className="inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-fast outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:text-foreground"
            >
              {title}
            </Link>
          ))}
        </nav>
      )}
    />
  );
}
