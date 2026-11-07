import { describe, expect, it } from "bun:test";

import type {
  SonataListingWithSong,
  SonataSongWithEarnings,
} from "@infinitunes/types";

import {
  DEFAULT_MARKET_FILTER,
  DEFAULT_MARKET_SORT,
  filterMarketListings,
  firstParam,
  marketHref,
  parseMarketFilter,
  parseMarketSort,
  sortMarketListings,
} from "../lib/sonata/market-view";

function song(
  overrides: Partial<SonataSongWithEarnings> &
    Pick<SonataSongWithEarnings, "tokenId">,
): SonataSongWithEarnings {
  return {
    title: "Midnight Drive",
    artistName: "Nadia Vale",
    artistHandle: "nadia",
    artistAccountId: "nadia-sonata.testnet",
    creatorAccountId: "nadia-sonata.testnet",
    ownerAccountId: "nadia-sonata.testnet",
    subAccount: `${overrides.tokenId}.masters-sonata.testnet`,
    coverUrl: "/demo/covers/midnight-drive.webp",
    audioUrl: "/demo/audio/midnight-drive.m4a",
    durationSec: 90,
    genre: "Synthwave",
    releaseYear: 2026,
    description: null,
    createdAt: new Date("2026-01-12T00:00:00Z"),
    updatedAt: new Date("2026-01-12T00:00:00Z"),
    earnings30dUsdc: "0",
    ...overrides,
  };
}

function listing(
  overrides: Partial<SonataListingWithSong> & { tokenId: string },
): SonataListingWithSong {
  return {
    id: 1,
    sellerAccountId: "nadia-sonata.testnet",
    priceUsdc: "50000000",
    active: true,
    txHash: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
    song: song({ tokenId: overrides.tokenId, ...overrides.song }),
  } as SonataListingWithSong;
}

const viewer = "listener.sonata.testnet";

const listings = [
  listing({
    id: 1,
    tokenId: "midnight-drive",
    priceUsdc: "9000000",
    createdAt: new Date("2026-11-01T00:00:00Z"),
    song: song({ tokenId: "midnight-drive", earnings30dUsdc: "128400000" }),
  }),
  listing({
    id: 2,
    tokenId: "paper-moons",
    priceUsdc: "100000000",
    createdAt: new Date("2026-11-03T00:00:00Z"),
    song: song({
      tokenId: "paper-moons",
      earnings30dUsdc: "9007199254740992",
    }),
  }),
  listing({
    id: 3,
    tokenId: "velvet-static",
    priceUsdc: "50000000",
    createdAt: new Date("2026-11-02T00:00:00Z"),
    song: song({
      tokenId: "velvet-static",
      earnings30dUsdc: "9007199254740991",
      ownerAccountId: viewer,
      creatorAccountId: "lena-sonata.testnet",
    }),
  }),
];

describe("market view params", () => {
  it("parses only known values and falls back to the defaults", () => {
    expect(parseMarketSort("price")).toBe("price");
    expect(parseMarketSort("earnings")).toBe("earnings");
    expect(parseMarketSort("bogus")).toBe(DEFAULT_MARKET_SORT);
    expect(parseMarketSort(undefined)).toBe(DEFAULT_MARKET_SORT);

    expect(parseMarketFilter("owned")).toBe("owned");
    expect(parseMarketFilter("created")).toBe("created");
    expect(parseMarketFilter(["owned", "created"])).toBe(DEFAULT_MARKET_FILTER);
    expect(parseMarketFilter(null)).toBe(DEFAULT_MARKET_FILTER);
  });

  it("takes the first value of a repeated parameter", () => {
    expect(firstParam("price")).toBe("price");
    expect(firstParam(["owned", "created"])).toBe("owned");
    expect(firstParam(undefined)).toBeUndefined();
  });

  it("keeps the default view canonical and links the rest", () => {
    expect(marketHref("recent", "all")).toBe("/market");
    expect(marketHref("price", "all")).toBe("/market?sort=price");
    expect(marketHref("recent", "owned")).toBe("/market?filter=owned");
    expect(marketHref("earnings", "created")).toBe(
      "/market?sort=earnings&filter=created",
    );
  });
});

describe("market filters", () => {
  it("returns every listing for the all filter", () => {
    expect(filterMarketListings(listings, "all", viewer)).toHaveLength(3);
  });

  it("filters by the master's current owner", () => {
    const owned = filterMarketListings(listings, "owned", viewer);
    expect(owned.map((item) => item.tokenId)).toEqual(["velvet-static"]);
  });

  it("filters by the master's creator", () => {
    const created = filterMarketListings(listings, "created", viewer);
    expect(created).toEqual([]);

    const byNadia = filterMarketListings(
      listings,
      "created",
      "nadia-sonata.testnet",
    );
    expect(byNadia.map((item) => item.tokenId)).toEqual([
      "midnight-drive",
      "paper-moons",
    ]);
  });
});

describe("market sorts", () => {
  it("sorts recent listings newest first and keeps the input untouched", () => {
    const before = listings.map((item) => item.id);
    const sorted = sortMarketListings(listings, "recent");

    expect(sorted.map((item) => item.id)).toEqual([2, 3, 1]);
    expect(listings.map((item) => item.id)).toEqual(before);
  });

  it("sorts price as a number, not a string", () => {
    const sorted = sortMarketListings(listings, "price");
    expect(sorted.map((item) => item.priceUsdc)).toEqual([
      "9000000",
      "50000000",
      "100000000",
    ]);
  });

  it("sorts earnings as a big integer, newest listing breaking ties", () => {
    const sorted = sortMarketListings(listings, "earnings");
    expect(sorted.map((item) => item.tokenId)).toEqual([
      "paper-moons",
      "velvet-static",
      "midnight-drive",
    ]);
  });
});
