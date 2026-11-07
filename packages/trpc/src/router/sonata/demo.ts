import { createServerEnv } from "@infinitunes/env";
import {
  SonataChainError,
  sonataChain,
  type SonataChain,
} from "@infinitunes/near";
import { TRPCError } from "@trpc/server";

import type { TRPCContext } from "../../trpc";

/**
 * Demo guard. `SONATA_DEMO_MODE` defaults to false; an invalid value is treated
 * as disabled rather than crashing the router.
 */
export function isSonataDemoMode(
  runtimeEnv: Record<string, string | undefined> = process.env,
): boolean {
  const raw = runtimeEnv.SONATA_DEMO_MODE?.trim();
  /* Never let a typo enable money mutations; the schema only allows true/false. */
  if (raw !== undefined && raw !== "" && raw !== "true" && raw !== "false") {
    return false;
  }

  try {
    return (
      createServerEnv({
        runtimeEnv,
        skipValidation: runtimeEnv.SKIP_ENV_VALIDATION === "true",
      }).SONATA_DEMO_MODE === "true"
    );
  } catch {
    return false;
  }
}

export function assertSonataDemoMode(): void {
  if (!isSonataDemoMode()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Sonata demo actions are disabled. Set SONATA_DEMO_MODE=true on the server.",
    });
  }
}

/** Uses the injected test client, or the process-wide demo chain. */
export function sonataChainFor(ctx: TRPCContext): SonataChain {
  return ctx.sonataChain ?? sonataChain;
}

/**
 * Maps chain failures to tRPC codes without leaking RPC internals. Contract
 * panics keep their frozen text and readable explanation.
 */
export function rethrowSonataError(error: unknown): never {
  if (error instanceof SonataChainError) {
    const detail = error.txHash
      ? `${error.message} (tx ${error.txHash})`
      : error.message;
    throw new TRPCError({
      code:
        error.code === "invalid-input" ? "BAD_REQUEST" : "PRECONDITION_FAILED",
      message: detail,
    });
  }

  throw error;
}
