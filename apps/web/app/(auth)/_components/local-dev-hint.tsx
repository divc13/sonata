import { getLocalDevFixture } from "@infinitunes/db/fixtures";

import { localDevLogin } from "~/lib/local-dev-login";

/**
 * Shows the shared local account on the login page, but only when
 * `localDevLogin` confirms the database is loopback and this is not a
 * production build. The credentials are already printed to the dev console
 * (see `logLocalDevLogin`); this makes them discoverable in the browser too.
 */
export function LocalDevHint() {
  const login = localDevLogin(process.env, () => getLocalDevFixture().user);
  if (!login) return null;

  return (
    <div
      data-local-dev-login
      className="rounded-sm border border-dashed border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground"
    >
      <p className="font-semibold text-foreground">Local development account</p>
      <p>
        <code className="font-mono text-foreground">{login.email}</code>
        {" / "}
        <code className="font-mono text-foreground">{login.password}</code>
      </p>
      <p>
        Missing? Run <code className="font-mono">bun run db:seed</code>.
      </p>
    </div>
  );
}
