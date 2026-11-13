import type { Auth } from "@infinitunes/auth";
import type { DbClient } from "@infinitunes/db/client";
import type { SonataChain, WalletChain } from "@infinitunes/near";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import { api } from "./lib/api";
import type { SonataSettlementService } from "./router/sonata/service";

type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

export type Session = {
  user: Pick<AuthSession["user"], "id">;
  /**
   * Current session's token (so password changes can keep it and revoke the
   * rest) and creation time (fresh-session checks for passwordless accounts).
   */
  session?: Partial<Pick<AuthSession["session"], "token" | "createdAt">>;
} | null;

export type TRPCContext = {
  db: DbClient;
  catalogApi?: typeof api;
  /**
   * Optional chain client override. The web adapter leaves this undefined and
   * the sonata router uses the process-wide demo chain; tests inject a fake.
   */
  sonataChain?: SonataChain;
  /**
   * Optional public-wallet client override (view reads + the USDC faucet).
   * The web adapter leaves this undefined so the sonata router uses the
   * process-wide testnet `sonataWallet`; tests inject a fake.
   */
  sonataWallet?: WalletChain;
  /**
   * Listen ingest + epoch settlement service. The web adapter injects the
   * server-only implementation; tests inject a fake.
   */
  sonataSettlement?: SonataSettlementService;
  /**
   * A loaded session, or a thunk. The RSC caller passes `getSession` so
   * public procedures skip the lookup; the HTTP adapter passes the value.
   * `protectedProcedure` resolves either form.
   */
  session: Session | (() => Promise<Session>);
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

async function resolveSession(
  session: TRPCContext["session"],
): Promise<Session> {
  return typeof session === "function" ? session() : session;
}

export const router = t.router;
export const publicProcedure = t.procedure.use(({ ctx, next }) =>
  next({ ctx: { ...ctx, catalogApi: ctx.catalogApi ?? api } }),
);
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const session = await resolveSession(ctx.session);

  if (!session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }

  return next({ ctx: { ...ctx, session } });
});
export const createCallerFactory = t.createCallerFactory;
