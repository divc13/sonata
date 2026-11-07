import type { DbClient } from "@infinitunes/db/client";
import {
  sonataListing,
  sonataOwnership,
  sonataPass,
  sonataSong,
} from "@infinitunes/db/schema";
import {
  DEMO_ACCOUNT_IDS,
  PASS_DURATION_SEC,
  PASS_PRICE_USDC_MICRO,
  type ChainResult,
  type DemoRole,
} from "@infinitunes/near";
import { and, desc, eq } from "drizzle-orm";

/**
 * Postgres is a cache of the chain. These helpers write the state a successful
 * demo mutation produced, but they never decide whether the mutation worked:
 * every write is best-effort and idempotent, so replaying the same transaction
 * (a retry, or an indexer catching up later) cannot duplicate rows or double a
 * pass extension.
 */

/** Chain mutation result plus whether the cache follow-up succeeded. */
export type SonataMutationResult = ChainResult & {
  /** `false` when the chain landed but the Postgres write did not. */
  synced: boolean;
  /** Human-readable partial-sync note; present only when `synced` is false. */
  syncWarning?: string;
};

/** `now + 30 days`, in milliseconds. */
const PASS_DURATION_MS = PASS_DURATION_SEC * 1_000;

/** Demo role -> the account id the chain signed as. */
export function roleToAccountId(role: DemoRole): string {
  return DEMO_ACCOUNT_IDS[role];
}

/**
 * Canonical positive micro-USDC string (6 decimals, integer text). Accepts the
 * same strings the tRPC inputs use and strips leading zeros so equality checks
 * against chain values stay textual and exact.
 */
export function microUsdcString(value: string | bigint): string {
  const micro = typeof value === "bigint" ? value : BigInt(value);
  if (micro <= 0n) {
    throw new Error("Micro-USDC amount must be positive");
  }
  return micro.toString();
}

/**
 * A pass purchase always starts now. A live pass extends from its current
 * expiry; an expired (or absent) pass extends from now, matching the contract's
 * `max(now, pass_expiry(sender)) + pass_duration_sec`.
 */
export function passWindow(
  now: Date,
  currentExpiresAt?: Date | null,
): { startsAt: Date; expiresAt: Date } {
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? currentExpiresAt
      : now;

  return {
    startsAt: now,
    expiresAt: new Date(base.getTime() + PASS_DURATION_MS),
  };
}

/** Cached owner, or `null` when the master is not indexed yet. */
export async function cachedOwnerAccountId(
  db: DbClient,
  tokenId: string,
): Promise<string | null> {
  const [song] = await db
    .select({ ownerAccountId: sonataSong.ownerAccountId })
    .from(sonataSong)
    .where(eq(sonataSong.tokenId, tokenId))
    .limit(1);

  return song?.ownerAccountId ?? null;
}

