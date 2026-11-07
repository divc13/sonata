/** OAuth providers the app can actually start a sign-in with. */
export const OAUTH_PROVIDERS = ["google", "github"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Just the credential keys, so tests can pass a plain object. */
type OAuthEnv = Record<string, string | undefined>;

/**
 * The providers with both credentials set. `createAuth` only registers these,
 * so the auth forms must not offer a button for a provider that would fail
 * with "Provider not found". Pass an env object in tests.
 */
export function configuredOAuthProviders(
  env: OAuthEnv = process.env,
): OAuthProvider[] {
  const providers: OAuthProvider[] = [];

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push("google");
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.push("github");
  }

  return providers;
}
