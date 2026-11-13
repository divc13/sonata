import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createTable } from "./table-creator";

/* ---------------------------------------------------------------------------
 * Shared Better Auth user
 * ------------------------------------------------------------------------- */

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  image: text("image"),

  /* Shared with Lipi, which mirrors the display name and credential hash here */
  name: text("name"),
  password: text("password"),

  /* Better Auth core compatibility fields */
  betterAuthName: text("betterAuthName").notNull().default(""),
  emailVerifiedBoolean: boolean("emailVerifiedBoolean")
    .notNull()
    .default(false),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

export const betterAuthAccounts = pgTable(
  "better_auth_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { mode: "date" }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { mode: "date" }),
    scope: text("scope"),
    idToken: text("idToken"),
    password: text("password"),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex(
      "better_auth_account_provider_account_unique",
    ).on(table.providerId, table.accountId),
  }),
);

export const betterAuthSessions = pgTable("better_auth_session", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

export const betterAuthVerifications = pgTable("better_auth_verification", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

/* ---------------------------------------------------------------------------
 * Better Auth shared rate-limit counters (SE-17). Per-instance memory cannot
 * cap abuse across serverless instances, so the limiter persists here:
 * `rateLimit.storage: "database"` makes Better Auth address this table
 * through the `rateLimit` model (fields key/count/lastRequest). The
 * `infinitunes_` prefix keeps it inside `db:generate`'s tables filter and
 * isolated in the shared database.
 * ------------------------------------------------------------------------- */

export const betterAuthRateLimits = pgTable("infinitunes_rate_limit", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("lastRequest", { mode: "number" }).notNull(),
});

/* ---------------------------------------------------------------------------
 * Infinitunes passkey credentials (Better Auth @better-auth/passkey).
 * App-specific table, prefixed to stay isolated in the shared database.
 * Column names mirror the plugin schema so the drizzle adapter maps them.
 * ------------------------------------------------------------------------- */

export const infinitunesPasskeys = pgTable("infinitunes_passkey", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  publicKey: text("publicKey").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  credentialID: text("credentialID").notNull().unique(),
  counter: integer("counter").notNull().default(0),
  deviceType: text("deviceType").notNull(),
  backedUp: boolean("backedUp").notNull().default(false),
  transports: text("transports"),
  aaguid: text("aaguid"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

/* ---------------------------------------------------------------------------
 * App tables
 * ------------------------------------------------------------------------- */

export const myPlaylists = createTable("playlist", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  userId: uuid("userId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  songs: text("songs").array().default([]).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const favorites = createTable("favorite", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("userId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  songs: text("songs").array().default([]).notNull(),
  albums: text("albums").array().default([]).notNull(),
  playlists: text("playlists").array().default([]).notNull(),
  artists: text("artists").array().default([]).notNull(),
  podcasts: text("podcasts").array().default([]).notNull(),
});

/** One row per user and played item; replaying bumps `playedAt`. */
export const recentlyPlayed = createTable(
  "recently_played",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("userId")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    itemId: text("itemId").notNull(),
    itemType: text("itemType").$type<"song" | "episode">().notNull(),
    playedAt: timestamp("playedAt", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("infinitunes_recently_played_user_item_unique").on(
      table.userId,
      table.itemType,
      table.itemId,
    ),
    index("infinitunes_recently_played_user_played_at_idx").on(
      table.userId,
      table.playedAt.desc(),
    ),
  ],
);

/* ---------------------------------------------------------------------------
 * Sonata (NEAR hackathon) tables
 *
 * Isolated in the shared database behind the `sonata_` prefix (see
 * `drizzle.config.ts` tablesFilter). NEAR account ids are stored as plain
 * text; nothing here references the Better Auth `user` table. USDC amounts
 * are micro-USDC (6 decimals) stored as `text` so they can carry the full
 * U128 range without JS integer precision loss.
 * ------------------------------------------------------------------------- */

/** A minted master. `token_id` is the NEP-171 token id (the slug). */
export const sonataSong = pgTable(
  "sonata_song",
  {
    tokenId: text("token_id").primaryKey(),
    title: text("title").notNull(),
    artistName: text("artist_name").notNull(),
    artistHandle: text("artist_handle").notNull(),
    artistAccountId: text("artist_account_id").notNull(),
    creatorAccountId: text("creator_account_id").notNull(),
    ownerAccountId: text("owner_account_id").notNull(),
    /** `<token_id>.masters.<collection>`; the keyless per-song NEAR account. */
    subAccount: text("sub_account").notNull(),
    coverUrl: text("cover_url").notNull(),
    audioUrl: text("audio_url").notNull(),
    durationSec: integer("duration_sec").notNull(),
    genre: text("genre").notNull(),
    releaseYear: integer("release_year").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("sonata_song_artist_account_idx").on(table.artistAccountId),
    index("sonata_song_owner_account_idx").on(table.ownerAccountId),
  ],
);

/** One settlement window. `id` comes from the chain (`next_epoch_id`). */
export const sonataEpoch = pgTable(
  "sonata_epoch",
  {
    id: integer("id").primaryKey(),
    startedAt: timestamp("started_at", { mode: "date" }).notNull(),
    closedAt: timestamp("closed_at", { mode: "date" }).notNull(),
    balanceBeforeUsdc: text("balance_before_usdc").notNull(),
    totalSeconds: integer("total_seconds").notNull(),
    /** micro-USDC per 3600 seconds. */
    effectiveRatePerHour: text("effective_rate_per_hour").notNull(),
    totalPaidUsdc: text("total_paid_usdc").notNull(),
    listenRoot: text("listen_root").notNull(),
    entriesCount: integer("entries_count").notNull(),
    mode: text("mode").$type<"constant" | "pro-rata">().notNull(),
    txHash: text("tx_hash"),
  },
  (table) => [index("sonata_epoch_closed_at_idx").on(table.closedAt.desc())],
);

/** Per-song payout for an epoch; written by the sentinel/indexer. */
export const sonataPayout = pgTable(
  "sonata_payout",
  {
    id: serial("id").primaryKey(),
    epochId: integer("epoch_id").notNull(),
    tokenId: text("token_id").notNull(),
    seconds: integer("seconds").notNull(),
    amountUsdc: text("amount_usdc").notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("sonata_payout_epoch_idx").on(table.epochId),
    index("sonata_payout_token_idx").on(table.tokenId),
  ],
);

/**
 * DB cache of a listener pass purchase; the chain is the source of truth.
 * Coincidentally no `token_id` uniqueness: one account can hold several.
 */
export const sonataPass = pgTable(
  "sonata_pass",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id").notNull(),
    tokenId: text("token_id"),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    priceUsdc: text("price_usdc").notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("sonata_pass_account_idx").on(table.accountId)],
);

/**
 * One-time testnet faucet grant. The unique `account_id` is the rate limit and
 * the idempotency key: a row is reserved before the transfer lands and its
 * `tx_hash` is filled once it does, so a failed transfer can release the
 * reservation without ever allowing a second grant.
 */
export const sonataFaucetGrant = pgTable(
  "sonata_faucet_grant",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id").notNull(),
    amountUsdc: text("amount_usdc").notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sonata_faucet_grant_account_unique").on(table.accountId),
  ],
);

/** A fixed-price resale listing. Mirrors `market.Listing` while active. */
export const sonataListing = pgTable(
  "sonata_listing",
  {
    id: serial("id").primaryKey(),
    tokenId: text("token_id").notNull(),
    sellerAccountId: text("seller_account_id").notNull(),
    priceUsdc: text("price_usdc").notNull(),
    active: boolean("active").notNull().default(true),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    cancelledAt: timestamp("cancelled_at", { mode: "date" }),
    soldAt: timestamp("sold_at", { mode: "date" }),
  },
  (table) => [
    index("sonata_listing_token_idx").on(table.tokenId),
    index("sonata_listing_seller_idx").on(table.sellerAccountId),
    index("sonata_listing_active_idx").on(table.active),
  ],
);

/** A completed resale: royalty to creator, proceeds to seller. */
export const sonataSale = pgTable(
  "sonata_sale",
  {
    id: serial("id").primaryKey(),
    tokenId: text("token_id").notNull(),
    sellerAccountId: text("seller_account_id").notNull(),
    buyerAccountId: text("buyer_account_id").notNull(),
    priceUsdc: text("price_usdc").notNull(),
    royaltyUsdc: text("royalty_usdc").notNull(),
    sellerProceedsUsdc: text("seller_proceeds_usdc").notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("sonata_sale_token_idx").on(table.tokenId),
    index("sonata_sale_buyer_idx").on(table.buyerAccountId),
    index("sonata_sale_seller_idx").on(table.sellerAccountId),
  ],
);

/** Full ownership timeline for a token (mint, transfer, sale). */
export const sonataOwnership = pgTable(
  "sonata_ownership",
  {
    id: serial("id").primaryKey(),
    tokenId: text("token_id").notNull(),
    ownerAccountId: text("owner_account_id").notNull(),
    acquiredAt: timestamp("acquired_at", { mode: "date" }).notNull(),
    priceUsdc: text("price_usdc"),
    txHash: text("tx_hash"),
    eventType: text("event_type")
      .$type<"mint" | "transfer" | "sale">()
      .notNull(),
  },
  (table) => [
    index("sonata_ownership_token_idx").on(table.tokenId),
    index("sonata_ownership_owner_idx").on(table.ownerAccountId),
  ],
);

/** USDC leaving a song wallet to the current owner. */
export const sonataWithdrawal = pgTable(
  "sonata_withdrawal",
  {
    id: serial("id").primaryKey(),
    tokenId: text("token_id").notNull(),
    accountId: text("account_id").notNull(),
    amountUsdc: text("amount_usdc").notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("sonata_withdrawal_token_idx").on(table.tokenId),
    index("sonata_withdrawal_account_idx").on(table.accountId),
  ],
);

/** Raw verified heartbeats; dedupe key is `(session_id, position_ms)`. */
export const sonataListenEvent = pgTable(
  "sonata_listen_event",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id").notNull(),
    tokenId: text("token_id").notNull(),
    sessionId: text("session_id").notNull(),
    /** Idempotency key supplied by the player; the dedupe boundary. */
    clientEventId: text("client_event_id"),
    positionMs: integer("position_ms").notNull(),
    playedMs: integer("played_ms").notNull(),
    /** Verified seconds credited by this heartbeat (1..60). */
    seconds: integer("seconds").notNull().default(0),
    /** Heartbeat start, not the row insert time: aggregation uses this. */
    startedAt: timestamp("started_at", { mode: "date" }).defaultNow().notNull(),
    verified: boolean("verified").notNull().default(false),
    reason: text("reason"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("sonata_listen_event_account_idx").on(table.accountId),
    index("sonata_listen_event_token_idx").on(table.tokenId),
    index("sonata_listen_event_session_idx").on(table.sessionId),
    uniqueIndex("sonata_listen_event_client_unique").on(table.clientEventId),
  ],
);

/** Verified seconds per (account, token, UTC day) after capping. */
export const sonataListenHour = pgTable(
  "sonata_listen_hour",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id").notNull(),
    tokenId: text("token_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    /** Accumulated verified seconds (capped at DAILY_CAP across songs). */
    seconds: integer("seconds").notNull().default(0),
    /** True when the daily cap has absorbed further listens. */
    capped: boolean("capped").notNull().default(false),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sonata_listen_hour_unique").on(
      table.accountId,
      table.tokenId,
      table.day,
    ),
    index("sonata_listen_hour_account_idx").on(table.accountId),
  ],
);

