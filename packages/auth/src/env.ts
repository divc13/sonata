import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export interface AuthEnvContext {
  nodeEnv?: string;
  vercelUrl?: string;
  vercelProductionUrl?: string;
}

export function resolveAuthUrl(
  explicit: string | undefined,
  ctx: AuthEnvContext,
) {
  const url = explicit || ctx.vercelProductionUrl || ctx.vercelUrl;
  return url ? (/^https?:\/\//.test(url) ? url : `https://${url}`) : undefined;
}

export function authSchema(ctx: AuthEnvContext = {}) {
  const requiredInProduction = () =>
    ctx.nodeEnv === "production" ? z.string().min(1) : z.string().optional();

  return {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AUTH_SECRET: requiredInProduction(),
    AUTH_URL: z.preprocess(
      (value) =>
        resolveAuthUrl(typeof value === "string" ? value : undefined, ctx),
      z.url(),
    ),
    /*
     * OAuth is optional: `createAuth` registers a provider only when both its
     * halves are set, and `/login` hides a provider without credentials. A
     * deployment must build with no OAuth app configured (the demo uses the
     * password login), so these are never required in production.
     */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    BETTER_AUTH_URL: z.url().optional(),
    BETTER_AUTH_SECRET: z.string().optional(),
    BETTER_AUTH_RP_ID: z.string().optional(),
  };
}

export function authEnv(
  options: {
    runtimeEnv?: Record<string, string | undefined>;
    skipValidation?: boolean;
  } = {},
) {
  const runtimeEnv = options.runtimeEnv ?? process.env;
  return createEnv({
    server: authSchema({
      nodeEnv: runtimeEnv.NODE_ENV,
      vercelUrl: runtimeEnv.VERCEL_URL,
      vercelProductionUrl: runtimeEnv.VERCEL_PROJECT_PRODUCTION_URL,
    }),
    runtimeEnv,
    emptyStringAsUndefined: true,
    skipValidation:
      options.skipValidation ?? runtimeEnv.SKIP_ENV_VALIDATION === "true",
  });
}
