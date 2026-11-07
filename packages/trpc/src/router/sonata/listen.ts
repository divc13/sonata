/**
 * Verified listen ingest (specs/03-accounting.md, "Listening verification").
 *
 * Public because the player is not necessarily tied to a Better Auth session,
 * but tightly validated and rate-limited: a heartbeat credits at most 60
 * seconds and a client event id is idempotent. Demo mode lets the demo player
 * post as the server-side listener account without exposing its key.
 */
import { DEMO_ACCOUNT_IDS } from "@infinitunes/near";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../../trpc";
import {
  assertSonataDemoMode,
  rethrowSonataError,
  sonataSettlementFor,
} from "./demo";
import { tokenIdInput } from "./inputs";

const RATE_WINDOW_MS = 60_000;
/** A 1s heartbeat is 60/min; allow a small burst for retries. */
const RATE_LIMIT_PER_ACCOUNT = 120;
const RATE_LIMIT_GLOBAL = 600;

type Bucket = { count: number; resetAt: number };
const accountBuckets = new Map<string, Bucket>();
let globalBucket: Bucket = { count: 0, resetAt: 0 };

function takeToken(buckets: Map<string, Bucket>, key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_PER_ACCOUNT) return false;
  bucket.count += 1;
  return true;
}

/** Exposed so a long-lived process cannot grow the map without bound. */
function pruneBuckets(now: number): void {
  if (accountBuckets.size < 10_000) return;
  for (const [key, bucket] of accountBuckets) {
    if (bucket.resetAt <= now) accountBuckets.delete(key);
  }
}

function assertWithinRateLimit(accountId: string): void {
  const now = Date.now();
  if (globalBucket.resetAt <= now) {
    globalBucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  globalBucket.count += 1;
  if (globalBucket.count > RATE_LIMIT_GLOBAL) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many listen heartbeats. Try again shortly.",
    });
  }

  pruneBuckets(now);
  if (!takeToken(accountBuckets, accountId)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many listen heartbeats for this account.",
    });
  }
}

const accountIdInput = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Use a NEAR account id");

const listenInput = z
  .object({
    /** Demo player shortcut; resolves to the listener account. */
    role: z.literal("listener").optional(),
    /** Required outside demo mode. */
    accountId: accountIdInput.optional(),
    tokenId: tokenIdInput,
    /** Heartbeat duration, an integer number of seconds. */
    seconds: z.number().int().min(1).max(60),
    /** Heartbeat start in unix seconds. */
    startedAt: z
      .number()
      .int()
      .positive()
      .max(9_999_999_999, "startedAt must be unix seconds"),
    clientEventId: z.string().trim().min(1).max(128),
    preview: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role && value.accountId) {
      ctx.addIssue({
        code: "custom",
        message: "Send either role or accountId, not both",
        path: ["accountId"],
      });
    }
    if (!value.role && !value.accountId) {
      ctx.addIssue({
        code: "custom",
        message: "accountId is required",
        path: ["accountId"],
      });
    }
  });

/**
 * Rejects heartbeats that are obviously replayed: no more than five minutes
 * ahead of the server and no more than a week old. The daily cap still bounds
 * the value of any accepted timestamp.
 */
function assertHeartbeatTime(startedAt: number): void {
  const now = Math.floor(Date.now() / 1000);
  if (startedAt > now + 300) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The heartbeat starts too far in the future.",
    });
  }
  if (startedAt < now - 7 * 86_400) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The heartbeat is too old.",
    });
  }
}

export const sonataListenRouter = router({
  record: publicProcedure
    .input(listenInput)
    .output(
      z.custom<{
        id: number;
        verified: boolean;
        reason: string | null;
        duplicate: boolean;
      }>(),
    )
    .mutation(async ({ input, ctx }) => {
      let accountId = input.accountId;
      if (input.role) {
        assertSonataDemoMode();
        accountId = DEMO_ACCOUNT_IDS.listener;
      }
      if (!accountId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "accountId is required.",
        });
      }

      assertWithinRateLimit(accountId);

      /* Only heartbeats recorded near real time are worth verifying. */
      assertHeartbeatTime(input.startedAt);

      try {
        return await sonataSettlementFor(ctx).recordListen({
          accountId,
          tokenId: input.tokenId,
          seconds: input.seconds,
          startedAt: input.startedAt,
          clientEventId: input.clientEventId,
          preview: input.preview,
        });
      } catch (error) {
        rethrowSonataError(error);
      }
    }),
});
