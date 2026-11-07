import { createHash } from "node:crypto";

import { inArray, sql } from "drizzle-orm";

import type { DbClient } from "./client";
import {
  sonataEpoch,
  sonataListing,
  sonataOwnership,
  sonataPass,
  sonataPayout,
  sonataSong,
} from "./schema";

/**
 * Deterministic Sonata demo data (specs/06-demo.md).
 *
 * Everything is idempotent: rows with a natural key are inserted with
 * `onConflictDoNothing`; grouped inserts (epochs/payouts, ownership) are
 * skipped when that group already exists, so re-seeding never duplicates
 * chain-written history and never rewinds an indexer-updated owner.
 *
 * Seeded settlement history uses negative epoch ids (`-1` … `-8`), because the
 * platform contract starts real epochs at `1` (`next_epoch_id = 1`): a demo row
 * must never occupy a chain id the oracle is about to settle. Older seeds wrote ids `1` … `8`;
 * those rows are recognised by their deterministic demo tx hash and replaced
 * once, leaving any indexer-written epoch untouched.
 *
 * Amounts are micro-USDC (6 decimals) as text. `total_paid` and payout
 * amounts derive from the fixed rate R = 30_000 ($0.03) per verified hour
 * with floor rounding, exactly like `platform.settle_epoch`.
 */

export const DEMO_PASS_ACCOUNT = "listener.sonata.testnet";

type DemoArtist = { accountId: string; name: string; handle: string };

export const DEMO_ARTISTS: DemoArtist[] = [
  { accountId: "nadia-sonata.testnet", name: "Nadia Vale", handle: "nadia" },
  { accountId: "kofi-sonata.testnet", name: "Kofi Mensah", handle: "kofi" },
  { accountId: "lena-sonata.testnet", name: "Lena Ortiz", handle: "lena" },
];

export type DemoSong = {
  tokenId: string;
  title: string;
  artist: number;
  genre: string;
  durationSec: number;
  description: string;
};

/* One row per masters table in specs/06-demo.md, in listing order. */
export const DEMO_SONGS: DemoSong[] = [
  {
    tokenId: "midnight-drive",
    title: "Midnight Drive",
    artist: 0,
    genre: "Synthwave",
    durationSec: 90,
    description:
      "Neon-lit coastal highway at 2am. Analog pads, gated reverb drums.",
  },
  {
    tokenId: "paper-moons",
    title: "Paper Moons",
    artist: 1,
    genre: "Ambient",
    durationSec: 81,
    description: "Weightless tape loops for late-night studying.",
  },
  {
    tokenId: "velvet-static",
    title: "Velvet Static",
    artist: 2,
    genre: "Dream pop",
    durationSec: 90,
    description: "Shimmering guitars buried under a warm blanket of noise.",
  },
  {
    tokenId: "slow-arc",
    title: "Slow Arc",
    artist: 0,
    genre: "Electronic",
    durationSec: 84,
    description: "A single synthesizer line bending over eight minutes.",
  },
  {
    tokenId: "harbor-lights",
    title: "Harbor Lights",
    artist: 1,
    genre: "Jazz",
    durationSec: 80,
    description:
      "Brushed drums and upright bass recorded live to two-inch tape.",
  },
  {
    tokenId: "glass-hours",
    title: "Glass Hours",
    artist: 2,
    genre: "Neo-soul",
    durationSec: 78,
    description: "Rhodes chords that never quite resolve into daylight.",
  },
  {
    tokenId: "northbound",
    title: "Northbound",
    artist: 0,
    genre: "Indie",
    durationSec: 87,
    description: "Jangly telecaster choruses about leaving on time.",
  },
  {
    tokenId: "after-rain",
    title: "After Rain",
    artist: 1,
    genre: "Lo-fi",
    durationSec: 82,
    description: "Field rain recordings looped under dusty MPC drums.",
  },
  {
    tokenId: "copper-sky",
    title: "Copper Sky",
    artist: 2,
    genre: "Folk",
    durationSec: 102,
    description: "One guitar, one voice, one take.",
  },
  {
    tokenId: "low-tide",
    title: "Low Tide",
    artist: 0,
    genre: "Ambient",
    durationSec: 84,
    description: "Sub-bass swell recorded at a tidal pool.",
  },
  {
    tokenId: "signal-fire",
    title: "Signal Fire",
    artist: 1,
    genre: "Electronic",
    durationSec: 89,
    description: "Modular bleeps answering a distant shortwave radio.",
  },
  {
    tokenId: "quiet-machines",
    title: "Quiet Machines",
    artist: 2,
    genre: "Industrial",
    durationSec: 90,
    description: "Factory floor percussion, politely volume-limited.",
  },
];

