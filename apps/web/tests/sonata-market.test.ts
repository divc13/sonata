import { describe, expect, it } from "bun:test";

import type {
  SonataListingWithSong,
  SonataSongWithEarnings,
} from "@infinitunes/types";

import {
  demoRoleForOwner,
  formatUsdMicro2,
  selectListingForToken,
  usdToMicroUsdc,
} from "../lib/sonata/market";

const song: SonataSongWithEarnings = {
  tokenId: "midnight-drive",
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
  description: null,
  createdAt: new Date("2026-01-12T00:00:00Z"),
  updatedAt: new Date("2026-01-12T00:00:00Z"),
  earnings30dUsdc: "128400123",
};

function listing(overrides: Partial<SonataListingWithSong> = {}) {
  return {
    id: 1,
    tokenId: "midnight-drive",
    sellerAccountId: "nadia-sonata.testnet",
    priceUsdc: "50000000",
    active: true,
    txHash: null,
    createdAt: new Date("2026-11-03T00:00:00Z"),
    song,
    ...overrides,
  } satisfies SonataListingWithSong;
}

describe("micro-USDC formatting", () => {
  it("formats whole dollars with two decimals", () => {
    expect(formatUsdMicro2("50000000")).toBe("$50.00");
    expect(formatUsdMicro2("1000000")).toBe("$1.00");
    expect(formatUsdMicro2("0")).toBe("$0.00");
  });

  it("rounds trailing dust to whole cents", () => {
    expect(formatUsdMicro2("128400123")).toBe("$128.40");
    expect(formatUsdMicro2("18499999")).toBe("$18.50");
  });

  it("groups thousands and keeps the sign", () => {
    expect(formatUsdMicro2("1234567890")).toBe("$1,234.57");
    expect(formatUsdMicro2("-2500000")).toBe("-$2.50");
  });
});

describe("USD to micro-USDC", () => {
  it("converts dollar input, with or without cents", () => {
    expect(usdToMicroUsdc("50")).toBe("50000000");
    expect(usdToMicroUsdc("50.00")).toBe("50000000");
    expect(usdToMicroUsdc("$50.00")).toBe("50000000");
    expect(usdToMicroUsdc("0.01")).toBe("10000");
    expect(usdToMicroUsdc("1,250.50")).toBe("1250500000");
  });

  it("rejects zero, negative, sub-cent and malformed amounts", () => {
    expect(usdToMicroUsdc("0")).toBeNull();
    expect(usdToMicroUsdc("0.00")).toBeNull();
    expect(usdToMicroUsdc("-5")).toBeNull();
    expect(usdToMicroUsdc("1.234")).toBeNull();
    expect(usdToMicroUsdc("ten")).toBeNull();
    expect(usdToMicroUsdc("")).toBeNull();
  });
});

describe("demo owner roles", () => {
  it("maps the demo owner accounts", () => {
    expect(demoRoleForOwner("nadia-sonata.testnet")).toBe("nadia");
    expect(demoRoleForOwner("collector.sonata.testnet")).toBe("collector");
  });

  it("returns null for any other owner", () => {
    expect(demoRoleForOwner("kofi-sonata.testnet")).toBeNull();
    expect(demoRoleForOwner("listener.sonata.testnet")).toBeNull();
  });
});

describe("listing selection", () => {
  it("returns the active listing for the token", () => {
    expect(selectListingForToken(listing(), "midnight-drive")).toEqual(
      listing(),
    );
  });

  it("ignores inactive, mismatched and missing listings", () => {
    expect(
      selectListingForToken(listing({ active: false }), "midnight-drive"),
    ).toBeNull();
    expect(selectListingForToken(listing(), "paper-moons")).toBeNull();
    expect(selectListingForToken(null, "midnight-drive")).toBeNull();
  });
});
