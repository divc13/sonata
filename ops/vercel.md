# Vercel deployment runbook

Status: **prepared, not deployed.** This file is the source of truth for project
settings and the environment checklist. The production URL is not known yet; every
command below uses `$APP` or `https://<project>.vercel.app` as a placeholder. Record
the real URL in `docs/SUBMISSION.md` only after the first successful deploy.

Repository: Bun workspaces + Turborepo, Next.js 16 app at `apps/web`, Postgres schema
in `packages/db`, auth in `packages/auth`. `vercel.json` only adds the Next.js preset,
the frozen-lockfile install and the existing git gating (`main`/`master` deploy; every
other branch, including `ws/vercel-prep`, is disabled).

## 1. What Vercel is (and is not)

- Vercel runs the Next.js app as serverless functions and static output. It has **no
  persistent local disk**: anything written under `/tmp` disappears with the instance,
  and nothing written at runtime survives a request.
- Postgres is **not** on the deployment. Use a managed database through the Vercel
  Marketplace (Neon) or an external Neon/Supabase project. "Vercel Postgres" is that
  managed integration, not storage attached to the function.
- The demo audio and covers are committed under `apps/web/public/demo` (about 18 MB)
  and ship with the static deployment. No external media host is required.
- The seeded Sonata dataset is tiny (12 songs, 8 demo epochs, ~96 payouts, 5 active
  listings, one pass): well under 5 MB. Neon's free 0.5 GB storage is ample. The
  **500 MB figure is database storage**, not Vercel function disk.

## 2. Vercel project settings (exact)

Import the repository once, then set:

| Setting                                     | Value                                      | Why                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Root Directory                              | `apps/web`                                 | The Next.js app; the repo root is a Bun workspace, not an app.                                                                                 |
| Framework Preset                            | `Next.js`                                  | Vercel's Next.js builder, functions, image and cache handling.                                                                                 |
| Install Command                             | `bun install --frozen-lockfile`            | One root `bun.lock`; reproducible workspace install.                                                                                           |
| Build Command                               | `bun run build`                            | Runs `apps/web`'s script (`next build`) with Vercel's env.                                                                                     |
| Output Directory                            | leave empty / default (`.next`)            | The Next.js preset owns this; do not guess a path.                                                                                             |
| Include source files outside Root Directory | **On**                                     | `packages/*` and `local-dev/fixtures.json` live outside `apps/web`. Vercel normally auto-enables this for a detected workspace, but verify it. |
| Node.js Version                             | `22.x`                                     | Next.js 16 requires Node >= 20.9; 22 is the supported LTS line.                                                                                |
| Bun Version                                 | `1.4.x` (from `packageManager: bun@1.4.4`) | `bun.lock` is the source of truth; do not mix package managers.                                                                                |
| Production Branch                           | `main`                                     | `vercel.json` also blocks all other branches.                                                                                                  |
| Function Region                             | same region as the database                | Serverless queries are latency-bound; keep them co-located.                                                                                    |
| Build Machine                               | default                                    | The build is small; no extra memory needed.                                                                                                    |

Do not set a custom `distDir` or `output: "standalone"`. Do not put a Root Directory
in `vercel.json` (it is a project setting, not a repo setting).

### Monorepo working directory (verified)

Vercel's build documentation says the install path is set by the Root Directory, so
these commands are expected to run with `apps/web` as the working directory. That is
safe even though the only `bun.lock` is at the repository root: Bun walks up to the
workspace root, installs `apps/web`'s dependencies, its workspace-package
dependencies, and the root devDependencies (including `turbo`).

Verified in a clean checkout with no `node_modules` (not just in the existing local
tree):

