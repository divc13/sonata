import { describe, expect, it } from "bun:test";

import { createClientEnv } from "../src/client";
import { clientSchema } from "../src/schema";
import { createServerEnv } from "../src/server";

describe("clientSchema and NEXT_PUBLIC_APP_URL", () => {
  it("defaults NEXT_PUBLIC_APP_URL to https://infinitunes.rajputhemant.me when unset", () => {
    const env = createClientEnv({
      runtimeEnv: {},
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://infinitunes.rajputhemant.me");
  });

  it("accepts a custom valid NEXT_PUBLIC_APP_URL", () => {
    const env = createClientEnv({
      runtimeEnv: {
        NEXT_PUBLIC_APP_URL: "https://custom.example.com",
      },
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://custom.example.com");
  });

  it("throws validation error when NEXT_PUBLIC_APP_URL is not a valid URL", () => {
    expect(() =>
      createClientEnv({
        runtimeEnv: {
          NEXT_PUBLIC_APP_URL: "not-a-valid-url",
        },
      }),
    ).toThrow("Invalid environment variables");
  });

  it("treats empty string as undefined and falls back to default", () => {
    const env = createClientEnv({
      runtimeEnv: {
        NEXT_PUBLIC_APP_URL: "",
      },
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://infinitunes.rajputhemant.me");
  });

  it("validates direct clientSchema parsing", () => {
    expect(clientSchema.NEXT_PUBLIC_APP_URL.parse(undefined)).toBe(
      "https://infinitunes.rajputhemant.me",
    );
    expect(
      clientSchema.NEXT_PUBLIC_APP_URL.parse("https://music.example.com"),
    ).toBe("https://music.example.com");
    expect(() =>
      clientSchema.NEXT_PUBLIC_APP_URL.parse("invalid-url"),
    ).toThrow();
  });
});

describe("serverSchema and demo mode", () => {
  it("defaults demo mode to false and keeps signer keys optional", () => {
    const env = createServerEnv({ runtimeEnv: {} });

    expect(env.SONATA_DEMO_MODE).toBe("false");
    expect(env.SONATA_DEMO_LISTENER_SECRET_KEY).toBeUndefined();
    expect(env.SONATA_ORACLE_SECRET_KEY).toBeUndefined();
  });

  it("reads demo mode and secret keys without a client prefix", () => {
    const env = createServerEnv({
      runtimeEnv: {
        SONATA_DEMO_MODE: "true",
        SONATA_DEMO_LISTENER_SECRET_KEY: "ed25519:test-only",
      },
    });

    expect(env.SONATA_DEMO_MODE).toBe("true");
    expect(env.SONATA_DEMO_LISTENER_SECRET_KEY).toBe("ed25519:test-only");
  });

  it("rejects a typo instead of guessing at demo mode", () => {
    expect(() =>
      createServerEnv({ runtimeEnv: { SONATA_DEMO_MODE: "yes" } }),
    ).toThrow("Invalid environment variables");
  });
});
