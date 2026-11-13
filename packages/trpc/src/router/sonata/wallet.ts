/**
 * Public wallet procedures (NEAR testnet).
 *
 * These are the non-demo replacement for the role-based mutations: every input
 * names the connected account explicitly and the router never accepts a demo
 * role, a signer or a second account. Ownership is always verified against the
 * chain (`nft_token`) before Postgres is touched, and the faucet is a direct
 * `ft_transfer` from the configured faucet account with one grant per account.
 *
 * Postgres stays a cache: `sync*` reads the chain first, writes only what the
 * chain already confirms, and is safe to replay.
 */
import type { DbClient } from "@infinitunes/db/client";
import {
  sonataFaucetGrant,
  sonataListing,
  sonataOwnership,
  sonataPass,
  sonataSong,
} from "@infinitunes/db/schema";
import {
  assertMicroUsdc,
  assertNearAccountId,
  FAUCET_GRANT_USDC_MICRO,
  microUsdcToUsd,
  NEAR_ACCOUNT_ID_PATTERN,
  PASS_PRICE_USDC_MICRO,
  sonataWallet,
  type WalletChain,
} from "@infinitunes/near";
import type {
  SonataListingRow,
  SonataPassCache,
  SonataPurchaseSync,
  SonataWalletGrant,
} from "@infinitunes/types";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router, type TRPCContext } from "../../trpc";
import { rethrowSonataError } from "./demo";
import { microUsdcInput, tokenIdInput } from "./inputs";

/**
 * The connected wallet's account id. It is the only account these procedures
 * ever act on: there is no role input and no way to address another account.
 */
const accountIdInput = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(NEAR_ACCOUNT_ID_PATTERN, "Use a NEAR account id (lowercase)");

/** Uses the injected test client, or the process-wide testnet wallet. */
function walletFor(ctx: TRPCContext): WalletChain {
  return ctx.sonataWallet ?? sonataWallet;
}

/** Canonical account id, or BAD_REQUEST before any chain/DB work. */
function accountOf(accountId: string): string {
  return assertNearAccountId(accountId);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

function duplicateGrant(accountId: string): TRPCError {
  return new TRPCError({
    code: "CONFLICT",
    message: `${accountId} already received the one-time ${microUsdcToUsd(FAUCET_GRANT_USDC_MICRO)} USDC testnet grant.`,
  });
}

async function latestPass(
  db: DbClient,
  accountId: string,
): Promise<SonataPassCache | null> {
  const [pass] = await db
    .select()
    .from(sonataPass)
    .where(eq(sonataPass.accountId, accountId))
    .orderBy(desc(sonataPass.createdAt), desc(sonataPass.id))
    .limit(1);

  return pass ?? null;
}

async function latestListing(
  db: DbClient,
  tokenId: string,
): Promise<SonataListingRow | null> {
  const [listing] = await db
    .select()
    .from(sonataListing)
    .where(eq(sonataListing.tokenId, tokenId))
    .orderBy(desc(sonataListing.createdAt), desc(sonataListing.id))
    .limit(1);

  return listing ?? null;
}

/**
 * Reads the chain owner and rejects a mismatch. A caller can only sync state
 * for an account that actually owns the master; the cache is never allowed to
 * award a token.
 */
async function assertChainOwner(
  wallet: WalletChain,
  accountId: string,
  tokenId: string,
): Promise<void> {
  let token: Awaited<ReturnType<WalletChain["getNftToken"]>>;

  try {
    token = await wallet.getNftToken(tokenId);
  } catch (error) {
    rethrowSonataError(error);
  }

  if (!token) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Master "${tokenId}" was not found on the testnet collection.`,
    });
  }

  if (token.ownerId !== accountId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Master "${tokenId}" is owned by ${token.ownerId}, not ${accountId}.`,
    });
  }
}

/**
 * Public wallet router. `balance`/`sync*` are public reads/writes for a
 * connected account; `faucet` is the one-time testnet funding call and is
 * rate-limited by `sonata_faucet_grant.account_id` (unique).
 */
