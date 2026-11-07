import type { SonataSongWithEarnings } from "@infinitunes/types";

/**
 * Master search over the fields the demo actually has: title, artist name and
 * artist handle. Handles are stored without the `@`, so typing `@nadia` and
 * `nadia` both match.
 */

function normalize(value: string): string {
  return value.toLowerCase().replaceAll("@", " ").replace(/\s+/g, " ").trim();
}

export type SearchableMaster = Pick<
  SonataSongWithEarnings,
  "title" | "artistName" | "artistHandle"
>;

/**
 * Case-insensitive substring search. Every whitespace-separated term in the
 * query must appear somewhere in the title, artist name or handle, so
 * `"nadia drive"` finds `Midnight Drive` by Nadia Vale.
 */
export function searchMasters<T extends SearchableMaster>(
  masters: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery === "") return [...masters];

  const terms = normalizedQuery.split(" ");
  return masters.filter((master) => {
    const haystack = normalize(
      `${master.title} ${master.artistName} ${master.artistHandle}`,
    );
    return terms.every((term) => haystack.includes(term));
  });
}
