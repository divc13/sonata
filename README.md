# Sonata

**Every song is an account.**

Sonata is a subscription music platform where every master recording is a 1-of-1 NFT that owns its
own keyless NEAR account. Listeners pay once per month for the whole catalog. Artists are paid a
fixed dollar rate for every verified listening hour, directly into the song's account. The master can
be sold, and its account, balance, and future income go with it.

> **Status:** NEAR Hackathon 2026 `nfts` build in progress. The spec pack is complete and the
> Infinitunes shell is imported. Contracts, Sonata data, and the new UI are being built against
> `specs/`. This README will be updated with the live demo, contract addresses, and video before the
> submission deadline (2026-11-14 23:59 UTC).

## The model

| Piece            | How it works                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Master**       | One song, one 1-of-1 NFT. No fractions, no editions.                                       |
| **Song account** | Each master owns `<slug>.masters.sonata.testnet`, a NEAR account with no keys.             |
| **Pass**         | $5 for 30 days of unlimited listening. A non-transferable NFT.                             |
| **Earnings**     | $0.03 per verified listening hour, paid in USDC directly to the song account.              |
| **Cap**          | 4 verified hours per listener per day. Self-listens do not earn.                           |
| **Reserve**      | The platform holds a 3-month reserve and cannot withdraw below it.                         |
| **Resale**       | Fixed price. 5% to the creator, the rest to the seller. The account moves with the master. |

The key property: the song account has no access keys. It can only pay the current owner of the
master, checked on chain at withdrawal time. A seller cannot keep the income after a sale.

## Demo parameters

| Parameter  | Value                                                           |
| ---------- | --------------------------------------------------------------- |
| Pass       | $5.00 / 30 days                                                 |
| Rate `R`   | $0.03 per verified hour                                         |
| Daily cap  | 4 hours                                                         |
| Reserve    | 3 months target, pro-rata below 1 month                         |
| Royalty    | 5% to the creator                                               |
| Settlement | USDC on NEAR testnet, weekly in production, manual for the demo |

## Read the specs

The build is spec-driven. Start here:

- [`specs/00-product.md`](specs/00-product.md): product, users, non-goals, pitch.
- [`specs/01-architecture.md`](specs/01-architecture.md): system shape, data flow, repo layout.
- [`specs/02-contracts.md`](specs/02-contracts.md): exact contract interfaces, events, errors.
- [`specs/03-accounting.md`](specs/03-accounting.md): payout math, reserve, worked examples.
- [`specs/04-threat-model.md`](specs/04-threat-model.md): what can go wrong and what stops it.
- [`specs/05-design.md`](specs/05-design.md): brand, screens, copy, and UI rules.
- [`specs/06-demo.md`](specs/06-demo.md): seed data and the 3-minute demo script.
- [`specs/07-tasks.md`](specs/07-tasks.md): workstreams and acceptance criteria.
- [`specs/decisions.md`](specs/decisions.md): the decision log.

## Architecture at a glance

```
Browser (Next.js player) ── tRPC ── Postgres (catalog, listens, earnings)
        │
        └── NEAR RPC ── masters.sonata.testnet   (NEP-171 + song account creation)
                        platform.sonata.testnet  (pass NFT, treasury, settlement)
                        market.sonata.testnet    (fixed-price resale)
                        usdc.sonata.testnet      (mock NEP-141, 6 decimals)
                        <slug>.masters...        (keyless song accounts)
```

A settlement service aggregates verified listening seconds, publishes an audit bundle, and submits
`platform.settle_epoch` as the oracle. An indexer writes contract events into Postgres for history
views.

## Local development

Prerequisites: [Bun](https://bun.sh) 1.4.4, Docker, and Rust with the `wasm32-unknown-unknown` target
for contracts.

```bash
bun install
cp .env.example .env
bun run db:up
bun run db:migrate
bun run db:seed
bun run dev
```

Open http://localhost:3000. Local credentials: `local@example.test` / `LocalDev123!`.

The upstream app expects `JIOSAAVN_DES_KEY` until the catalog replacement lands. Set a dummy value
locally if you only need the shell to boot. The Sonata catalog does not use JioSaavn.

### Useful scripts

```bash
bun run db:up        # PostgreSQL, Redis, adapter
bun run db:migrate   # Apply migrations
bun run db:seed      # Seed deterministic local data
bun run dev          # Next.js dev server
bun run type-check   # TypeScript
bun run lint         # Oxlint
bun run test         # Plain, mocked, and DOM suites
bun run build        # Production build
```

## Repository layout

```
apps/web/           Next.js player and Sonata UI
packages/           auth, db, env, trpc, types, ui, near (new)
contracts/          master-nft, song-wallet, platform, market, mock-usdc
services/           settlement oracle and event indexer (new)
specs/              normative spec pack
docs/               design system and upstream documentation
```

## Built on Infinitunes

Sonata reuses the Infinitunes music player (MIT) by Hemant Rajput for its shell, design system, auth,
and data tooling. The catalog, podcasts, radio, shows, mixes, and AI assistant are replaced. See
[`NOTICE`](NOTICE) and [`LICENSE`](LICENSE).

## License

MIT. See [`LICENSE`](LICENSE).
