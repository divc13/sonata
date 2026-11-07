"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { controlStyles } from "~/lib/control-styles";
import { cn } from "~/lib/utils";

function SearchForm({ query }: { query: string }) {
  return (
    <search className="flex w-full max-w-2xl items-center gap-2">
      <form
        action="/search"
        method="get"
        className="flex w-full items-center gap-2"
      >
        <label htmlFor="master-search" className="sr-only">
          Search masters
        </label>

        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-(--r-ctl) bg-fill px-3 text-muted-foreground transition-colors duration-fast focus-within:bg-fill-2 focus-within:ring-2 focus-within:ring-ring">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <input
            key={query}
            id="master-search"
            type="search"
            name="q"
            defaultValue={query}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search by title, artist, or handle"
            className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <Link
              href="/search"
              aria-label="Clear search"
              className={cn(
                controlStyles.rowIcon,
                "grid place-items-center text-muted-foreground transition-colors duration-fast hover:bg-fill-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              <X aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </div>

        <button
          type="submit"
          className={cn(
            "inline-flex h-11 shrink-0 items-center rounded-(--r-ctl) bg-primary px-4 text-sm font-semibold text-primary-foreground",
            "transition-colors duration-fast hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          Search
        </button>
      </form>
    </search>
  );
}

function CurrentSearch() {
  const params = useSearchParams();
  return <SearchForm query={params.get("q")?.trim() ?? ""} />;
}

/** A GET form, so a search is a shareable `/search?q=` URL. */
export function SonataSearchForm() {
  return (
    <Suspense fallback={<SearchForm query="" />}>
      <CurrentSearch />
    </Suspense>
  );
}
