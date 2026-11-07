/**
 * Listen ingest and epoch aggregation (specs/03-accounting.md).
 *
 * Server implementation only: the exported `listens.ts` module adds the
 * `server-only` guard for app consumers, while scripts import this file
 * directly so they can run outside the React Server Component condition.
 */
import { db as defaultDb } from "@infinitunes/db";
import type { DbClient } from "@infinitunes/db/client";
import {
  sonataListenEvent,
  sonataListenHour,
  sonataPass,
  sonataSong,
} from "@infinitunes/db/schema";
import { and, eq, gt, gte, lt, lte, sql } from "drizzle-orm";

import {
  foldListenEvents,
  type FoldedListens,
  type ListenEventForFold,
  type ListenSongForFold,
} from "./listen-math";

export const HEARTBEAT_MIN_SECONDS = 1;
export const HEARTBEAT_MAX_SECONDS = 60;
export const DEMO_EPOCH_DAYS = 7;

export class SonataListenError extends Error {
  constructor(
    readonly code: "invalid-input" | "song-not-found",
    message: string,
  ) {
    super(message);
    this.name = "SonataListenError";
  }
}

export type RecordListenInput = {
  accountId: string;
  tokenId: string;
  /** Verified heartbeat seconds, 1..60. */
  seconds: number;
  /** Heartbeat start as unix seconds. */
  startedAt: number | Date;
  /** Player-generated idempotency key. */
  clientEventId: string;
  /** A no-pass preview is stored but never credited. */
  preview?: boolean;
};

export type RecordListenResult = {
  id: number;
  verified: boolean;
  reason: string | null;
  duplicate: boolean;
};

export type AggregateEpochResult = FoldedListens & {
  epochId: number;
  from: Date;
  to: Date;
};

export type ListenServiceOptions = {
  db?: DbClient;
  now?: Date;
};

/** Unix seconds (not milliseconds) or a Date, normalized for Postgres. */
export function heartbeatStartedAt(value: number | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new SonataListenError("invalid-input", "Invalid heartbeat time.");
    }
    return value;
  }

  if (!Number.isInteger(value) || value <= 0 || value >= 10_000_000_000) {
    throw new SonataListenError(
      "invalid-input",
      "startedAt must be unix seconds.",
    );
  }

  return new Date(value * 1000);
}

function toWindowDate(value: Date | number): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new SonataListenError("invalid-input", "Invalid epoch window.");
    }
    return value;
  }
  return heartbeatStartedAt(value);
}

/**
 * Stores one verified heartbeat. Full listens need a pass covering the
 * heartbeat time; previews are stored with `verified = false` so they are
 * inspectable but never aggregated. Owner/creator listens are flagged and
 * also excluded by the aggregator.
 */
