import { z } from "zod";

export const clientSchema = {
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url({ message: "Public App URL is invalid or missing" })
    .default("https://infinitunes.rajputhemant.me")
    .describe(
      "Public URL of the application, read from NEXT_PUBLIC_APP_URL for the web app.",
    ),
} as const;

/**
 * Server-only Sonata configuration. These keys are intentionally absent from
 * `clientSchema`: never prefix them with `NEXT_PUBLIC_`, and never serialize
 * them to a browser response.
 *
 * `SONATA_DEMO_MODE` gates every money mutation in the `sonata` tRPC router.
 * Secret keys are optional so read-only pages and CI stay valid; the signer
 * helper throws a readable error only when a demo action actually needs one.
 */
export const serverSchema = {
  SONATA_DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .describe("Enable demo-only chain mutations (server-side, default false)."),
  SONATA_DEMO_LISTENER_SECRET_KEY: z
    .string()
    .min(1)
    .optional()
    .describe("Server-only ed25519 key for listener.sonata.testnet."),
  SONATA_DEMO_COLLECTOR_SECRET_KEY: z
    .string()
    .min(1)
    .optional()
    .describe("Server-only ed25519 key for collector.sonata.testnet."),
  SONATA_ORACLE_SECRET_KEY: z
    .string()
    .min(1)
    .optional()
    .describe("Server-only ed25519 key for the settlement oracle."),
  SONATA_NADIA_SECRET_KEY: z
    .string()
    .min(1)
    .optional()
    .describe("Server-only ed25519 key for nadia-sonata.testnet."),
} as const;

export type ServerSchema = typeof serverSchema;
