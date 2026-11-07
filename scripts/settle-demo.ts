#!/usr/bin/env bun
/**
 * Aggregate and settle one demo epoch.
 *
 * Usage:
 *   bun run scripts/settle-demo.ts <epochId>
 *
 * Aggregates the rolling seven-day listen window, signs
 * `platform.settle_epoch` with `SONATA_ORACLE_SECRET_KEY`, mirrors the chain
 * epoch + payouts into Postgres, and prints the entries, listen root and tx.
 * The epoch id must be the chain's next epoch id. Nothing is overwritten: an
 * id that already exists in `sonata_epoch` is rejected before the oracle call.
 */
import { existsSync } from "node:fs";

for (const name of [".env.local", ".env"]) {
  if (existsSync(name)) process.loadEnvFile(name);
}

const rawEpochId = process.argv[2];
const epochId = Number(rawEpochId);

if (
  rawEpochId === undefined ||
  !/^\d+$/.test(rawEpochId) ||
  !Number.isSafeInteger(epochId)
) {
  console.error("Usage: bun run scripts/settle-demo.ts <epochId>");
  process.exit(1);
}

const { runDemoSettlement } =
  await import("../apps/web/lib/sonata/settlement-core");

try {
  const result = await runDemoSettlement(epochId);

  console.log(`epoch:            ${result.epoch.id}`);
  console.log(`tx:               ${result.txHash}`);
  console.log(`listen root:      ${result.listenRoot}`);
  console.log(`total seconds:    ${result.totalSeconds}`);
  console.log(
    `effective rate:   ${result.epoch.effectiveRatePerHourUsdc} micro-USDC/hour (${result.epoch.mode})`,
  );
  console.log(`total paid:       ${result.totalPaidUsdc} micro-USDC`);
  console.log(`entries (${result.entries.length}):`);
  for (const entry of result.entries) {
    console.log(`  ${entry.tokenId.padEnd(28)} ${entry.seconds}s`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`settlement failed: ${message}`);
  process.exit(1);
}