| Command (working directory `apps/web`) | Result                                                              |
| -------------------------------------- | ------------------------------------------------------------------- |
| `bun install --frozen-lockfile`        | 594 packages installed; root `node_modules/turbo` present           |
| `bun run build`                        | success: 54 pages, `ƒ Proxy (Middleware)`, `.next/BUILD_ID` written |
| `bun install --filter web --dry-run`   | success (Vercel's own filtered-install example)                     |

The same `bun run build` also succeeds when run from the repository root (it runs the
root `build` script through Turbo). That is why the settings above use **no `cd`**:
the commands work whether Vercel executes them in `apps/web` or at the repo root.

If you prefer the explicit repo-root form, it is:

```bash
# only valid when the working directory is apps/web
cd ../.. && bun install --frozen-lockfile
cd ../.. && bun run build --filter=@infinitunes/web
```

That form is **not recommended**: it works when Vercel uses the Root Directory as the
working directory, but fails if Vercel executes at the repo root (`cd ../..` leaves
the checkout). Vercel's Turborepo guide lists both `turbo run build` (no `cd`) and the
explicit `cd ../..` form; the no-`cd` form is the one that does not depend on the
working directory, because automatic workspace scoping infers the app from the Root
Directory.

The dashboard values in the table are authoritative. The repo-root `vercel.json`
repeats the install/build commands and the git gate as a fallback. Vercel documents
file-based project configuration in the project's root directory, so if build
settings are ever moved into a file, put them in `apps/web/vercel.json` and confirm
they appear in the build log; do not rely on the repo-root file for build overrides.

`proxy.ts` is Next 16 middleware (the file was renamed from `middleware.ts`). It runs
on the Node runtime; no Edge runtime flag is needed. A successful build prints
`ƒ Proxy (Middleware)`.

## 3. Environment variables

All values are set in **Project → Settings → Environment Variables**, scoped to
**Production**. Use `ops`' secret store or the local `.env.local` as the source; never
commit a value. Everything except `NEXT_PUBLIC_APP_URL` is server-only: **never add a
`NEXT_PUBLIC_` prefix to a secret or a signer key**.

| Name                                                                                                | Required                      | Used at                     | Where to get it                                                                                     | Exposure                         |
| --------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| `DATABASE_URL`                                                                                      | **yes**                       | build + runtime             | Marketplace Neon integration, or Neon/Supabase **pooled** connection string with `?sslmode=require` | server only                      |
| `AUTH_URL`                                                                                          | **yes**                       | build + runtime             | `https://<project>.vercel.app` (exact origin, no trailing slash)                                    | server only                      |
| `AUTH_SECRET`                                                                                       | **yes in production**         | runtime                     | `openssl rand -base64 32`                                                                           | server only                      |
| `NEXT_PUBLIC_APP_URL`                                                                               | **yes**                       | build (baked)               | same URL as `AUTH_URL`                                                                              | public by design; never a secret |
| `JIOSAAVN_DES_KEY`                                                                                  | **yes**                       | runtime (playback)          | the value already used by the upstream Infinitunes `.env` / owner's secret store                    | server only                      |
| `SONATA_DEMO_MODE`                                                                                  | **yes for the demo** (`true`) | runtime                     | literal `true`; leave `false` for a hardened deployment                                             | server only                      |
| `SONATA_DEMO_LISTENER_SECRET_KEY`                                                                   | **yes if demo mode**          | runtime                     | local ops store / NEAR testnet credentials                                                          | server only                      |
| `SONATA_DEMO_COLLECTOR_SECRET_KEY`                                                                  | **yes if demo mode**          | runtime                     | local ops store / NEAR testnet credentials                                                          | server only                      |
| `SONATA_ORACLE_SECRET_KEY`                                                                          | **yes if demo mode**          | runtime (settlement)        | local ops store / NEAR testnet credentials                                                          | server only                      |
| `SONATA_NADIA_SECRET_KEY`                                                                           | **yes if demo mode**          | runtime                     | local ops store / NEAR testnet credentials                                                          | server only                      |
| `SONATA_NEAR_RPC_URL`                                                                               | optional                      | runtime                     | default `https://rpc.testnet.fastnear.com`; override only if it throttles                           | server only                      |
| `BETTER_AUTH_URL`                                                                                   | optional alias                | runtime                     | same origin as `AUTH_URL`; if set it wins                                                           | server only                      |
| `BETTER_AUTH_SECRET`                                                                                | optional alias                | runtime                     | random; if set it overrides `AUTH_SECRET`                                                           | server only                      |
| `BETTER_AUTH_RP_ID`                                                                                 | optional                      | runtime                     | hostname only, e.g. `sonata-demo.vercel.app`; omit to derive it                                     | not secret                       |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                                         | optional                      | runtime                     | Google Cloud Console OAuth client                                                                   | server only                      |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`                                                         | optional                      | runtime                     | GitHub OAuth App                                                                                    | server only                      |
| `RESEND_API_KEY` / `EMAIL_FROM`                                                                     | optional                      | runtime                     | Resend API key and a verified sender                                                                | server only                      |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`                                               | optional                      | runtime                     | Upstash Redis; required if rate limiting is on                                                      | server only                      |
| `ENABLE_RATE_LIMITING`                                                                              | optional                      | runtime                     | `true` recommended with Upstash                                                                     | server only                      |
| `TRUSTED_PROXY`                                                                                     | optional                      | runtime                     | `vercel` to pin what Vercel already auto-detects                                                    | server only                      |
| `RATE_LIMITING_REQUESTS_PER_SECOND`                                                                 | optional                      | runtime                     | default `50`                                                                                        | server only                      |
| `UMAMI_WEBSITE_ID`                                                                                  | optional                      | runtime                     | Umami analytics                                                                                     | not secret                       |
| `SONATA_MASTERS_ID`, `SONATA_PLATFORM_ID`, `SONATA_MARKET_ID`, `SONATA_USDC_ID`, `SONATA_ORACLE_ID` | optional                      | runtime                     | defaults in `packages/near/src/config.ts`; see `ops/testnet.md`                                     | not secret                       |
| `PINATA_JWT` / `PINATA_GATEWAY`                                                                     | not needed at runtime         | offline upload scripts only | Pinata                                                                                              | server only                      |

Notes:

- `NODE_ENV` is set by Vercel; do **not** add it manually.
- `NEXT_PUBLIC_*` values are compiled into the client at build time. Changing
  `NEXT_PUBLIC_APP_URL` requires a **new deployment**, not just an env edit.
- OAuth is optional at build time. Set either both halves of a provider or neither:
  `/login` hides a provider without credentials, and dummy values produce broken
  buttons. Callback URLs are `https://<project>.vercel.app/api/auth/callback/google`
  and `.../github`.
- `AUTH_URL` must be the exact browser origin. A mismatch is rejected by Better Auth
  as `403 INVALID_ORIGIN` on sign-in (verified locally with a wrong port).
- Set the same value for `AUTH_URL` and `NEXT_PUBLIC_APP_URL`. Do not leave the
  schema default (`infinitunes.rajputhemant.me`) or `localhost`.

Run the name-only preflight before touching the dashboard or after any env change,
with the production values exported in the current shell:

```bash
bash scripts/check-vercel-env.sh
```

Running it against the local `.env` is expected to fail the localhost checks; that is
the point. To exercise the table without production values, export obvious
placeholders — never real secrets — and expect the shape checks to pass or fail on
those placeholders.

It prints a PASS/FAIL table, checks that `NEXT_PUBLIC_APP_URL` (and `AUTH_URL`) is
`https://` and not localhost, warns on a local `DATABASE_URL`, requires the four signer
keys when demo mode is on, and fails if any `NEXT_PUBLIC_*SECRET*`-style name exists.
It never prints a value.

## 4. Postgres setup

### 4.1 Create the database

Preferred: **Vercel Marketplace → Neon** (Storage tab), in the same region as the
functions. The integration injects the connection variables into the project. If
Marketplace is not available on the plan, create a Neon or Supabase project directly
and paste its connection strings into the env table.

- **App runtime** uses the **pooled** connection string: Neon host contains `-pooler`;
  Supabase uses the pooler port `6543`. Keep `?sslmode=require`.
- **Migrations and seeding** use the **unpooled/direct** URL: Neon host without
  `-pooler`; Supabase port `5432`. This avoids transaction-pooler restrictions.
- `packages/db/src/client.ts` sets `prepare: false`, so the pooled URL works with
  transaction-mode poolers (Neon PgBouncer, Supabase Supavisor). Keep one connection
  per serverless instance (`max: 1`) as it is.
- Do not use `localhost`/Docker Postgres in the deployment env. Vercel cannot reach it.

### 4.2 Migrate and seed (from your workstation, once)

Never commit the URL, never paste it into a ticket, and do not add it to `.env` for
this step. Export it in a throwaway shell; an exported variable wins over the files
that the scripts load.

```bash
# Direct/unpooled URL for DDL. Quote it; it contains ? and &.
export DATABASE_URL_UNPOOLED='postgresql://...@.../sonata?sslmode=require'

bun run db:migrate

# db:seed refuses non-loopback hosts by design. This opt-in is only for a hosted
# demo database and only from a workstation; do NOT set it in Vercel.
SONATA_SEED_ALLOW_REMOTE=true bun run db:seed

unset DATABASE_URL_UNPOOLED
```

`db:seed` never runs with `NODE_ENV=production` and never rewinds indexer-written
rows. It is idempotent, so re-running it is safe.

Verify the seed before deploying (the first build prerenders database-backed pages):

```bash
psql "$DATABASE_URL_UNPOOLED" -Atc 'select count(*) from sonata_song;'                 # 12
psql "$DATABASE_URL_UNPOOLED" -Atc 'select count(*) from sonata_listing where active;' # 5
psql "$DATABASE_URL_UNPOOLED" -Atc 'select count(*) from sonata_epoch where id < 0;'   # 8
```

If `psql` is unavailable, the post-deploy tRPC check below returns
`"songsCount":12,"activeListings":5` from the same rows.

Seeded demo rows describe a chain snapshot. A live sale or settlement changes the
chain and not the seeded history; do not re-seed to "fix" a chain mismatch.

### 4.3 Sizing

| Item                                                         | Size                                      |
| ------------------------------------------------------------ | ----------------------------------------- |
| 12 songs + covers/audio static files                         | ~18 MB in the deployment, not in Postgres |
| 12 song rows, 5 listings, 8 demo epochs, ~96 payouts, 1 pass | < 5 MB                                    |
| Neon free storage / Supabase free storage                    | 0.5 GB / 500 MB                           |
| Vercel function filesystem                                   | ephemeral, not a database                 |

The demo fits the free tier with room to spare. Monitor the database only if a public
link accepts many live listen events.

## 5. Auth

- **URL**: `AUTH_URL=https://<project>.vercel.app` (exact origin, no trailing slash).
  Fallback exists (`VERCEL_PROJECT_PRODUCTION_URL`), but setting it explicitly avoids
  preview/production surprises.
- **Secret**: `AUTH_SECRET=$(openssl rand -base64 32)`. Set it once; changing it signs
  every session out. `BETTER_AUTH_SECRET` takes precedence if also set, so leave it
  unset unless you have a reason.
- **Demo login for judges**: after the seed, the canonical local user exists in the
  hosted database:
  - email `local@example.test`
  - password `LocalDev123!`
    The in-page "local development account" hint is intentionally hidden on a remote
    database, so put these credentials in the submission notes, not on `/login`.
- **OAuth (optional)**: set both halves for Google and/or GitHub and register the
  callback URLs above. Without credentials, the buttons are not rendered.
- **Passkeys**: the RP ID is derived from `AUTH_URL`'s hostname (or
  `BETTER_AUTH_RP_ID`). Vercel serves HTTPS, so they work without extra config.
