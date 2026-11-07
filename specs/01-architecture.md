# 01 - Architecture

## System shape

```
                         Browser (Next.js app)
                    ┌──────────────────────────────┐
                    │ player, library, artist docs  │
                    │ marketplace, pass checkout    │
                    └───────┬──────────────┬───────┘
                            │ tRPC         │ NEAR RPC
                            ▼              ▼
                    ┌───────────────┐  ┌──────────────────────┐
                    │  apps/web     │  │  NEAR testnet         │
                    │  API + SSR    │  │                       │
                    └──┬────────┬───┘  │  masters.sonata       │
                       │        │      │  platform.sonata      │
                       ▼        ▼      │  market.sonata        │
                ┌──────────┐ ┌───────┐ │  usdc.sonata          │
                │ Postgres │ │ Redis │ │  <slug>.masters...    │
                │ catalog  │ │ rate  │ └──────────────────────┘
                │ earnings │ │ limit │            ▲
                └────┬─────┘ └───────┘            │
                     │                            │
                     │        ┌───────────────────┴────┐
                     └────────┤  settlement service    │
                              │  listen ingest         │
                              │  epoch builder         │
                              │  oracle signer         │
                              └────────────────────────┘
```

## Components

| Component                   | Responsibility                                                                                        | Technology                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/web`                  | Player, catalog, artist dashboard, marketplace, pass checkout, audit                                  | Next.js 16, React 19, tRPC, Drizzle, Better Auth |
| `packages/db`               | Schema, migrations, seed. Adds Sonata tables alongside existing auth tables.                          | Drizzle ORM, Postgres                            |
| `packages/trpc`             | Typed API. New `sonata` router; old JioSaavn routers removed from the app.                            | tRPC                                             |
| `packages/near` (new)       | Wallet selector, contract clients, network config, formatting                                         | `@near-wallet-selector/*`, `near-api-js`         |
| `packages/ui`               | Existing design-system components. Reused unchanged.                                                  | shadcn/radix, Tailwind                           |
| `contracts/master-nft`      | NEP-171 collection, mint, transfer, royalty, song account creation                                    | Rust, `near-sdk`                                 |
| `contracts/song-wallet`     | Keyless account per song, owner-gated withdrawal                                                      | Rust, `near-sdk`                                 |
| `contracts/platform`        | Pass NFT, pass sales, treasury, epoch settlement, reserve                                             | Rust, `near-sdk`                                 |
| `contracts/market`          | Fixed-price listings, 5% royalty, atomic sale                                                         | Rust, `near-sdk`                                 |
| `contracts/mock-usdc`       | NEP-141 test stablecoin, 6 decimals                                                                   | Rust, `near-sdk`                                 |
| `services/settlement` (new) | Consumes listen events, aggregates hours, builds epoch, submits to `platform`, publishes audit bundle | TypeScript, Node, `near-api-js`                  |
| `services/indexer` (new)    | Polls block and receipt outcomes (or NEAR Lake) for contract events into Postgres for history views   | TypeScript, Node                                 |
| `scripts/`                  | Deploy, seed, settle, demo reset                                                                      | TypeScript, shell                                |

## Repo layout

```
sonata/
  apps/web/                    existing Next.js app, adapted
  packages/
    auth/                      existing
    db/                        existing + sonata tables
    env/                       existing
    trpc/                      existing + sonata router
    types/                     existing
    ui/                        existing design system
    near/                      NEW: wallet + contract clients
  contracts/
    Cargo.toml                 workspace
    master-nft/
    song-wallet/
    platform/
    market/
    mock-usdc/
  services/
    settlement/
    indexer/
  scripts/
    deploy.ts
    seed-demo.ts
    settle-epoch.ts
    reset-demo.ts
  specs/                       this pack
  docs/                        existing design docs + handoff
  NOTICE                       upstream attribution
```

## Data flow

### Publish a master

1. Artist uploads audio and cover from the browser. Files go to object storage (S3-compatible) and
   the metadata hash is computed.
2. `apps/web` calls `master-nft.nft_mint({ token_id, metadata, receiver_id })` with a storage
   deposit.
3. `master-nft` creates the sub-account `<token_id>.masters.<root>`, deploys the `song-wallet`
   contract (global by hash), and initializes it with `(collection_id, token_id, payment_token)`.
   No access keys are added.
4. `master-nft` stores the token, emits `nft_mint`, and the indexer writes a `sonata_song` row.
5. The artist dashboard reads from Postgres and from chain views.

### Buy a pass

1. Listener signs `ft_transfer_call(platform, 5_000_000, "pass")` on mock USDC.
2. `platform.ft_on_transfer` mints a non-transferable pass NFT with `expires_at = max(now, current)
   - 30 days`, stores the expiry, returns 0 to accept the funds.
3. The indexer writes `sonata_pass`. The web app invalidates the pass query.
4. The player checks pass status from the backend, which reads the contract view and caches for 30s.

### Listen and verify

1. The player sends a signed heartbeat every 30 seconds while a track is playing and the tab is
   visible, with `session_id`, `song_id`, `position_ms`, and a server-issued session token.
2. `apps/web` writes `sonata_listen_event` rows. Events are deduped by `(session_id, position_ms)`
   and rejected if the gap exceeds 20 seconds or the tab was hidden.
3. The settlement service aggregates events into per-user, per-day hours, enforces the 4-hour cap,
   and excludes accounts without an active pass at the time of listening.
4. The service publishes the epoch bundle to IPFS (or a public JSON file for the demo) and submits
   `platform.settle_epoch(epoch_id, entries, total_hours, listen_root)` as `oracle`.

### Settle an epoch

1. The oracle computes `entries: Vec<PayoutEntry>` with `token_id` and verified `hours`.
2. `platform` computes `effective_rate` from the spendable balance and the reserve floor
   (`03-accounting.md`), records the epoch, and for each entry calls
   `ft_transfer(song_account, payout)` on mock USDC.
3. Each song account receives USDC. Emits `epoch_settled` and `payout_sent`.
4. The indexer writes `sonata_epoch`, `sonata_payout`, and updates the earnings view.
5. The artist clicks **Withdraw**. The song wallet calls `master-nft.nft_token(token_id)`, checks the
   owner in the callback, and transfers USDC to the owner.

### Sell a master

1. Seller approves the market for the token and calls `market.list(token_id, price)`.
2. Buyer signs `ft_transfer_call(market, price, "buy:<token_id>")`.
3. `market` verifies the listing, computes 5% royalty from `master-nft.nft_payout`, transfers royalty
   to the creator and the rest to the seller, and calls
   `master-nft.nft_transfer(buyer, token_id)` using the approval.
4. The NFT and its song account move to the buyer. The song account balance is unchanged and now
   withdrawable only by the buyer.
5. The indexer writes `sonata_sale` and `sonata_ownership`.

## Trust boundaries

| Boundary              | Trusted             | Untrusted             | Enforcement                                    |
| --------------------- | ------------------- | --------------------- | ---------------------------------------------- |
| Browser to API        | Server session      | Client input          | Auth, zod validation, rate limits              |
| API to chain          | Wallet signature    | RPC responses         | Verify finality, use multiple RPCs for demo    |
| Oracle to platform    | Oracle key          | Listen events         | Only oracle may settle; audit bundle published |
| Song account to owner | Master NFT contract | Caller                | `nft_token` ownership check in callback        |
| Market to royalty     | `nft_payout` view   | Seller-supplied price | Royalty computed on chain                      |
| Platform to reserve   | Contract balance    | Owner                 | Reserve floor check in withdraw                |

The weakest link is the oracle. It is a single signer in v1. The mitigation is transparency: every
epoch publishes the raw listen bundle and a hash, and the contract stores the hash. Judges and
artists can recompute. A future version can use a threshold committee or a zk proof.

## Chain and network

- Network: NEAR testnet.
- RPC: `https://rpc.testnet.near.org` (fallback `https://testnet.rpc.near.org`).
- Wallet: NEAR Wallet Selector with MyNearWallet, Meteor, and HERE wallets. For the demo, a
  burner key in `.env.local` is allowed for the settlement script only, never in the browser.
- USDC: `usdc-sonata.testnet`, 6 decimals, mintable by the demo admin. Real USDC is production
  roadmap, not v1.

## Data model additions

All new tables use the `sonata_` prefix to stay isolated in the shared database.

| Table                 | Key columns                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `sonata_song`         | `token_id` PK, `title`, `artist_name`, `creator_id`, `owner_id`, `sub_account`, `cover_url`, `audio_url`, `duration_sec`, `created_at` |
| `sonata_pass`         | `id`, `account_id`, `token_id`, `expires_at`, `purchased_at`, `tx_hash`                                                                |
| `sonata_listen_event` | `id`, `account_id`, `song_id`, `session_id`, `position_ms`, `created_at`, `verified`                                                   |
| `sonata_listen_hour`  | `account_id`, `song_id`, `day`, `hours`, `epoch_id`                                                                                    |
| `sonata_epoch`        | `id`, `started_at`, `closed_at`, `total_hours`, `effective_rate`, `total_paid`, `listen_root`, `tx_hash`                               |
| `sonata_payout`       | `epoch_id`, `song_id`, `hours`, `amount`, `tx_hash`                                                                                    |
| `sonata_listing`      | `song_id`, `seller`, `price`, `status`, `created_at`, `tx_hash`                                                                        |
| `sonata_sale`         | `song_id`, `seller`, `buyer`, `price`, `royalty`, `tx_hash`, `created_at`                                                              |
| `sonata_ownership`    | `song_id`, `from`, `to`, `price`, `tx_hash`, `created_at`                                                                              |
| `sonata_withdrawal`   | `song_id`, `owner`, `amount`, `tx_hash`, `created_at`                                                                                  |

Existing auth tables (`user`, `better_auth_*`, `infinitunes_passkey`) are reused. Existing catalog
tables from infinitunes are not used by Sonata and can be left dormant or removed in a later cleanup.

## Migration from infinitunes

Keep:

- App shell, layout, navigation, player, queue, now-playing, search shell, library, settings.
- Design system (`packages/ui`, `apps/web/styles/globals.css`, `docs/design-system/*`).
- Auth (`packages/auth`), DB harness, tRPC harness, env loader, tests, lint, formatting.
- MIT license and attribution.

Remove from navigation and replace:

- JioSaavn API client, catalog routers, podcasts, radio, shows, mixes, AI assistant.
- Any hardcoded external music API keys.

Add:

- `packages/near`, `contracts/*`, `services/*`, `scripts/*`.
- `specs/*`.
- Sonata routers: `song`, `pass`, `artist`, `market`, `epoch`, `listen`.
- Sonata pages: `/masters`, `/master/[tokenId]`, `/artist`, `/artist/new`, `/market`, `/pass`,
  `/audit`, `/settings/wallet`.

## Deployment

- **Web**: Vercel or local `bun run dev`. Postgres on Docker or Neon. Object storage on S3/R2.
- **Contracts**: NEAR testnet accounts created by `scripts/deploy.ts`. Contract state is initialized
  once; redeploys keep state for iterative demos.
- **Settlement**: a long-running Node process (`bun run --cwd services/settlement start`) with the
  oracle key. In the demo it can be triggered manually from `/audit`.
- **Indexer**: a long-running Node process polling `view` and `events` every 3 seconds. It stores the
  last processed block in Postgres so restarts are safe.

## Observability

- Structured JSON logs in `apps/web`, `services/settlement`, and `services/indexer`.
- Every money mutation writes a row with a `tx_hash`.
- The audit page shows: contract balances, reserve floor, total claimable, epoch list, and links to
  explorer transactions.
- A `/health` route checks Postgres and the chain RPC.

## Constraints

- Bun is required. The repo pins `.bun-version`; install Bun before running anything.
- No secrets in the repo. `.env.local` is gitignored. The oracle key exists only in the settlement
  environment.
- Contract source is open. The repo is private during development and public before submission.
