import { describe, expect, it } from "bun:test";

import { createClient } from "@infinitunes/db/client";
import { isLocalDatabase } from "@infinitunes/db/local-guard";

import { appRouter } from "../src/root";
import { createCallerFactory } from "../src/trpc";

/**
 * Sonata router integration against the seeded local database
 * (`bun run db:up && bun run db:migrate && bun run db:seed`). Skips entirely
 * when DATABASE_URL is missing or not loopback, so CI and plain `bun test`
 * without a database stay green.
 */
const url = process.env.DATABASE_URL;
const runDb = Boolean(url) && isLocalDatabase(url!);
const caller = runDb
  ? createCallerFactory(appRouter)({ db: createClient(url!), session: null })
  : null;
const c = () => caller!;

describe.skipIf(!runDb)("sonata router (seeded local database)", () => {
  it("lists all twelve seeded masters with trailing earnings", async () => {
    const songs = await c().sonata.songs.list({});

    expect(songs).toHaveLength(12);
    expect(songs.map((song) => song.tokenId)).toContain("midnight-drive");

    for (const song of songs) {
      expect(song.earnings30dUsdc).toMatch(/^\d+$/);
    }
    /* Demo epochs 5–8 pay songs inside the trailing 30-day window. */
    expect(songs.some((song) => song.earnings30dUsdc !== "0")).toBe(true);

    const midnight = songs.find((song) => song.tokenId === "midnight-drive")!;
    expect(midnight.ownerAccountId).toBe("nadia-sonata.testnet");
    expect(midnight.creatorAccountId).toBe("nadia-sonata.testnet");
    expect(midnight.subAccount).toBe("midnight-drive.masters-sonata.testnet");
  });

  it("paginates songs.list deterministically", async () => {
    const page = await c().sonata.songs.list({ limit: 5, offset: 0 });
    const second = await c().sonata.songs.list({ limit: 5, offset: 5 });

    expect(page).toHaveLength(5);
    for (const song of page) {
      expect(second.map((row) => row.tokenId)).not.toContain(song.tokenId);
    }
  });

  it("returns the master detail with owner, creator and recent payouts", async () => {
    const master = await c().sonata.songs.byId({ tokenId: "midnight-drive" });

    expect(master.ownerAccountId).toBe("nadia-sonata.testnet");
    expect(master.creatorAccountId).toBe("nadia-sonata.testnet");
    expect(master.recentPayouts.length).toBeGreaterThan(0);
    for (const payout of master.recentPayouts) {
      expect(payout.tokenId).toBe("midnight-drive");
    }
  });

  it("rejects unknown masters with NOT_FOUND and empty ids with BAD_REQUEST", async () => {
    await expect(
      c().sonata.songs.byId({ tokenId: "not-a-token" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(c().sonata.songs.byId({ tokenId: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("returns the active midnight-drive listing at $50.00", async () => {
    const listings = await c().sonata.market.listings({});

    expect(listings).toHaveLength(5);
    const midnight = listings.find(
      (listing) => listing.tokenId === "midnight-drive",
    );
    expect(midnight).toMatchObject({
      tokenId: "midnight-drive",
      sellerAccountId: "nadia-sonata.testnet",
      priceUsdc: "50000000",
      active: true,
    });
    expect(midnight?.song.title).toBe("Midnight Drive");

    const byToken = await c().sonata.market.listingByToken({
      tokenId: "midnight-drive",
    });
    expect(byToken?.priceUsdc).toBe("50000000");

    const nothing = await c().sonata.market.listingByToken({
      tokenId: "not-a-token",
    });
    expect(nothing).toBeNull();
  });

  it("resolves the artist by handle with and without the @", async () => {
    const artist = await c().sonata.artist.byHandle({ handle: "@nadia" });

    expect(artist).toMatchObject({
      handle: "nadia",
      name: "Nadia Vale",
      accountId: "nadia-sonata.testnet",
      songCount: 4,
    });
    /* Masters in mint order: midnight-drive, slow-arc, northbound, low-tide. */
    expect(artist.songs.map((song) => song.tokenId)).toEqual([
      "midnight-drive",
      "slow-arc",
      "northbound",
      "low-tide",
    ]);
  });

  it("rejects unknown artists with NOT_FOUND", async () => {
    await expect(
      c().sonata.artist.byHandle({ handle: "no-one" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the eight seeded epochs and an epoch detail with payouts", async () => {
    const epochs = await c().sonata.epochs.list({});
    expect(epochs).toHaveLength(8);
    /* Seeded demo history uses negative ids, newest settlement first. */
    expect(epochs.map((epoch) => epoch.id)).toEqual([
      -8, -7, -6, -5, -4, -3, -2, -1,
    ]);
    expect(Number(epochs[0].totalSeconds)).toBeGreaterThan(0);

    const detail = await c().sonata.epochs.byId({ id: -8 });
    expect(detail.payouts).toHaveLength(6);
    expect(detail.effectiveRatePerHour).toBe("30000");

    await expect(c().sonata.epochs.byId({ id: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("keeps the seeded demo history off the chain id space", async () => {
    const epochs = await c().sonata.epochs.list({});
    for (const epoch of epochs) {
      expect(epoch.id).toBeLessThan(0);
    }
    /* No chain epoch has settled, so the oracle's next id is 0. */
    expect(Math.max(...epochs.map((epoch) => epoch.id))).toBeLessThan(0);
  });

  it("sums the epoch payouts into the epoch total exactly", async () => {
    const detail = await c().sonata.epochs.byId({ id: -7 });
    const sum = detail.payouts.reduce(
      (total, payout) => total + Number(payout.amountUsdc),
      0,
    );
    expect(sum).toBe(Number(detail.totalPaidUsdc));
  });

  it("exposes the seeded listener pass", async () => {
    const pass = await c().sonata.pass.byAccount({
      accountId: "listener.sonata.testnet",
    });

    expect(pass?.accountId).toBe("listener.sonata.testnet");
    expect(pass?.priceUsdc).toBe("5000000");
    expect(pass?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("reports the seeded platform totals", async () => {
    const overview = await c().sonata.stats.overview();

    expect(overview).toMatchObject({
      songsCount: 12,
      activeListings: 5,
    });
    expect(Number(overview.totalPaidUsdc)).toBeGreaterThan(0);
    /* Every demo epoch is seeded with whole hours of verified listening. */
    expect(overview.totalSeconds % 3600).toBe(0);
  });
});
