/**
 * Demo role -> account id mapping. Secret keys live only in the server
 * environment and are read lazily, so importing this module never touches a
 * key and never logs one.
 *
 * Roles are deliberately narrow: this is the demo signer set, not a general
 * wallet abstraction. Production signing belongs to a wallet selector.
 */
import { DEMO_ACCOUNT_IDS } from "./config";
import { SonataChainError } from "./errors";

export const DEMO_ROLES = ["listener", "collector", "oracle", "nadia"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export const DEMO_SIGNER_ENV = {
  listener: "SONATA_DEMO_LISTENER_SECRET_KEY",
  collector: "SONATA_DEMO_COLLECTOR_SECRET_KEY",
  oracle: "SONATA_ORACLE_SECRET_KEY",
  nadia: "SONATA_NADIA_SECRET_KEY",
} as const satisfies Record<DemoRole, string>;

export type DemoAccount = {
  role: DemoRole;
  accountId: string;
  /** The environment variable that holds the key; never the key itself. */
  secretKeyEnv: string;
};

/** Public metadata for a demo role, safe to log or render. */
export function getDemoAccount(role: DemoRole): DemoAccount {
  return {
    role,
    accountId: DEMO_ACCOUNT_IDS[role],
    secretKeyEnv: DEMO_SIGNER_ENV[role],
  };
}

export type DemoSigner = DemoAccount & { secretKey: string };

/**
 * Resolves the demo signer for `role`. Throws a readable error when the key is
 * absent, naming only the environment variable. Never include the key in an
 * error, log line or returned DTO.
 */
export function getDemoSigner(role: DemoRole): DemoSigner {
  const account = getDemoAccount(role);
  const secretKey = process.env[account.secretKeyEnv]?.trim();

  if (!secretKey) {
    throw new SonataChainError(
      "missing-key",
      `No testnet signer is configured for "${role}". Set ${account.secretKeyEnv} on the server.`,
    );
  }

  return { ...account, secretKey };
}
