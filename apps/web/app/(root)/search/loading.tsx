import { Skeleton } from "@infinitunes/ui/components/skeleton";

/** Mirrors the Sonata search page: heading, GET field, then a master grid. */
export default function SearchLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <header className="flex max-w-2xl flex-col gap-3 pt-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </header>

      <div className="flex w-full max-w-2xl items-center gap-2">
        <Skeleton className="h-11 min-w-0 flex-1 rounded-(--r-ctl)" />
        <Skeleton className="h-11 w-20 shrink-0 rounded-(--r-ctl)" />
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index} className="flex min-w-0 flex-col gap-3">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