/* Eight settlement windows per the earnings table in specs/06-demo.md. */
const DEMO_EPOCHS: { daysAgo: number; totalHours: number }[] = [
  { daysAgo: 56, totalHours: 412 },
  { daysAgo: 49, totalHours: 530 },
  { daysAgo: 42, totalHours: 488 },
  { daysAgo: 35, totalHours: 601 },
  { daysAgo: 28, totalHours: 574 },
  { daysAgo: 21, totalHours: 690 },
  { daysAgo: 14, totalHours: 742 },
  { daysAgo: 7, totalHours: 811 },
];

/* Active resale listings in specs/06-demo.md. The chain mint script reads the
 * same five entries from scripts/demo-catalogue.json. */
export const DEMO_LISTINGS = [
  { tokenId: "midnight-drive", priceUsdc: "50000000" },
  { tokenId: "velvet-static", priceUsdc: "35000000" },
  { tokenId: "harbor-lights", priceUsdc: "80000000" },
  { tokenId: "after-rain", priceUsdc: "20000000" },
  { tokenId: "signal-fire", priceUsdc: "65000000" },
] as const;

/** Derives a stable fake tx-like hash for seeded demo events. */
function demoHash(seed: string) {
  return `0x${createHash("sha256").update(seed).digest("hex")}`;
}

const RATE_PER_HOUR_USDC = "30000";
/** Repeating per-entry weights so charts are not flat lines. */
const ENTRY_WEIGHTS = [30, 22, 16, 12, 10, 8] as const;
const WEIGHT_SUM = 98;
const ENTRIES_PER_EPOCH = ENTRY_WEIGHTS.length;
/* $150.00 of pass revenue has always been sitting in the left-over balance. */
const DUST_USDC = 150_000_000;

type Slot = { tokenId: string; seconds: number; amountUsdc: string };

/** Floor-locked split of an epoch across the rotating song window. */
export function epochSlots(totalSeconds: number, offset: number): Slot[] {
  const slots: Slot[] = [];

  for (let i = 0; i < ENTRIES_PER_EPOCH; i += 1) {
    const tokenId = DEMO_SONGS[(offset + i) % DEMO_SONGS.length].tokenId;
    slots.push({
      tokenId,
      seconds: Math.floor((totalSeconds * ENTRY_WEIGHTS[i]) / WEIGHT_SUM),
      amountUsdc: "0",
    });
  }

  let used = 0;
  for (const slot of slots) used += slot.seconds;
  /* The first slot absorbs the rounding remainder so the sum stays exact. */
  slots[0].seconds += totalSeconds - used;

  for (const slot of slots) {
    slot.amountUsdc = String(
      Math.floor((Number(RATE_PER_HOUR_USDC) * slot.seconds) / 3600),
    );
  }

  return slots;
}

