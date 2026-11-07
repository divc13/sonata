import { afterEach, describe, expect, it } from "bun:test";

import {
  DEMO_SIGNER_ENV,
  getDemoAccount,
  getDemoSigner,
  SonataChainError,
} from "../src";

const ENV_VARS = Object.values(DEMO_SIGNER_ENV);
const saved = new Map(ENV_VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of ENV_VARS) {
    const value = saved.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("demo accounts", () => {
  it("maps every role to its testnet account id", () => {
    expect(getDemoAccount("listener")).toMatchObject({
      accountId: "listener.sonata.testnet",
      secretKeyEnv: "SONATA_DEMO_LISTENER_SECRET_KEY",
    });
    expect(getDemoAccount("collector").accountId).toBe(
      "collector.sonata.testnet",
    );
    expect(getDemoAccount("oracle").accountId).toBe("oracle-sonata.testnet");
    expect(getDemoAccount("nadia").accountId).toBe("nadia-sonata.testnet");
  });

  it("resolves a configured key without exposing its environment name only on error", () => {
    process.env.SONATA_DEMO_LISTENER_SECRET_KEY = "ed25519:test-only";

    expect(getDemoSigner("listener")).toMatchObject({
      accountId: "listener.sonata.testnet",
      secretKey: "ed25519:test-only",
    });
  });

  it("names the missing variable, never a partial key", () => {
    delete process.env.SONATA_DEMO_COLLECTOR_SECRET_KEY;

    try {
      getDemoSigner("collector");
      throw new Error("expected getDemoSigner to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SonataChainError);
      expect((error as SonataChainError).code).toBe("missing-key");
      expect((error as Error).message).toContain(
        "SONATA_DEMO_COLLECTOR_SECRET_KEY",
      );
      expect((error as Error).message).not.toContain("ed25519");
    }
  });
});
