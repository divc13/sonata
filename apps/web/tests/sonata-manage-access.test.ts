import { describe, expect, it } from "bun:test";

import {
  canManageMaster,
  normalizeAccountId,
} from "../lib/sonata/manage-access";
import { demoRoleForOwner } from "../lib/sonata/market";

describe("manage access decision", () => {
  it("grants the manage view only to the current owner", () => {
    expect(
      canManageMaster("nadia-sonata.testnet", "nadia-sonata.testnet"),
    ).toBe(true);
    expect(
      canManageMaster("collector.sonata.testnet", "nadia-sonata.testnet"),
    ).toBe(false);
    expect(
      canManageMaster("listener.sonata.testnet", "nadia-sonata.testnet"),
    ).toBe(false);
  });

  it("compares account ids case-insensitively and trims them", () => {
    expect(
      canManageMaster(" Nadia-Sonata.Testnet ", "nadia-sonata.testnet"),
    ).toBe(true);
    expect(normalizeAccountId("  NADIA-sonata.testnet ")).toBe(
      "nadia-sonata.testnet",
    );
  });

  it("never grants access to an empty viewer account", () => {
    expect(canManageMaster("", "nadia-sonata.testnet")).toBe(false);
    expect(canManageMaster("   ", "nadia-sonata.testnet")).toBe(false);
    expect(canManageMaster("", "")).toBe(false);
  });
});

describe("owner account -> demo role", () => {
  it("maps Nadia and Collector to their demo signers", () => {
    expect(demoRoleForOwner("nadia-sonata.testnet")).toBe("nadia");
    expect(demoRoleForOwner("collector.sonata.testnet")).toBe("collector");
  });

  it("has no signer for listener or the other demo artists", () => {
    expect(demoRoleForOwner("listener.sonata.testnet")).toBeNull();
    expect(demoRoleForOwner("kofi-sonata.testnet")).toBeNull();
    expect(demoRoleForOwner("lena-sonata.testnet")).toBeNull();
  });
});
