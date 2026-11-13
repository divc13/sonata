# Sonata

**Every song is an account.**

Sonata is a subscription music player where every master recording is a 1-of-1
NFT that owns its own keyless NEAR account. Listeners pay once for the whole
catalogue. Each verified listening hour pays the song's account a fixed dollar
rate. Sell the master and its account, balance and future income go with it.

> **Status:** NEAR Hackathon 2026 `nfts` submission. The contracts, 12 masters
> and five resale listings are deployed on NEAR testnet, and the listener pass
> is active. The player, pass, artist dashboard, market and audit pages work
> against seeded Postgres history. Read
> [Known limitations](#known-limitations) and
> [`docs/DEMO.md`](docs/DEMO.md) before judging the live money flow.

## The problem

Streaming pays artists a fraction of a cent per stream, pooled and opaque.
Artists cannot see what a listener is worth, cannot sell a recording with its
income history, and cannot hold the asset that actually earns. Listeners rent
access forever and own nothing. The money layer is hidden behind labels and
collection societies.

Sonata makes the master itself the operating asset: a real account with a real
balance, owned by the NFT, earning from a subscription pool, and transferable
with the recording.

## How it works

| Piece            | How it works                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Master**       | One song, one 1-of-1 NFT. No fractions, no editions.                                                      |
| **Song account** | Each master owns `<slug>.masters-sonata.testnet`, a NEAR account with **zero access keys**.               |
| **Pass**         | $5.00 for 30 days of full playback. A non-transferable NFT. The free tier is a 30-second preview.         |
| **Earnings**     | $0.03 per verified listening hour, paid in mock USDC directly to the song account.                        |
| **Cap**          | 4 verified hours per listener per day, across all songs. Owner and creator listens do not earn.           |
| **Withdrawal**   | Only the current master owner can withdraw. The check is on chain at withdrawal time.                     |
| **Resale**       | Fixed price. 5% to the creator, the rest to the seller. The account and its balance move with the master. |
| **Reserve**      | 3-month target, 1-month hard floor. The platform cannot withdraw below it.                                |

The key property: the song account has no keys. It can only pay the current
owner of the master, checked on chain at withdrawal time. A seller cannot keep
the income after a sale.

## Architecture at a glance

```
Browser (Next.js 16 player)
  │  tRPC
  ▼
apps/web ───────────────────────────────┐
  │  Drizzle                           │  server-side demo signers
  ▼                                    ▼
Postgres (catalogue, listens,        NEAR testnet
  epochs, payouts, pass cache)         ├─ masters-sonata.testnet
                                       ├─ platform-sonata.testnet
                                       ├─ market-sonata.testnet
                                       ├─ usdc-sonata.testnet
                                       └─ <slug>.masters-sonata.testnet
Listener heartbeats ──► settlement script / oracle ──► platform.settle_epoch
```

- **Contracts** (`contracts/`): `master-nft` (NEP-171 + song-account factory),
  `song-wallet` (immutable keyless account), `platform` (pass, treasury,
  settlement, reserve), `market` (fixed-price resale + 5% royalty),
  `mock-usdc` (NEP-141, 6 decimals).
- **App** (`apps/web`, `packages/`): the player, pass checkout, artist
  dashboard, market, audit page and the typed `sonata` tRPC router.
- **Oracle / settlement** (`scripts/settle-demo.ts`,
  `apps/web/lib/sonata/settlement-core.ts`): aggregates verified listening,
  computes a listen root, and submits `platform.settle_epoch` with the oracle
  key.

The full money flow, the master-plus-wallet ownership model and the trust
boundaries are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Live on NEAR testnet

| Role                             | Account                    |
| -------------------------------- | -------------------------- |
| Parent / faucet / contract owner | `sonata.testnet`           |
| Master NFT collection            | `masters-sonata.testnet`   |
| Platform / settlement            | `platform-sonata.testnet`  |
| Market                           | `market-sonata.testnet`    |
| Mock USDC (NEP-141)              | `usdc-sonata.testnet`      |
| Listen oracle                    | `oracle-sonata.testnet`    |
| Artist, Nadia Vale               | `nadia-sonata.testnet`     |
| Artist, Kofi Mensah              | `kofi-sonata.testnet`      |
| Artist, Lena Ortiz               | `lena-sonata.testnet`      |
| Listener                         | `listener.sonata.testnet`  |
| Collector                        | `collector.sonata.testnet` |

Song accounts are `<token-id>.masters-sonata.testnet`, for example
`midnight-drive.masters-sonata.testnet`. Each one has zero access keys and the
global `song-wallet` code hash
`2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS`.

Key facts: **12 masters**, **5 active listings**, **$0.03 per verified hour**,
**4 hours/day cap**, **5% creator royalty**, **30-day pass for $5**.

Deployment transactions, code hashes and the exact account balances are in
[`ops/testnet.md`](ops/testnet.md). The read-only chain check is:

```bash
./scripts/check-demo.sh
```

It exits 0 only when the 12 masters, five listings, listener pass and keyless
song accounts match. It needs no keychain and no write access.

## Demo

- **3-minute script:** [`docs/DEMO.md`](docs/DEMO.md) — timed routes, clicks,
  voiceover, terminal proofs and the seeded/live split.
- **Repository:** <https://github.com/divc13/sonata> (public at submission).
- **Demo video:** `<demo-video-url>` (final cut ready locally; publish before the deadline).
- **Live app:** https://sonata-phi-green.vercel.app

The demo is a hybrid, and the documentation says so:

- **Live on testnet:** the contracts, 12 mints, five listings, the listener's
  pass purchase, and every keyless song account.
- **Seeded in Postgres:** the eight past epochs, per-song payouts, trailing
  30-day earnings, the pass row shown in the UI, and the ownership/listing rows
  on the catalogue pages.
- **Wallet-signed live writes:** the hosted app connects a NEAR testnet wallet
  (Meteor Wallet; MyNearWallet is still listed as a legacy fallback). The wallet
  buys the pass, buys a master, lists and withdraws as the current owner. A
  one-time 25 testnet USDC faucet funds the wallet.
  `SONATA_DEMO_MODE=false` on the hosted deployment, so no public caller can
  act as the seeded listener, collector, Nadia or oracle. Writes are mirrored
  back into Postgres by the wallet sync procedures; see
  [Known limitations](#known-limitations).

A judge can verify the chain half without any of the app's seed data:

```bash
./scripts/check-demo.sh
```

## Quickstart

Prerequisites: [Bun](https://bun.sh) 1.4.4, Docker, and Rust with the
`wasm32-unknown-unknown` target for contracts.

```bash
bun install
cp .env.example .env.local

# Local Postgres from docker-compose.yml:
# DATABASE_URL=postgres://postgres:postgrespassword@127.0.0.1:5432/local_platforms
# AUTH_SECRET=<at least 32 characters>

bun run db:up
bun run db:migrate
bun run db:seed
bun run dev
```

Open <http://localhost:3000>. Local credentials: `local@example.test` /
`LocalDev123!`.

The seeded catalogue and history render without any NEAR keys. The hosted flow
uses a connected NEAR testnet wallet (Meteor Wallet; MyNearWallet remains a
legacy fallback) and a one-time 25 testnet USDC faucet. To enable the faucet
locally, set `SONATA_FAUCET_SECRET_KEY` (the collector testnet key) and
`SONATA_FAUCET_ACCOUNT_ID=collector.sonata.testnet`.
Never commit secrets. The old server-signed demo roles are for the recorded
video/admin tooling only; set `SONATA_DEMO_MODE=true` locally if you need them.
If you only need source compilation, `SKIP_ENV_VALIDATION=true` skips the env
schema.

To deploy and verify the contracts:

```bash
cargo build --manifest-path contracts/Cargo.toml --workspace \
  --target wasm32-unknown-unknown --release
scripts/deploy-testnet.sh
scripts/deploy-platform-market.sh
scripts/mint-demo.sh
scripts/check-demo.sh
```

The scripts are idempotent: existing code is verified, not redeployed, and
existing masters, listings and passes are skipped. They need macOS keychain
signing and a TTY; see [`ops/testnet.md`](ops/testnet.md) for the exact CLI
quirks.

## Tests and quality gates

Run from the repository root:

```bash
bun run fmt:check      # formatting
bun run lint           # Oxlint
bun run type-check     # TypeScript
bun run test           # plain, mocked and DOM suites
bun run build          # production build
```

Contracts:

```bash
cargo test --manifest-path contracts/Cargo.toml --workspace
cargo fmt --manifest-path contracts/Cargo.toml --all -- --check
```

Chain demo:

```bash
./scripts/check-demo.sh
```

Settlement (see the precondition in [`docs/DEMO.md`](docs/DEMO.md)):

```bash
bun run scripts/settle-demo.ts <epoch>
```

## Repository layout

```
apps/web/           Next.js player, pass, dashboard, market, audit
packages/           auth, db, env, near, trpc, types, ui
contracts/          master-nft, song-wallet, platform, market, mock-usdc
scripts/            deploy, mint/list, check, settle
ops/                testnet identifiers and deployment record
specs/              normative spec pack
docs/               architecture, demo, submission, design system
```

There is no `services/` directory in this build; the settlement orchestration
lives in `apps/web/lib/sonata` and is invoked by `scripts/settle-demo.ts`.

## Read the specs

The build is spec-driven. The contracts, events, errors and money formulas in
`specs/02-contracts.md` and `specs/03-accounting.md` are frozen interfaces.

- [`specs/00-product.md`](specs/00-product.md) — product, users, non-goals.
- [`specs/01-architecture.md`](specs/01-architecture.md) — system shape.
- [`specs/02-contracts.md`](specs/02-contracts.md) — method names, events, errors.
- [`specs/03-accounting.md`](specs/03-accounting.md) — payout math and worked examples.
- [`specs/04-threat-model.md`](specs/04-threat-model.md) — what can go wrong.
- [`specs/05-design.md`](specs/05-design.md) — brand, screens, copy, UI rules.
- [`specs/06-demo.md`](specs/06-demo.md) — seed data and the demo narrative.
- [`specs/07-tasks.md`](specs/07-tasks.md) — workstreams and acceptance criteria.
- [`specs/decisions.md`](specs/decisions.md) — the decision log.

## Known limitations

These are the honest boundaries of the hackathon build. Details and evidence
are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#what-is-not-in-this-build)
and [`docs/SUBMISSION.md`](docs/SUBMISSION.md#known-limitations).

- **Testnet only, mock USDC.** No real funds, no mainnet, no fiat on-ramp.
- **No event indexer.** Successful chain writes are not mirrored into
  Postgres, so the UI keeps the seeded owner, listing and pass rows until an
  indexer lands. The chain is authoritative.
- **Seeded earnings history.** The eight epochs, payouts, charts and the pass
  receipt are seeded. The contracts and the 12 masters, five listings and pass
  purchase are live testnet state.
- **Epoch base and demo history.** Real epoch ids start at `1`: the deployed
  platform initializes `next_epoch_id = 1` and there is no epoch 0. As of
  2026-11-08 the chain has settled no epochs; Postgres seeds its demo history at
  negative ids (`-1`…`-8`), so a seeded row can never collide with a chain id.
  A live settlement needs a fresh chain and database, or a deliberate reset.
  `docs/DEMO.md` explains the exact command and precondition.
- **Wallet connect is testnet-only.** The hosted app leads with Meteor Wallet on
  NEAR testnet (MyNearWallet is kept as a legacy fallback) and a one-time 25
  USDC faucet. The server-side demo signers remain for the recorded video and
  oracle-only settlement, but `SONATA_DEMO_MODE=false` is set on Vercel so
  public callers cannot use them. This is not mainnet key management.
- **Publishing is not self-serve yet.** The 12 masters were minted by
  `scripts/mint-demo.sh`; the dashboard labels publishing as opening after the
  hackathon instead of showing a fake wizard.
- **The dashboard range pills are display-only.** Market sort/filter controls
  are wired; the artist chart range selector is not.
- **Rejected withdrawals are logged, not thrown.** The song wallet logs
  `Withdraw rejected: …` and the transaction succeeds; the UI does not parse
  the log. The demo proves the old-owner block with the log and the unchanged
  balance, not the toast.
- **The audit page is a ledger view.** It shows the epoch table and payouts; the
  listen root is a short hash with the full value on hover. There is no
  published bundle file or reserve bar in this build; reserve values are on
  chain.
- **Not audited.** This is a hackathon build, not production-audited code.

## Built on Infinitunes

Sonata reuses the Infinitunes music player (MIT) by Hemant Rajput for its shell,
design system, auth, and data tooling. The catalogue, podcasts, radio, shows,
mixes and AI assistant are replaced. See [`NOTICE`](NOTICE) and
[`LICENSE`](LICENSE).

## License

MIT. See [`LICENSE`](LICENSE).
