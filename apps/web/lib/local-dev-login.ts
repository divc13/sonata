import { getLocalDevFixture } from "@infinitunes/db/fixtures";
import { isLocalDatabase } from "@infinitunes/db/local-guard";

type LoginUser = { email: string; password: string };

export type LocalDevLogin = { email: string; password: string };

/**
 * The shared local user's credentials, or null unless DATABASE_URL is loopback
 * and NODE_ENV is not production. `getUser` is only called once the guard
 * passes, so a remote database never reads the fixture.
 */
export function localDevLogin(
  env: { DATABASE_URL?: string; NODE_ENV?: string },
  getUser: () => LoginUser,
): LocalDevLogin | null {
  if (!env.DATABASE_URL || !isLocalDatabase(env.DATABASE_URL, env.NODE_ENV)) {
    return null;
  }
  const { email, password } = getUser();
  return { email, password };
}

/** The dev-server console hint for the shared local user. */
export function localDevLoginMessage(
  env: { DATABASE_URL?: string; NODE_ENV?: string },
  getUser: () => LoginUser,
): string | null {
  const login = localDevLogin(env, getUser);
  if (!login) return null;
  return `[local-dev] Sign in with ${login.email} / ${login.password} (run \`bun run db:seed\` first if the account does not exist)`;
}

export function logLocalDevLogin() {
  try {
    const message = localDevLoginMessage(
      process.env,
      () => getLocalDevFixture().user,
    );
    if (message) console.log(message);
  } catch (error) {
    console.warn("[local-dev] Could not read the local user fixture:", error);
  }
}