/* ---------------------------------------------------------------------------
 * Inferred types
 * ------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type MyPlaylist = typeof myPlaylists.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type BetterAuthVerification =
  typeof betterAuthVerifications.$inferSelect;
export type NewBetterAuthVerification =
  typeof betterAuthVerifications.$inferInsert;

export type InfinitunesPasskey = typeof infinitunesPasskeys.$inferSelect;
export type NewInfinitunesPasskey = typeof infinitunesPasskeys.$inferInsert;

export type SonataSong = typeof sonataSong.$inferSelect;
export type NewSonataSong = typeof sonataSong.$inferInsert;
export type SonataEpoch = typeof sonataEpoch.$inferSelect;
export type NewSonataEpoch = typeof sonataEpoch.$inferInsert;
export type SonataPayout = typeof sonataPayout.$inferSelect;
export type NewSonataPayout = typeof sonataPayout.$inferInsert;
export type SonataPass = typeof sonataPass.$inferSelect;
export type NewSonataPass = typeof sonataPass.$inferInsert;
export type SonataFaucetGrant = typeof sonataFaucetGrant.$inferSelect;
export type NewSonataFaucetGrant = typeof sonataFaucetGrant.$inferInsert;
export type SonataListing = typeof sonataListing.$inferSelect;
export type NewSonataListing = typeof sonataListing.$inferInsert;
export type SonataSale = typeof sonataSale.$inferSelect;
export type NewSonataSale = typeof sonataSale.$inferInsert;
export type SonataOwnership = typeof sonataOwnership.$inferSelect;
export type NewSonataOwnership = typeof sonataOwnership.$inferInsert;
export type SonataWithdrawal = typeof sonataWithdrawal.$inferSelect;
export type NewSonataWithdrawal = typeof sonataWithdrawal.$inferInsert;
export type SonataListenEvent = typeof sonataListenEvent.$inferSelect;
export type NewSonataListenEvent = typeof sonataListenEvent.$inferInsert;
export type SonataListenHour = typeof sonataListenHour.$inferSelect;
export type NewSonataListenHour = typeof sonataListenHour.$inferInsert;