- **Password reset (optional)**: without `RESEND_API_KEY` and `EMAIL_FROM`,
  production cannot send mail; the endpoint still answers generically. Judges only
  need the demo password login.

## 6. Demo mode and security

- `SONATA_DEMO_MODE=true` is for **NEAR testnet only**. It is the gate on every money
  mutation (`pass.buy`, `market.buy`, `market.list`, `songs.withdraw`, `epochs.settle`,
  demo `listen.record`). Leave it `false` for any deployment without the testnet
  signers.
- The four `SONATA_*_SECRET_KEY` values are ed25519 keys for the testnet accounts
  `listener`, `collector`, `oracle` and `nadia`. They can spend **testnet mock USDC**
  and move **testnet NFTs**. They are not mainnet credentials, and they must never be
  prefixed with `NEXT_PUBLIC_` or serialized into a response.
- Anyone with the URL can use the demo. If the link must not be writable by strangers,
  turn on **Deployment Protection → Vercel Authentication** (all plans) or
  **Password Protection** (plan-dependent) before sharing it. Share the access
  instructions, not a bare URL.
- With a public link, expect a judge to buy a pass, buy a master or settle an epoch.
  That is testnet state; use a disposable chain/database for a recording that needs
  pristine data.
- Recommended hardening for a public demo: `ENABLE_RATE_LIMITING=true` plus Upstash
  credentials; Vercel is auto-detected as the trusted proxy, or pin
  `TRUSTED_PROXY=vercel`.
