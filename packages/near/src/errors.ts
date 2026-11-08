/**
 * Error mapping for the server-side NEAR client.
 *
 * Contract panics are part of the frozen interface (specs/02-contracts.md), so
 * they are surfaced verbatim (plus a short explanation) instead of leaking an
 * RPC stack. Secrets are never put into a message or `cause`.
 */

export type SonataChainErrorCode =
  | "invalid-input"
  | "missing-key"
  | "contract-panic"
  | "rpc";

export class SonataChainError extends Error {
  readonly code: SonataChainErrorCode;
  /** Present when the transaction reached the chain. */
  readonly txHash?: string;
  /** The contract panic string, before the readable explanation. */
  readonly panic?: string;

  constructor(
    code: SonataChainErrorCode,
    message: string,
    options: { txHash?: string; panic?: string } = {},
  ) {
    super(message);
    this.name = "SonataChainError";
    this.code = code;
    this.txHash = options.txHash;
    this.panic = options.panic;
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/** Depth-first string collection over an RPC error/outcome payload. */
function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (out.length > 80 || depth > 8) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return;
  }
  if (!isRecord(value)) return;

  /* `Error.message` is not enumerable, but is usually the useful text. */
  if (typeof value.message === "string") out.push(value.message);

  for (const item of Object.values(value)) {
    collectStrings(item, out, depth + 1);
  }
}

const PANIC_RE = /(?:Smart contract panicked|panicked):\s*(.+)/i;

/** Extracts `"Smart contract panicked: <message>"` from any RPC payload. */
export function extractContractPanic(error: unknown): string | undefined {
  const strings: string[] = [];
  collectStrings(error, strings);

  for (const text of strings) {
    const match = text.match(PANIC_RE);
    if (!match?.[1]) continue;
    const panic = match[1]
      .split("\n")[0]
      ?.replace(/,\s*filename:.*$/, "")
      .trim();
    if (panic) return panic.slice(0, 240);
  }

  return undefined;
}

/** Reads the first line of a non-panic RPC failure for a readable message. */
export function extractRpcMessage(error: unknown): string | undefined {
  const strings: string[] = [];
  collectStrings(error, strings);
  const text =
    strings.find(
      (item) => item.trim().length > 0 && !item.includes("\u0000"),
    ) ?? undefined;
  if (!text) return undefined;
  return text.split("\n")[0]?.trim().slice(0, 240);
}

const PANIC_EXPLANATIONS: Record<string, string> = {
  "Already listed": "this master already has an active listing",
  "Claim in progress": "a withdrawal is already running for this song",
  "Deposit too small": "attach at least the contract's storage deposit",
  "Epoch id mismatch": "the epoch is not the next one to settle",
  "Empty epoch": "an epoch must contain at least one payout entry",
  "Insufficient balance": "the account does not hold enough USDC",
  "Insufficient payment": "the payment amount does not match the price",
  "Invalid token id": "the master token id is not a valid slug",
  "Listing not active": "this listing is no longer active",
  "Max len payout too small": "the royalty split does not fit the payout bound",
  "Not approved": "the seller must approve the market for this master first",
  "Not the owner": "only the current master owner can do this",
  "Not the seller": "only the seller can change this listing",
  "Nothing to withdraw": "this song account has no USDC to withdraw",
  "Only oracle": "only the settlement oracle may do this",
  "Only owner": "only the contract owner may do this",
  "Pass is non-transferable": "passes are permanently bound to the buyer",
  Paused: "the platform is paused",
  "Price must be positive": "the listing price must be greater than zero",
  "Reserve floor": "that withdrawal would breach the artist reserve",
  "Song not registered": "the master has no registered song account",
  "Song already registered": "this master is already registered",
  "The account is not registered":
    "the account is not registered on the USDC contract",
  "Token already exists": "that master token id is already minted",
  "Unsorted entries": "settlement entries must be sorted and unique",
  "Wrong amount": "the payment amount does not match the listing price",
  "Wrong payment token": "the platform only accepts Sonata USDC",
};

function explanationOf(panic: string): string | undefined {
  const exact = PANIC_EXPLANATIONS[panic];
  if (exact) return exact;

  /* near-sdk sometimes appends `: detail` to the frozen panic string. */
  const prefix = Object.keys(PANIC_EXPLANATIONS).find((key) =>
    panic.startsWith(key),
  );
  return prefix ? PANIC_EXPLANATIONS[prefix] : undefined;
}

/**
 * Turns a panic into a readable, user-facing sentence while preserving the
 * contract's exact error string.
 */
export function mapContractError(panic: string): string {
  const clean = panic.trim();
  const explanation = explanationOf(clean);
  return explanation ? `${clean}: ${explanation}.` : clean;
}

/** Converts an arbitrary near-api-js/RPC throw into a `SonataChainError`. */
export function toChainError(
  error: unknown,
  context: string,
): SonataChainError {
  if (error instanceof SonataChainError) return error;

  const panic = extractContractPanic(error);
  if (panic) {
    return new SonataChainError("contract-panic", mapContractError(panic), {
      panic,
    });
  }

  const rpcMessage = extractRpcMessage(error);
  return new SonataChainError(
    "rpc",
    rpcMessage
      ? `NEAR call ${context} failed: ${rpcMessage}`
      : `NEAR call ${context} failed.`,
  );
}
