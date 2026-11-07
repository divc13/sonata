/**
 * Pure listen-credit math (specs/03-accounting.md, "Aggregation").
 *
 * No database or chain access lives here so the daily cap, self-listen
 * exclusion, dedupe and listen root can be tested with plain fixtures.
 * All seconds are integers; all days are UTC calendar days.
 */
import { createHash } from "node:crypto";

import { DAILY_CAP_SEC, type PayoutEntry } from "@infinitunes/near";

export type ListenEventForFold = {
  accountId: string;
  tokenId: string;
  /** Verified seconds for this heartbeat. */
  seconds: number;
  startedAt: Date | number | string;
  clientEventId?: string | null;
  verified?: boolean;
};

export type ListenSongForFold = {
  tokenId: string;
  ownerAccountId: string;
  creatorAccountId: string;
};

export type ListenHourRow = {
  accountId: string;
  tokenId: string;
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  seconds: number;
  capped: boolean;
};

export type FoldedListens = {
  /** Sorted by token id, unique, zero-second rows removed. */
  entries: PayoutEntry[];
  totalSeconds: number;
  /** sha256 of the canonical entries JSON. */
  listenRoot: string;
  /** Per (account, token, UTC day) rows for `sonata_listen_hour`. */
  hours: ListenHourRow[];
  /** Events that survived validation/dedupe (before the cap). */
  eventCount: number;
};

/** Accepts a Date, an ISO string, unix milliseconds or unix seconds. */
function asDate(value: Date | number | string): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    /* Unix seconds are 10 digits; anything smaller is not milliseconds. */
    return new Date(Math.abs(value) < 10_000_000_000 ? value * 1000 : value);
  }
  return new Date(value);
}

export function toUtcDay(value: Date | number | string): string {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid listen timestamp");
  }
  return date.toISOString().slice(0, 10);
}

export function toUtcDate(value: Date | number | string): Date {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid listen timestamp");
  }
  return date;
}

/** Code-point comparison: `localeCompare` can change with the host locale. */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function eventKey(event: ListenEventForFold): string {
  if (event.clientEventId) return `id:${event.clientEventId}`;
  return [
    event.accountId,
    event.tokenId,
    toUtcDate(event.startedAt).toISOString(),
    event.seconds,
  ].join("|");
}

/** Canonical JSON whose sha256 is the epoch's on-chain `listenRoot`. */
export function canonicalEntriesJson(entries: PayoutEntry[]): string {
  return JSON.stringify(
    entries.map((entry) => ({
      tokenId: entry.tokenId,
      seconds: entry.seconds,
    })),
  );
}

export function listenRootOf(entries: PayoutEntry[]): string {
  return createHash("sha256")
    .update(canonicalEntriesJson(entries))
    .digest("hex");
}

/**
 * Folds verified heartbeats into per-song epoch seconds.
 *
 * - dedupes by `clientEventId`
 * - drops owner/creator self-listens
 * - applies the 4 h/day cap across all songs for one account
 * - sorts and uniquifies entries by token id
 * - hashes the canonical entries JSON
 */
export function foldListenEvents(
  events: ListenEventForFold[],
  songs: ListenSongForFold[],
): FoldedListens {
  const songsByToken = new Map(songs.map((song) => [song.tokenId, song]));
  const seen = new Set<string>();
  const dailyUsed = new Map<string, number>();
  const hourTotals = new Map<string, ListenHourRow>();
  const songSeconds = new Map<string, number>();

  const ordered = events
    .filter((event) => event.verified !== false)
    .filter(
      (event) =>
        Number.isInteger(event.seconds) &&
        event.seconds > 0 &&
        songsByToken.has(event.tokenId),
    )
    .map((event) => ({ ...event, started: toUtcDate(event.startedAt) }))
    .sort(
      (a, b) =>
        a.started.getTime() - b.started.getTime() ||
        compareText(eventKey(a), eventKey(b)),
    );

  let eventCount = 0;

  for (const event of ordered) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);

    const song = songsByToken.get(event.tokenId);
    if (!song) continue;

    /* Owner and creator listens never earn, even if a heartbeat was stored. */
    if (
      event.accountId === song.ownerAccountId ||
      event.accountId === song.creatorAccountId
    ) {
      continue;
    }

    eventCount += 1;
    const day = toUtcDay(event.started);
    const dailyKey = `${event.accountId}\u0000${day}`;
    const used = dailyUsed.get(dailyKey) ?? 0;
    const remaining = Math.max(0, DAILY_CAP_SEC - used);
    const credited = Math.min(event.seconds, remaining);
    const capped = credited < event.seconds;

    dailyUsed.set(dailyKey, used + credited);

    const hourKey = `${event.accountId}\u0000${event.tokenId}\u0000${day}`;
    const hour = hourTotals.get(hourKey) ?? {
      accountId: event.accountId,
      tokenId: event.tokenId,
      day,
      seconds: 0,
      capped: false,
    };
    hour.seconds += credited;
    hour.capped ||= capped;
    hourTotals.set(hourKey, hour);

    if (credited > 0) {
      songSeconds.set(
        event.tokenId,
        (songSeconds.get(event.tokenId) ?? 0) + credited,
      );
    }
  }

  const entries: PayoutEntry[] = [...songSeconds.entries()]
    .filter(([, seconds]) => seconds > 0)
    .map(([tokenId, seconds]) => ({ tokenId, seconds }))
    .sort((a, b) => compareText(a.tokenId, b.tokenId));

  const hours = [...hourTotals.values()].sort(
    (a, b) =>
      compareText(a.accountId, b.accountId) ||
      compareText(a.day, b.day) ||
      compareText(a.tokenId, b.tokenId),
  );

  return {
    entries,
    totalSeconds: entries.reduce((sum, entry) => sum + entry.seconds, 0),
    listenRoot: listenRootOf(entries),
    hours,
    eventCount,
  };
}
