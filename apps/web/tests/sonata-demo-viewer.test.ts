import { describe, expect, it } from "bun:test";

import {
  DEFAULT_DEMO_VIEWER_ACCOUNT,
  DEMO_VIEWER_ACCOUNTS,
  isDemoViewerAccount,
  parseDemoViewerCookie,
  resolveDemoViewerAccount,
  SONATA_DEMO_VIEWER_COOKIE,
} from "../lib/sonata/demo-viewer";

describe("demo viewer cookie", () => {
  it("uses the documented cookie name", () => {
    expect(SONATA_DEMO_VIEWER_COOKIE).toBe("sonata_demo_viewer");
  });

  it("allows exactly the three demo accounts", () => {
    expect([...DEMO_VIEWER_ACCOUNTS]).toEqual([
      "nadia-sonata.testnet",
      "collector.sonata.testnet",
      "listener.sonata.testnet",
    ]);
  });

  it("parses every allowlisted account", () => {
    for (const account of DEMO_VIEWER_ACCOUNTS) {
      expect(parseDemoViewerCookie(account)).toBe(account);
      expect(isDemoViewerAccount(account)).toBe(true);
    }
  });

  it("trims the cookie value before matching", () => {
    expect(parseDemoViewerCookie("  collector.sonata.testnet\n")).toBe(
      "collector.sonata.testnet",
    );
  });

  it("rejects missing, empty and non-allowlisted values", () => {
    expect(parseDemoViewerCookie(undefined)).toBeNull();
    expect(parseDemoViewerCookie(null)).toBeNull();
    expect(parseDemoViewerCookie("")).toBeNull();
    expect(parseDemoViewerCookie("kofi-sonata.testnet")).toBeNull();
    expect(parseDemoViewerCookie("mira-sonata.testnet")).toBeNull();
    expect(parseDemoViewerCookie("oracle-sonata.testnet")).toBeNull();
    expect(isDemoViewerAccount(42)).toBe(false);
  });

  it("opens as the holder when the cookie is absent or invalid", () => {
    expect(DEFAULT_DEMO_VIEWER_ACCOUNT).toBe("nadia-sonata.testnet");
    expect(resolveDemoViewerAccount(undefined)).toBe("nadia-sonata.testnet");
    expect(resolveDemoViewerAccount("not-a-demo-account")).toBe(
      "nadia-sonata.testnet",
    );
    expect(resolveDemoViewerAccount("listener.sonata.testnet")).toBe(
      "listener.sonata.testnet",
    );
  });
});