export const sonataWalletRouter = router({
  /** `usdc.ft_balance_of` as a micro-USDC integer string. */
  balance: publicProcedure
    .input(z.object({ accountId: accountIdInput }))
    .output(z.string())
    .query(async ({ input, ctx }) => {
      try {
        return await walletFor(ctx).getUsdcBalance(accountOf(input.accountId));
      } catch (error) {
        rethrowSonataError(error);
      }
    }),

  /**
   * One-time testnet grant of 25 USDC. The grant row is reserved before the
   * transfer so a duplicate request can never double-fund; a transfer that
   * fails releases the reservation so the user can retry.
   */
  faucet: publicProcedure
    .input(z.object({ accountId: accountIdInput }))
    .output(z.custom<SonataWalletGrant>())
    .mutation(async ({ input, ctx }) => {
      const accountId = accountOf(input.accountId);
      const wallet = walletFor(ctx);

      const [existing] = await ctx.db
        .select({ id: sonataFaucetGrant.id })
        .from(sonataFaucetGrant)
        .where(eq(sonataFaucetGrant.accountId, accountId))
        .limit(1);

      if (existing) throw duplicateGrant(accountId);

      try {
        await ctx.db.insert(sonataFaucetGrant).values({
          accountId,
          amountUsdc: FAUCET_GRANT_USDC_MICRO,
        });
      } catch (error) {
        /* The unique index is the real rate limit under concurrency. */
        if (isUniqueViolation(error)) throw duplicateGrant(accountId);
        throw error;
      }

      try {
        const result = await wallet.transferUsdc({
          receiverId: accountId,
          amountUsdc: FAUCET_GRANT_USDC_MICRO,
        });

        await ctx.db
          .update(sonataFaucetGrant)
          .set({ txHash: result.txHash })
          .where(eq(sonataFaucetGrant.accountId, accountId));

        return { txHash: result.txHash, amountUsdc: FAUCET_GRANT_USDC_MICRO };
      } catch (error) {
        /* Nothing landed: drop the reservation so the same account can retry. */
        await ctx.db
          .delete(sonataFaucetGrant)
          .where(eq(sonataFaucetGrant.accountId, accountId))
          .catch(() => undefined);

        rethrowSonataError(error);
      }
    }),

  /**
   * Mirrors `platform.pass_expiry` into the pass cache. An inactive pass is a
   * no-op; the cached row (if any) is returned so the caller still has the
   * expiry it can display. Replaying this never creates a second row.
   */
  syncPass: publicProcedure
    .input(z.object({ accountId: accountIdInput }))
    .output(z.custom<SonataPassCache | null>())
    .mutation(async ({ input, ctx }) => {
      const accountId = accountOf(input.accountId);

      let expiry: number;
      try {
        expiry = await walletFor(ctx).getPassExpiry(accountId);
      } catch (error) {
        rethrowSonataError(error);
      }

      const now = Date.now();
      /* `pass_expiry` is unix seconds; 0 means no pass or an unreadable chain. */
      if (expiry * 1_000 <= now) return latestPass(ctx.db, accountId);

      const startsAt = new Date(now);
      const expiresAt = new Date(expiry * 1_000);
      const current = await latestPass(ctx.db, accountId);

      if (current) {
        const [updated] = await ctx.db
          .update(sonataPass)
          .set({
            startsAt,
            expiresAt,
            priceUsdc: PASS_PRICE_USDC_MICRO,
          })
          .where(eq(sonataPass.id, current.id))
          .returning();

        return updated ?? current;
      }

      const [created] = await ctx.db
        .insert(sonataPass)
        .values({
          accountId,
          startsAt,
          expiresAt,
          priceUsdc: PASS_PRICE_USDC_MICRO,
        })
        .returning();

      return created ?? null;
    }),

  /**
   * Mirrors a resale the user's wallet already executed: closes the active
   * listing, moves the cached owner and records the sale at the listing price.
   * The chain owner check makes this safe to replay: once the owner matches,
   * it returns the current rows without writing again.
   */
  syncPurchase: publicProcedure
    .input(z.object({ accountId: accountIdInput, tokenId: tokenIdInput }))
    .output(z.custom<SonataPurchaseSync>())
    .mutation(async ({ input, ctx }) => {
      const accountId = accountOf(input.accountId);
      await assertChainOwner(walletFor(ctx), accountId, input.tokenId);

      const [song] = await ctx.db
        .select()
        .from(sonataSong)
        .where(eq(sonataSong.tokenId, input.tokenId))
        .limit(1);

      if (!song) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Master "${input.tokenId}" is not indexed yet; refetch after the indexer catches up.`,
        });
      }

      const listing = await latestListing(ctx.db, input.tokenId);

      /* Already synced (or the master was minted to this account). */
      if (song.ownerAccountId === accountId) return { song, listing };

      if (!listing || !listing.active) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Master "${input.tokenId}" has no active listing to settle.`,
        });
      }

      const now = new Date();

      await ctx.db.transaction(async (tx) => {
        await tx
          .update(sonataListing)
          .set({ active: false, soldAt: now })
          .where(eq(sonataListing.id, listing.id));

        await tx
          .update(sonataSong)
          .set({ ownerAccountId: accountId, updatedAt: now })
          .where(eq(sonataSong.tokenId, input.tokenId));

        await tx.insert(sonataOwnership).values({
          tokenId: input.tokenId,
          ownerAccountId: accountId,
          acquiredAt: now,
          priceUsdc: listing.priceUsdc,
          txHash: null,
          eventType: "sale",
        });
      });

      return {
        song: { ...song, ownerAccountId: accountId, updatedAt: now },
        listing: { ...listing, active: false, soldAt: now },
      };
    }),

  /**
   * Mirrors a listing the user's wallet already created. The chain owner is
   * verified first, any earlier active listing is closed, and an identical
   * active listing (same seller, same price) is returned instead of duplicated.
   */
  syncListing: publicProcedure
    .input(
      z.object({
        accountId: accountIdInput,
        tokenId: tokenIdInput,
        priceUsdc: microUsdcInput,
      }),
    )
    .output(z.custom<SonataListingRow>())
    .mutation(async ({ input, ctx }) => {
      const accountId = accountOf(input.accountId);
      const priceUsdc = assertMicroUsdc(input.priceUsdc, "listing price");

      await assertChainOwner(walletFor(ctx), accountId, input.tokenId);

      const [active] = await ctx.db
        .select()
        .from(sonataListing)
        .where(
          and(
            eq(sonataListing.tokenId, input.tokenId),
            eq(sonataListing.active, true),
          ),
        )
        .orderBy(desc(sonataListing.createdAt), desc(sonataListing.id))
        .limit(1);

      /* Replay of the same listing: do not close and re-open it. */
      if (
        active &&
        active.sellerAccountId === accountId &&
        active.priceUsdc === priceUsdc
      ) {
        return active;
      }

      const [created] = await ctx.db.transaction(async (tx) => {
        if (active) {
          await tx
            .update(sonataListing)
            .set({ active: false })
            .where(eq(sonataListing.id, active.id));
        }

        return tx
          .insert(sonataListing)
          .values({
            tokenId: input.tokenId,
            sellerAccountId: accountId,
            priceUsdc,
            active: true,
          })
          .returning();
      });

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `The listing for "${input.tokenId}" was written but not returned.`,
        });
      }

      return created;
    }),
});