export async function recordListen(
  input: RecordListenInput,
  options: ListenServiceOptions = {},
): Promise<RecordListenResult> {
  const db = options.db ?? defaultDb;

  if (
    !Number.isInteger(input.seconds) ||
    input.seconds < HEARTBEAT_MIN_SECONDS ||
    input.seconds > HEARTBEAT_MAX_SECONDS
  ) {
    throw new SonataListenError(
      "invalid-input",
      `Heartbeat seconds must be an integer between ${HEARTBEAT_MIN_SECONDS} and ${HEARTBEAT_MAX_SECONDS}.`,
    );
  }
  if (!input.accountId || input.accountId.length > 100) {
    throw new SonataListenError("invalid-input", "Invalid account id.");
  }
  if (!input.clientEventId || input.clientEventId.length > 128) {
    throw new SonataListenError("invalid-input", "Invalid client event id.");
  }

  const startedAt = heartbeatStartedAt(input.startedAt);

  const [song] = await db
    .select({
      tokenId: sonataSong.tokenId,
      ownerAccountId: sonataSong.ownerAccountId,
      creatorAccountId: sonataSong.creatorAccountId,
    })
    .from(sonataSong)
    .where(eq(sonataSong.tokenId, input.tokenId))
    .limit(1);

  if (!song) {
    throw new SonataListenError(
      "song-not-found",
      `Master "${input.tokenId}" is not registered.`,
    );
  }

  const [existing] = await db
    .select({
      id: sonataListenEvent.id,
      verified: sonataListenEvent.verified,
      reason: sonataListenEvent.reason,
    })
    .from(sonataListenEvent)
    .where(eq(sonataListenEvent.clientEventId, input.clientEventId))
    .limit(1);

  if (existing) {
    return { ...existing, duplicate: true };
  }

  const [pass] = await db
    .select({ id: sonataPass.id })
    .from(sonataPass)
    .where(
      and(
        eq(sonataPass.accountId, input.accountId),
        lte(sonataPass.startsAt, startedAt),
        gt(sonataPass.expiresAt, startedAt),
      ),
    )
    .limit(1);

  const selfListen =
    input.accountId === song.ownerAccountId ||
    input.accountId === song.creatorAccountId;
  const reason = input.preview
    ? "preview"
    : !pass
      ? "no-active-pass"
      : selfListen
        ? "self-listen"
        : null;
  const verified = Boolean(pass) && !selfListen && !input.preview;

  const [inserted] = await db
    .insert(sonataListenEvent)
    .values({
      accountId: input.accountId,
      tokenId: input.tokenId,
      /* The client event id doubles as the session key for one heartbeat. */
      sessionId: input.clientEventId,
      clientEventId: input.clientEventId,
      positionMs: 0,
      playedMs: input.seconds * 1000,
      seconds: input.seconds,
      startedAt,
      verified,
      reason,
    })
    .onConflictDoNothing({ target: sonataListenEvent.clientEventId })
    .returning({
      id: sonataListenEvent.id,
      verified: sonataListenEvent.verified,
      reason: sonataListenEvent.reason,
    });

  if (inserted) return { ...inserted, duplicate: false };

  const [duplicate] = await db
    .select({
      id: sonataListenEvent.id,
      verified: sonataListenEvent.verified,
      reason: sonataListenEvent.reason,
    })
    .from(sonataListenEvent)
    .where(eq(sonataListenEvent.clientEventId, input.clientEventId))
    .limit(1);

  if (!duplicate) {
    throw new SonataListenError(
      "invalid-input",
      "Could not store the heartbeat.",
    );
  }

  return { ...duplicate, duplicate: true };
}

/**
 * Aggregates verified events in `[from, to)` into per-song epoch seconds,
 * applies the cross-song daily cap, excludes self-listens, and upserts the
 * inspectable `sonata_listen_hour` rows. Re-running is idempotent.
 */
export async function aggregateEpoch(
  epochId: number,
  from: Date | number,
  to: Date | number,
  options: ListenServiceOptions = {},
): Promise<AggregateEpochResult> {
  if (!Number.isInteger(epochId) || epochId < 0) {
    throw new SonataListenError("invalid-input", "Invalid epoch id.");
  }

  const db = options.db ?? defaultDb;
  const start = toWindowDate(from);
  const end = toWindowDate(to);

  if (end.getTime() <= start.getTime()) {
    throw new SonataListenError(
      "invalid-input",
      "The epoch window must end after it starts.",
    );
  }

  const rows = await db
    .select({
      accountId: sonataListenEvent.accountId,
      tokenId: sonataListenEvent.tokenId,
      seconds: sonataListenEvent.seconds,
      startedAt: sonataListenEvent.startedAt,
      clientEventId: sonataListenEvent.clientEventId,
      verified: sonataListenEvent.verified,
      ownerAccountId: sonataSong.ownerAccountId,
      creatorAccountId: sonataSong.creatorAccountId,
    })
    .from(sonataListenEvent)
    .innerJoin(sonataSong, eq(sonataListenEvent.tokenId, sonataSong.tokenId))
    .where(
      and(
        eq(sonataListenEvent.verified, true),
        gte(sonataListenEvent.startedAt, start),
        lt(sonataListenEvent.startedAt, end),
      ),
    );

  const folded = foldListenEvents(
    rows satisfies ListenEventForFold[],
    rows satisfies ListenSongForFold[],
  );

  if (folded.hours.length > 0) {
    await db
      .insert(sonataListenHour)
      .values(folded.hours)
      .onConflictDoUpdate({
        target: [
          sonataListenHour.accountId,
          sonataListenHour.tokenId,
          sonataListenHour.day,
        ],
        set: {
          seconds: sql`excluded.seconds`,
          capped: sql`excluded.capped`,
          updatedAt: options.now ?? new Date(),
        },
      });
  }

  return {
    ...folded,
    epochId,
    from: start,
    to: end,
  };
}

/** Demo epochs settle a rolling seven-day window ending now. */
export function demoEpochWindow(now: Date = new Date()): {
  from: Date;
  to: Date;
} {
  return {
    from: new Date(now.getTime() - DEMO_EPOCH_DAYS * 86_400_000),
    to: now,
  };
}
