/**
 * Pure presentation helpers for the home and library shelves.
 *
 * The pages read real `sonata` router DTOs (micro-USDC strings, `Date`s) and
 * hand them to these functions, so the mapping, ordering and labels can be
 * tested without a database or network. Money stays a micro-USDC string until
 * the display helpers turn it into cents; nothing here feeds a float back into
 * a money calculation.
 */
import type {
  SonataListingWithSong,
  SonataOverview,
  SonataPassCache,
  SonataSongWithEarnings,
} from "@infinitunes/types";
import type { Route } from "next";

import { formatListenHours } from "./sonata-display";
import { formatUsdMicro2 } from "./sonata/market";
import { asRoute } from "./utils";

/** The two demo accounts whose masters the library shows. */
export const SONATA_LIBRARY_ACCOUNTS = [
  "listener.sonata.testnet",
  "collector.sonata.testnet",
] as const;

/** The hero master when the seed still has it, otherwise the first song. */
export const PREFERRED_FEATURED_TOKEN = "midnight-drive";

/** One catalogue row, already shaped for `MasterCard` and the hero. */
export type CatalogMaster = {
  tokenId: string;
  title: string;
  artistName: string;
  artistHandle: string;
  ownerAccountId: string;
  genre: string;
  releaseYear: number;
  durationSec: number;
  coverUrl: string;
  audioUrl: string;
  description: string;
  createdAt: Date;
  href: Route;
  /** Raw micro-USDC trailing 30 day earnings, for exact sorting. */
  earningsMicro: string;
  /** `"$12.34"`, already formatted for display. */
  earningsLabel: string;
  /** Set only when an active listing exists for this master. */
  priceLabel?: string;
  priceMicro?: string;
};

export const masterHref = (tokenId: string): Route =>
  asRoute(`/master/${tokenId}`);

const microValue = (micro: string): bigint => {
  const trimmed = micro.trim();
  if (trimmed === "") return 0n;
  try {
    return BigInt(trimmed);
  } catch {
    return 0n;
  }
};

const activePriceByToken = (
  listings: readonly SonataListingWithSong[],
): Map<string, string> => {
  const prices = new Map<string, string>();
  for (const listing of listings) {
    if (!listing.active) continue;
    prices.set(listing.tokenId, listing.priceUsdc);
  }
  return prices;
};

/**
 * Joins songs with their active listings. A song without a listing still
 * appears (it is simply not for sale); a listing for an unknown token is
 * ignored because there is no master to render.
 */
export function buildCatalogue(
  songs: readonly SonataSongWithEarnings[],
  listings: readonly SonataListingWithSong[] = [],
): CatalogMaster[] {
  const prices = activePriceByToken(listings);

  return songs.map((song) => {
    const priceMicro = prices.get(song.tokenId);
    return {
      tokenId: song.tokenId,
      title: song.title,
      artistName: song.artistName,
      artistHandle: song.artistHandle,
      ownerAccountId: song.ownerAccountId,
      genre: song.genre,
      releaseYear: song.releaseYear,
      durationSec: song.durationSec,
      coverUrl: song.coverUrl,
      audioUrl: song.audioUrl,
      description: song.description ?? "",
      createdAt: song.createdAt,
      href: masterHref(song.tokenId),
      earningsMicro: song.earnings30dUsdc,
      earningsLabel: formatUsdMicro2(song.earnings30dUsdc),
      ...(priceMicro === undefined
        ? {}
        : { priceMicro, priceLabel: formatUsdMicro2(priceMicro) }),
    };
  });
}

/** The hero master: the preferred token when present, else the first song. */
export function featuredMaster(
  masters: readonly CatalogMaster[],
  preferredToken: string = PREFERRED_FEATURED_TOKEN,
): CatalogMaster | null {
  return (
    masters.find((master) => master.tokenId === preferredToken) ??
    masters[0] ??
    null
  );
}

/** Highest trailing-30-day earnings first, exact through `BigInt`. */
export function topEarners(
  masters: readonly CatalogMaster[],
  limit = 6,
): CatalogMaster[] {
  return [...masters]
    .sort((a, b) => {
      const diff = microValue(b.earningsMicro) - microValue(a.earningsMicro);
      if (diff > 0n) return 1;
      if (diff < 0n) return -1;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}

/** Newest pressings first (mint date, not release year). */
export function newReleases(
  masters: readonly CatalogMaster[],
  limit = 8,
): CatalogMaster[] {
  return [...masters]
    .sort((a, b) => {
      const diff = b.createdAt.getTime() - a.createdAt.getTime();
      if (diff !== 0) return diff;
      return a.tokenId.localeCompare(b.tokenId);
    })
    .slice(0, limit);
}

/** Masters owned by the demo listener or collector. */
export function libraryMasters(
  masters: readonly CatalogMaster[],
  accounts: readonly string[] = SONATA_LIBRARY_ACCOUNTS,
): CatalogMaster[] {
  const owned = new Set(accounts);
  return masters.filter((master) => owned.has(master.ownerAccountId));
}

export type OverviewStat = {
  label: string;
  value: string;
  hint: string;
};

/** The four platform totals, formatted for the home stat strip. */
export function overviewStats(overview: SonataOverview): OverviewStat[] {
  return [
    {
      label: "Masters",
      value: overview.songsCount.toLocaleString("en-US"),
      hint: "Each with its own song account",
    },
    {
      label: "For sale",
      value: overview.activeListings.toLocaleString("en-US"),
      hint: "Listed on the market",
    },
    {
      label: "Paid to artists",
      value: formatUsdMicro2(overview.totalPaidUsdc),
      hint: "Across settled listening hours",
    },
    {
      label: "Hours listened",
      value: formatListenHours(overview.totalSeconds),
      hint: "Verified, never per listener",
    },
  ];
}

const passDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Stable UTC date label, so server render and a refresh agree. */
export function formatPassDate(date: Date): string {
  return passDate.format(date);
}

export type PassStatus = {
  active: boolean;
  /** Whole days remaining; `null` when there is no active pass. */
  daysLeft: number | null;
  /** Expiry instant of the active pass; `null` on the free tier. */
  expiresAt: Date | null;
  /** `"Pass active"` or `"Free tier"`. */
  label: string;
  /** One quiet line: the expiry date, or what a pass unlocks. */
  detail: string;
};

/**
 * Turns the cached pass row into a status. The chain is the source of truth
 * for expiry, so the comparison is date-based, not a boolean on the row.
 */
export function passStatus(
  pass: SonataPassCache | null,
  now: Date = new Date(),
): PassStatus {
  if (!pass || pass.expiresAt.getTime() <= now.getTime()) {
    return {
      active: false,
      daysLeft: null,
      expiresAt: null,
      label: "Free tier",
      detail:
        "Preview the catalogue free. A pass unlocks every master for 30 days.",
    };
  }

  const daysLeft = Math.ceil(
    (pass.expiresAt.getTime() - now.getTime()) / 86_400_000,
  );

  return {
    active: true,
    daysLeft,
    expiresAt: pass.expiresAt,
    label: "Pass active",
    detail: `Listening until ${formatPassDate(pass.expiresAt)}`,
  };
}

/** `23 days left`, singular-safe, for the library pass card. */
export function passDaysLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "No pass";
  return `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
}
