import { describe, expect, it } from "bun:test";

import { configuredOAuthProviders } from "~/lib/auth-providers";

const both = {
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GITHUB_CLIENT_ID: "github-id",
  GITHUB_CLIENT_SECRET: "github-secret",
};

describe("configuredOAuthProviders", () => {
  it("lists the providers with both credentials set", () => {
    expect(configuredOAuthProviders(both)).toEqual(["google", "github"]);
  });

  it("drops a provider with a missing or empty half", () => {
    expect(
      configuredOAuthProviders({ ...both, GOOGLE_CLIENT_SECRET: undefined }),
    ).toEqual(["github"]);
    expect(configuredOAuthProviders({ ...both, GITHUB_CLIENT_ID: "" })).toEqual(
      ["google"],
    );
  });

  it("is empty when nothing is configured, so no button is offered", () => {
    expect(configuredOAuthProviders({})).toEqual([]);
  });
});
