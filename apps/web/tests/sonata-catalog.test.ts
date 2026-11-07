import { describe, expect, it } from "bun:test";

import type {
  SonataListingWithSong,
  SonataPassCache,
  SonataSongWithEarnings,
} from "@infinitunes/types";

import {
  buildCatalogue,
  featuredMaster,
  libraryMasters,
  newReleases,
  overviewStats,
  passDaysLabel,
  passStatus,
  topEarners,
} from "../lib/sonata-catalog";

type SongOverrides = Partial<SonataSongWithEarnings> & { tokenId: string };

function song(overrides: SongOverrides): SonataSongWithEarnings {
  return {
    title: "Midnight Drive",
    artistName: "Nadia Vale",
    artistHandle: "@nadia",
    artistAccountId: "nadia-sonata.testnet",
    creatorAccountId: "nadia-sonata.testnet",
    ownerAccountId: "nadia-sonata.testnet",
    subAccount: "midnight-drive.masters-sonata.testnet",
    coverUrl: "/demo/covers/midnight-drive.webp",
    audioUrl: "/demo/audio/midnight-drive.m4a",
    durationSec: 90,
    genre: "Synthwave",
    releaseYear: 2026,
    description: "A wide-open synthwave cruise.",
    createdAt: new Date("2026-09-14T00:00:00Z"),
    updatedAt: new Date("2026-09-14T00:00:00Z"),
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
    txHash: "0xtx",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    song: song({ tokenId: overrides.tokenId }),
    ...overrides,
  };
}

describe("catalogue mapping", () => {
  it("maps a song to the card shape and links to its master page", () => {
    const [master] = buildCatalogue([
      song({ tokenId: "midnight-drive", earnings30dUsdc: "12345678" }),
    ]);

    expect(master).toMatchObject({
      tokenId: "midnight-drive",
      title: "Midnight Drive",
      artistName: "Nadia Vale",
      artistHandle: "@nadia",
      coverUrl: "/demo/covers/midnight-drive.webp",
      earningsMicro: "12345678",
      earningsLabel: "$12.35",
      href: "/master/midnight-drive",
    });
    expect(master?.priceLabel).toBeUndefined();
  });

  it("takes the price from the one active listing for that token", () => {
    const [master] = buildCatalogue(
      [song({ tokenId: "midnight-drive" })],
      [
        listing({ id: 1, tokenId: "midnight-drive", priceUsdc: "50000000" }),
        listing({ id: 2, tokenId: "velvet-static", priceUsdc: "75000000" }),
      ],
    );

    expect(master?.priceLabel).toBe("$50.00");
    expect(master?.priceMicro).toBe("50000000");
  });

  it("ignores inactive listings and empty descriptions", () => {
    const [master] = buildCatalogue(
      [song({ tokenId: "midnight-drive", description: null })],
      [
        listing({
          tokenId: "midnight-drive",
          priceUsdc: "50000000",
          active: false,
        }),
      ],
    );

    expect(master?.priceLabel).toBeUndefined();
    expect(master?.description).toBe("");
  });
});