export async function seedSonata(db: DbClient) {
  /* --------------------------------------------------------------------- */
  /* 1. Twelve masters (id / token_id is the natural key)                    */
  /* --------------------------------------------------------------------- */

  const mintBase = Date.UTC(2026, 8, 14); // 2026-09-14, staggered per track
  await db
    .insert(sonataSong)
    .values(
      DEMO_SONGS.map((song, index) => {
        const artist = DEMO_ARTISTS[song.artist];
        return {
          tokenId: song.tokenId,
          title: song.title,
          artistName: artist.name,
          artistHandle: artist.handle,
          artistAccountId: artist.accountId,
          /* The demo sells midnight-drive from its creator's wallet. */
          creatorAccountId: artist.accountId,
          ownerAccountId: artist.accountId,
          subAccount: `${song.tokenId}.masters-sonata.testnet`,
          coverUrl: `/demo/covers/${song.tokenId}.webp`,
          audioUrl: `/demo/audio/${song.tokenId}.m4a`,
          durationSec: song.durationSec,
          genre: song.genre,
          releaseYear: 2026,
          description: song.description,
          createdAt: new Date(mintBase + index * 86_400_000),
          updatedAt: new Date(mintBase + index * 86_400_000),
        };
      }),
    )
    .onConflictDoNothing();

  /* --------------------------------------------------------------------- */
  /* 2. Eight past epochs, their payouts, and one mint per ownership history */
  /* --------------------------------------------------------------------- */

  const desiredEpochIds = DEMO_EPOCHS.map((_, index) => -(index + 1));
  const epochRows = await db
    .select({ id: sonataEpoch.id, txHash: sonataEpoch.txHash })
    .from(sonataEpoch);

  /* The seed owns a row only when it is negative or still carries the demo tx
   * hash it wrote; a chain epoch that happens to share an old id is preserved. */
  const seededEpochIds = epochRows
    .filter(
      (epoch) =>
        epoch.id < 0 ||
        epoch.txHash === demoHash(`sonata:demo:epoch:${epoch.id}`),
    )
    .map((epoch) => epoch.id);
  const hasLegacyEpochIds = seededEpochIds.some((id) => id >= 0);
  const hasEveryEpochId = desiredEpochIds.every((id) =>
    epochRows.some((epoch) => epoch.id === id),
  );

  if (hasLegacyEpochIds || !hasEveryEpochId) {
    /* Clear only the seeded history, never a chain settlement. */
    if (seededEpochIds.length > 0) {
      await db
        .delete(sonataPayout)
        .where(inArray(sonataPayout.epochId, seededEpochIds));
      await db
        .delete(sonataEpoch)
        .where(inArray(sonataEpoch.id, seededEpochIds));
    }

    for (let i = 0; i < DEMO_EPOCHS.length; i += 1) {
      const demo = DEMO_EPOCHS[i];
      const id = desiredEpochIds[i];
      const slots = epochSlots(demo.totalHours * 3600, i);

      await db.insert(sonataEpoch).values({
        id,
        startedAt: sql`now() - ${demo.daysAgo + 7} * interval '1 day'`,
        closedAt: sql`now() - ${demo.daysAgo} * interval '1 day'`,
        balanceBeforeUsdc: String(
          slots.reduce((sum, slot) => sum + Number(slot.amountUsdc), 0) +
            DUST_USDC,
        ),
        totalSeconds: demo.totalHours * 3600,
        effectiveRatePerHour: RATE_PER_HOUR_USDC,
        totalPaidUsdc: String(
          slots.reduce((sum, slot) => sum + Number(slot.amountUsdc), 0),
        ),
        listenRoot: demoHash(`sonata:demo:bundle:${id}`),
        entriesCount: slots.length,
        mode: "constant",
        txHash: demoHash(`sonata:demo:epoch:${id}`),
      });

      await db.insert(sonataPayout).values(
        slots.map((slot) => ({
          epochId: id,
          tokenId: slot.tokenId,
          seconds: slot.seconds,
          amountUsdc: slot.amountUsdc,
          txHash: demoHash(`sonata:demo:payout:${id}:${slot.tokenId}`),
        })),
      );
    }
  }

  const [ownershipCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sonataOwnership);

  if (ownershipCount.n === 0) {
    await db.insert(sonataOwnership).values(
      DEMO_SONGS.map((song, index) => {
        const artist = DEMO_ARTISTS[song.artist];
        return {
          tokenId: song.tokenId,
          ownerAccountId: artist.accountId,
          acquiredAt: new Date(mintBase + index * 86_400_000),
          priceUsdc: null,
          txHash: demoHash(`sonata:demo:mint:${song.tokenId}`),
          eventType: "mint" as const,
        };
      }),
    );
  }

  /* --------------------------------------------------------------------- */
  /* 3. Listener pass (fresh when none is active)                            */
  /* --------------------------------------------------------------------- */

  const activePass = await db
    .select({ id: sonataPass.id })
    .from(sonataPass)
    .where(
      sql`${sonataPass.accountId} = ${DEMO_PASS_ACCOUNT} and ${sonataPass.expiresAt} > now()`,
    )
    .limit(1);

  if (activePass.length === 0) {
    await db.insert(sonataPass).values({
      accountId: DEMO_PASS_ACCOUNT,
      tokenId: "pass-1",
      startsAt: sql`now() - interval '6 days'`,
      expiresAt: sql`now() + interval '24 days'`,
      priceUsdc: "5000000",
      txHash: demoHash(`sonata:demo:pass:${DEMO_PASS_ACCOUNT}`),
    });
  }

  /* --------------------------------------------------------------------- */
  /* 4. Active resale listings (specs/06-demo.md masters table)             */
  /* --------------------------------------------------------------------- */

  for (const listing of DEMO_LISTINGS) {
    const song = DEMO_SONGS.find((entry) => entry.tokenId === listing.tokenId);
    if (!song) continue;

    const activeListing = await db
      .select({ id: sonataListing.id })
      .from(sonataListing)
      .where(
        sql`${sonataListing.tokenId} = ${listing.tokenId} and ${sonataListing.active}`,
      )
      .limit(1);

    if (activeListing.length === 0) {
      await db.insert(sonataListing).values({
        tokenId: listing.tokenId,
        sellerAccountId: DEMO_ARTISTS[song.artist].accountId,
        priceUsdc: listing.priceUsdc,
        active: true,
        txHash: demoHash(`sonata:demo:listing:${listing.tokenId}`),
      });
    }
  }
}