- Do not describe the deployment as mainnet-ready. The signer model is a demo
  convenience, not production key management.

## 7. Deploy order

1. Create the database and copy the pooled/unpooled URLs.
2. Run migrations and the seed against the hosted database (§4.2).
3. Add the Production env vars (§3) and run the preflight. Make sure the project's
   Root Directory and the include-files setting are correct (§2).
4. Merge the intended commit to `main`. `vercel.json` deploys only `main`/`master`,
   so `ws/vercel-prep` cannot deploy by accident. This worktree does not deploy.
5. Watch the first build. It validates env at `next build`, compiles the Next.js app
   and prerenders DB-backed shells, so the database must already be reachable and
   seeded. Expected output includes `ƒ Proxy (Middleware)` and 54 static pages.
6. Open the deployment URL and run §8. Only then record the URL in
   `docs/SUBMISSION.md`.

A build failure that names missing env is a dashboard value missing (or scoped to the
wrong environment). `SKIP_ENV_VALIDATION=true` is for source-only CI and is **not** a
production setting.

## 8. Post-deploy smoke test

Set `APP` to the real origin (no trailing slash), then run:

```bash
APP='https://<project>.vercel.app'

for path in / /market /master/midnight-drive /pass /audit /library \
            /artist/dashboard '/search?q=midnight' /login; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$APP$path")
  printf '%-28s %s\n' "$path" "$code"
done
```