describe("catalogue selection", () => {
  const catalogue = buildCatalogue([
    song({
      tokenId: "paper-moons",
      title: "Paper Moons",
      earnings30dUsdc: "9007199254740991",
      createdAt: new Date("2026-09-15T00:00:00Z"),
    }),
    song({
      tokenId: "midnight-drive",
      earnings30dUsdc: "9007199254740992",
      createdAt: new Date("2026-09-14T00:00:00Z"),
    }),
    song({
      tokenId: "slow-arc",
      title: "Slow Arc",
      earnings30dUsdc: "30000",
      createdAt: new Date("2026-09-20T00:00:00Z"),
    }),
  ]);

  it("features midnight-drive, or the first song when it is gone", () => {
    expect(featuredMaster(catalogue)?.tokenId).toBe("midnight-drive");
    expect(
      featuredMaster(
        catalogue.filter((master) => master.tokenId !== "midnight-drive"),
      )?.tokenId,
    ).toBe("paper-moons");
    expect(featuredMaster([])).toBeNull();
  });

  it("ranks top earners exactly, beyond float precision", () => {
    expect(topEarners(catalogue, 2).map((master) => master.tokenId)).toEqual([
      "midnight-drive",
      "paper-moons",
    ]);
  });

  it("orders new releases by mint date, newest first", () => {
    expect(newReleases(catalogue, 2).map((master) => master.tokenId)).toEqual([
      "slow-arc",
      "paper-moons",
    ]);
  });

  it("keeps only masters owned by the listener or collector", () => {
    const owned = libraryMasters(
      buildCatalogue([
        song({ tokenId: "a", ownerAccountId: "listener.sonata.testnet" }),
        song({ tokenId: "b", ownerAccountId: "collector.sonata.testnet" }),
        song({ tokenId: "c", ownerAccountId: "nadia-sonata.testnet" }),
      ]),
    );

    expect(owned.map((master) => master.tokenId)).toEqual(["a", "b"]);
  });
});

describe("overview stats formatting", () => {
  it("formats counts, paid micro-USDC and listen seconds", () => {
    const stats = overviewStats({
      songsCount: 12,
      activeListings: 5,
      totalPaidUsdc: "444600000",
      totalSeconds: 43560,
    });

    expect(stats.map((stat) => [stat.label, stat.value])).toEqual([
      ["Masters", "12"],
      ["For sale", "5"],
      ["Paid to artists", "$444.60"],
      ["Hours listened", "12.1 h"],
    ]);
  });

  it("prints zeros, not blanks, on an empty catalogue", () => {
    const stats = overviewStats({
      songsCount: 0,
      activeListings: 0,
      totalPaidUsdc: "0",
      totalSeconds: 0,
    });

    expect(stats.map((stat) => stat.value)).toEqual([
      "0",
      "0",
      "$0.00",
      "0.0 h",
    ]);
  });
});

describe("pass status", () => {
  const now = new Date("2026-11-07T00:00:00Z");

  function pass(overrides: Partial<SonataPassCache>): SonataPassCache {
    return {
      id: 1,
      accountId: "listener.sonata.testnet",
      tokenId: "pass-1",
      startsAt: new Date("2026-11-01T00:00:00Z"),
      expiresAt: new Date("2026-11-30T00:00:00Z"),
      priceUsdc: "5000000",
      txHash: "0xpass",
      createdAt: new Date("2026-11-01T00:00:00Z"),
      ...overrides,
    };
  }

  it("labels an unexpired pass with its UTC expiry date", () => {
    const status = passStatus(pass({}), now);

    expect(status.active).toBe(true);
    expect(status.daysLeft).toBe(23);
    expect(status.label).toBe("Pass active");
    expect(status.detail).toBe("Listening until Nov 30, 2026");
    expect(passDaysLabel(status.daysLeft)).toBe("23 days left");
  });

  it("falls back to the free tier once the pass has expired", () => {
    const status = passStatus(
      pass({ expiresAt: new Date("2026-11-06T00:00:00Z") }),
      now,
    );

    expect(status.active).toBe(false);
    expect(status.daysLeft).toBeNull();
    expect(status.expiresAt).toBeNull();
    expect(status.label).toBe("Free tier");
    expect(status.detail).toContain("30 days");
  });

  it("treats a missing pass as the free tier", () => {
    expect(passStatus(null, now)).toMatchObject({
      active: false,
      label: "Free tier",
    });
  });

  it("treats expiry exactly now as expired", () => {
    const status = passStatus(pass({ expiresAt: now }), now);
    expect(status.active).toBe(false);
  });

  it("keeps the day label singular", () => {
    expect(passDaysLabel(1)).toBe("1 day left");
    expect(passDaysLabel(null)).toBe("No pass");
  });
});