/** Buy side: close the active listing, move ownership, record the sale. */
export async function syncMarketSale(
  db: DbClient,
  input: {
    tokenId: string;
    buyerRole: DemoRole;
    priceUsdc: string;
    txHash: string;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const buyerAccountId = roleToAccountId(input.buyerRole);
  const priceUsdc = microUsdcString(input.priceUsdc);

  await db.transaction(async (tx) => {
    /* A retry of the same chain transaction must not move ownership again. */
    const [alreadySynced] = await tx
      .select({ id: sonataOwnership.id })
      .from(sonataOwnership)
      .where(
        and(
          eq(sonataOwnership.tokenId, input.tokenId),
          eq(sonataOwnership.txHash, input.txHash),
          eq(sonataOwnership.eventType, "sale"),
        ),
      )
      .limit(1);

    if (alreadySynced) return;

    const [song] = await tx
      .select({ tokenId: sonataSong.tokenId })
      .from(sonataSong)
      .where(eq(sonataSong.tokenId, input.tokenId))
      .limit(1);

    if (!song) {
      throw new Error(
        `Master "${input.tokenId}" is not indexed in Postgres; ownership was not moved.`,
      );
    }

    await tx
      .update(sonataListing)
      .set({ active: false, soldAt: now })
      .where(
        and(
          eq(sonataListing.tokenId, input.tokenId),
          eq(sonataListing.active, true),
        ),
      );

    await tx
      .update(sonataSong)
      .set({ ownerAccountId: buyerAccountId, updatedAt: now })
      .where(eq(sonataSong.tokenId, input.tokenId));

    await tx.insert(sonataOwnership).values({
      tokenId: input.tokenId,
      ownerAccountId: buyerAccountId,
      acquiredAt: now,
      priceUsdc,
      txHash: input.txHash,
      eventType: "sale",
    });
  });
}

/** List side: one active listing per token, replacing any older row. */
export async function syncMarketListing(
  db: DbClient,
  input: {
    tokenId: string;
    sellerRole: DemoRole;
    priceUsdc: string;
    txHash: string;
  },
): Promise<void> {
  const sellerAccountId = roleToAccountId(input.sellerRole);
  const priceUsdc = microUsdcString(input.priceUsdc);

  await db.transaction(async (tx) => {
    /* Replaying the same chain transaction is a no-op, even if the listing
       was later bought or superseded. */
    const [alreadySynced] = await tx
      .select({ id: sonataListing.id })
      .from(sonataListing)
      .where(
        and(
          eq(sonataListing.tokenId, input.tokenId),
          eq(sonataListing.txHash, input.txHash),
        ),
      )
      .limit(1);

    if (alreadySynced) return;

    await tx
      .update(sonataListing)
      .set({ active: false })
      .where(
        and(
          eq(sonataListing.tokenId, input.tokenId),
          eq(sonataListing.active, true),
        ),
      );

    await tx.insert(sonataListing).values({
      tokenId: input.tokenId,
      sellerAccountId,
      priceUsdc,
      active: true,
      txHash: input.txHash,
    });
  });
}

/** Pass side: extend the latest cached pass, or insert the first one. */
export async function syncPassPurchase(
  db: DbClient,
  input: { role: "listener"; txHash: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const accountId = roleToAccountId(input.role);

  await db.transaction(async (tx) => {
    /* Replaying the same chain transaction must not extend twice, even when a
       newer pass row exists. */
    const [alreadySynced] = await tx
      .select({ id: sonataPass.id })
      .from(sonataPass)
      .where(
        and(
          eq(sonataPass.accountId, accountId),
          eq(sonataPass.txHash, input.txHash),
        ),
      )
      .limit(1);

    if (alreadySynced) return;

    const [current] = await tx
      .select()
      .from(sonataPass)
      .where(eq(sonataPass.accountId, accountId))
      .orderBy(desc(sonataPass.createdAt))
      .limit(1);

    const { startsAt, expiresAt } = passWindow(now, current?.expiresAt);

    if (current) {
      await tx
        .update(sonataPass)
        .set({
          startsAt,
          expiresAt,
          priceUsdc: PASS_PRICE_USDC_MICRO,
          txHash: input.txHash,
        })
        .where(eq(sonataPass.id, current.id));
      return;
    }

    await tx.insert(sonataPass).values({
      accountId,
      startsAt,
      expiresAt,
      priceUsdc: PASS_PRICE_USDC_MICRO,
      txHash: input.txHash,
    });
  });
}

/**
 * Runs a cache write after a successful chain call. A cache failure is reported
 * in the result and logged with the transaction hash; it never turns a landed
 * chain transaction into an HTTP error.
 */
export async function bestEffortSync(
  chainResult: ChainResult,
  context: { action: string; tokenId?: string },
  sync: () => Promise<void>,
): Promise<SonataMutationResult> {
  try {
    await sync();
    return { ...chainResult, synced: true };
  } catch (error) {
    console.error(
      `[sonata:sync] ${context.action} landed on chain but the Postgres cache was not updated`,
      {
        txHash: chainResult.txHash,
        tokenId: context.tokenId,
        reason: error instanceof Error ? error.message : String(error),
      },
    );

    return {
      ...chainResult,
      synced: false,
      syncWarning: `Transaction ${chainResult.txHash} succeeded on chain, but the local cache could not be updated. Refetching will heal it.`,
    };
  }
}