Expected: every line `200`. `/library` and `/artist/dashboard` render their signed-out
shell without a session, so the login check below is what proves authentication.

### 8.1 Read-only tRPC

```bash
curl -fsS "$APP/api/trpc/sonata.stats.overview" \
  | jq -c '.result.data.json'
```

Expected JSON includes `"activeListings":5,"songsCount":12` (field order may vary).
`totalPaidUsdc`/`totalSeconds` come from the seeded demo history and need not match
the chain. A 500 here usually means `DATABASE_URL` is wrong or migrations did not run.

### 8.2 Demo login

```bash
curl -fsS -c /tmp/sonata.cookies -X POST "$APP/api/auth/sign-in/email" \
  -H 'content-type: application/json' -H "origin: $APP" \
  -d '{"email":"local@example.test","password":"LocalDev123!"}' \
  | jq -r '.user.email'          # local@example.test

curl -fsS -b /tmp/sonata.cookies "$APP/api/auth/get-session" \
  | jq -r '.user.email'          # local@example.test

curl -fsS -b /tmp/sonata.cookies "$APP/library" | grep -q 'local@example.test' \
  && echo 'library session OK'
```

A `403 INVALID_ORIGIN` means `AUTH_URL` is not exactly `$APP` (check scheme, host and
port). A 401/500 means the seed user or `AUTH_SECRET` is missing.

### 8.3 Optional testnet mutation (caution)

Only after the read-only checks pass, and only on a deployment you are willing to
change. This spends 5 testnet mock USDC and writes a pass for
`listener.sonata.testnet`:

```bash
curl -fsS -X POST "$APP/api/trpc/sonata.pass.buy?batch=1" \
  -H 'content-type: application/json' -H "origin: $APP" \
  -d '{"0":{"json":{"role":"listener"}}}' \
  | jq -c '.[0].result.data.json'
```

- Requires `SONATA_DEMO_MODE=true` and `SONATA_DEMO_LISTENER_SECRET_KEY`.
- A `403` means demo mode is off (expected on a hardened deployment).
- If an active pass exists, the contract can reject the purchase; that is a safe
  failure, not a deployment bug.
- Record the returned `txHash` and check it on a **testnet** explorer. Never run this
  against mainnet.
- Do **not** use `market.buy` or `epochs.settle` as a smoke test on the deployment you
  will record: they move ownership/settlement state and cannot be undone by re-seeding.

If any chain write must be avoided entirely, use the demo `listen.record` mutation
instead (database-only): same endpoint shape, input
`{"role":"listener","tokenId":"midnight-drive","seconds":60,"startedAt":<unix>,"clientEventId":"smoke-<unix>"}`.

## 9. Troubleshooting

| Symptom                                          | Likely cause                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Build fails with `Invalid environment variables` | A required name is missing from the Production scope, or `NODE_ENV` was set manually. |
| Build cannot resolve `@infinitunes/*`            | Include-files-outside-root is off, or Root Directory is not `apps/web`.               |
| `Can't reach database server` at build/runtime   | `DATABASE_URL` is localhost, paused, or the function/database regions differ.         |
| `prepared statement already exists`              | A custom client dropped `prepare: false` or is using a session pooler incorrectly.    |
| Sign-in `403 INVALID_ORIGIN`                     | `AUTH_URL` does not exactly match the browser origin.                                 |
| Demo actions `403`                               | `SONATA_DEMO_MODE` is not `true`, or the matching signer key is absent.               |
| Pass button missing                              | The provider has only one of its two credentials (by design).                         |
| Reset email never arrives                        | No `RESEND_API_KEY`/`EMAIL_FROM`; expected on a password-only demo.                   |
| Empty market/audit on the hosted DB              | Migrations/seed ran against a different database than `DATABASE_URL`.                 |

## 10. What this runbook does not do

- It does not deploy, create a project, create a database, or write any secret.
- It does not change the chain: no mint, listing, sale, pass or settlement.
- It does not make the demo mainnet-ready or audited.
