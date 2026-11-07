# Sonata architecture

This is the judge-facing architecture note. The normative interfaces are in
[`specs/01-architecture.md`](../specs/01-architecture.md),
[`specs/02-contracts.md`](../specs/02-contracts.md) and
[`specs/03-accounting.md`](../specs/03-accounting.md); this page explains how
the pieces fit and where the demo is seeded versus live.

## One sentence

A master is a 1-of-1 NFT that owns a keyless NEAR account. The account receives
USDC for verified listening, and only the current NFT owner can withdraw it.

## System shape

```
Browser (Next.js 16 player)
  │  tRPC (reads + demo-gated writes)
  ▼
apps/web ───────────────────────────────┐
  │  Drizzle                           │  server-side signers
  ▼                                    ▼
Postgres (catalogue, listens,        NEAR testnet
  epochs, payouts, pass cache)         │
                                       ├─ masters-sonata.testnet
                                       │    NEP-171 collection + song-account factory
                                       ├─ platform-sonata.testnet
                                       │    pass, treasury, settlement, reserve
                                       ├─ market-sonata.testnet
                                       │    fixed-price resale + 5% royalty
                                       ├─ usdc-sonata.testnet
                                       │    mock NEP-141, 6 decimals
                                       └─ <token>.masters-sonata.testnet
                                            keyless song-wallet, one per master

Listener heartbeats ──► Postgres listen events
                              │
                              ▼
                 settlement script / oracle
                 aggregate → listen root → platform.settle_epoch
```

There is **no event indexer** in this build. The app reads catalogue and
history from Postgres; the chain is the authority for ownership, balances,
listings, passes and settlement. That split is why the demo uses seeded history
plus live testnet transactions. See
[`docs/DEMO.md`](DEMO.md#what-is-live-what-is-seeded).

## Components

| Component | Responsibility | Where |
| --- | --- | --- |
| `apps/web` | Player, catalogue, pass checkout, artist dashboard, market, audit | Next.js 16, React 19, tRPC |
| `packages/trpc` | Typed `sonata` router: songs, artist, market, epochs, listen, pass, stats | `packages/trpc/src/router/sonata` |
| `packages/near` | Contract ids, formatting, RPC client, server-side demo signers, settlement client | `packages/near/src` |
| `packages/db` | `sonata_*` tables, migrations, deterministic demo seed | `packages/db/src` |
| `contracts/master-nft` | NEP-171 collection; mint creates the song account; approvals; NEP-199 royalty | Rust, `near-sdk 5.30` |
| `contracts/song-wallet` | Immutable keyless account; owner-gated withdraw | Rust |
| `contracts/platform` | Non-transferable pass, treasury, epoch settlement, reserve | Rust |
| `contracts/market` | Fixed-price listings, royalty split, atomic sale | Rust |
| `contracts/mock-usdc` | NEP-141 demo USDC, 6 decimals, owner-only faucet | Rust |
| `scripts/` | Deploy, mint/list the demo, check the chain, settle an epoch | Bash, TypeScript |

`contracts/README.md` documents the original three crates; `platform` and
`market` landed later. The deployment record in `ops/testnet.md` is the
authoritative account and transaction list.

## Master plus wallet ownership

The pairing is the product:

1. `master-nft.nft_mint(token_id, metadata, receiver_id)` mints one token. The
   caller is recorded as the creator; the receiver becomes the owner.
2. The mint creates `<token_id>.masters-sonata.testnet` with
   `create_account()`, transfers storage, installs the **global immutable**
   `song-wallet` code by hash, calls its `new(collection_id, token_id,
   payment_token)`, then calls `platform.register_song`. **No access key is
   added.** The account cannot be logged into.
3. `song-wallet.withdraw` / `withdraw_all` starts a promise chain:
   balance (for `withdraw_all`) → `master-nft.nft_token(token_id)` → compare
   the captured caller with the current `owner_id` → `ft_transfer` to that
   owner.
4. The ownership check is at **withdrawal time**, not at mint or sale time. A
   seller who no longer owns the NFT is rejected with `Not the owner`, even if
   they were the owner when the balance accrued.
5. Selling the master moves the NFT. The song account is not transferred (it is
   fixed at `<token_id>.masters-sonata.testnet`); what moves is the right to
   withdraw from it. Its balance and all future payouts follow the NFT.

```
owner(nadia) ──owns──► master NFT "midnight-drive"
                          │ controls
                          ▼
              midnight-drive.masters-sonata.testnet  (0 keys)
                          │ withdraw checks nft_token.owner_id
                          ▼
                    current NFT owner
```

The only way USDC leaves the song account is `withdraw` to the current owner.
There is no admin, no upgrade path for an individual song wallet, and no
recovery key. The collection and the global code hash are the trust root.

## Money flow

### 1. Pass revenue

`listener` calls `usdc.ft_transfer_call(platform, 5_000_000, "pass")`. The
platform's `ft_on_transfer` mints a non-transferable pass, or renews the
existing one from `max(now, current_expiry) + 30 days`. The $5 stays in the
platform's USDC balance. Passes cannot be transferred.

### 2. Listening verification

The player posts a heartbeat every 15 seconds while a Sonata master is
playing. `sonata.listen.record` stores a `sonata_listen_event`. An event is
credited only when:

- the account has an active pass at the heartbeat time;
- the account is not the master's owner or creator;
- the heartbeat is 1–60 seconds and is not a replay (`clientEventId` is unique);
- the event is inside the epoch window.

The player only sends heartbeats when it believes the pass is active. A paused
track drops the partial chunk. Previews are never credited. The 4-hour daily
cap is applied at aggregation, across all songs for one account.

### 3. Epoch settlement

The settlement service aggregates verified events in a rolling seven-day demo
window (`apps/web/lib/sonata/listens-core.ts`), sorts entries by token id,
applies the daily cap and self-listen exclusion, and computes:

```
listenRoot = sha256(canonical JSON of [{tokenId, seconds}, ...])
```

The oracle signs `platform.settle_epoch(epoch_id, entries, listen_root)`. The
contract:

```
balance = usdc.ft_balance_of(platform)
effectiveRate = min(R, floor(balance * 3600 / totalSeconds))
payout_i = floor(effectiveRate * seconds_i / 3600)
```

It stores the epoch, emits `epoch_settled` and `payout_sent`, and calls
`ft_transfer(song_account_i, payout_i, "epoch:<id>")`. If the balance cannot
fund `R`, the epoch pays a pro-rata rate and records `mode = "pro-rata"`.
Artists are paid before the reserve; the reserve only restricts **platform
withdrawals**. The platform may withdraw
`max(0, balance - max(reserve_target, one_month_reserve))`, so it can never
touch the reserve floor.

### 4. Withdrawal

The artist (or the current owner) calls `song-wallet.withdraw_all`. The wallet
reads its USDC balance, checks the current NFT owner, and transfers the whole
balance to that owner. The platform is not in this path and cannot freeze it.

### 5. Resale

1. Seller approves the market: `master-nft.nft_approve(token_id, market, null)`.
2. Seller lists: `market.list(token_id, price)`.
3. Buyer calls `usdc.ft_transfer_call(market, price, "buy:<token_id>")`.
4. Market verifies the listing and price, calls
   `master-nft.nft_transfer_payout(...)`, which moves the NFT and returns the
   NEP-199 split: `5%` to the creator, the rest to the seller.
5. Market pays the royalty and seller proceeds in the callback. If the creator
   is also the seller, the split collapses to one entry and they receive the
   whole price.
6. The song account is untouched. Its balance is now withdrawable only by the
   buyer.

The 5% is a payment to the creator, not a platform fee. The market enforces
`royalty_bps = 500`; it does not trust a seller-supplied split.

## Data model

All Sonata tables are prefixed `sonata_` and live beside the shared auth tables.
Money is **micro-USDC as text** (6 decimals); seconds are integers. No money
value is ever computed through a float.

| Table | Purpose |
| --- | --- |
| `sonata_song` | One row per master: token id, artist, creator, owner, song account, media |
| `sonata_pass` | Cache of pass purchases; the chain is the source of truth |
| `sonata_listen_event` | One heartbeat: account, token, seconds, timestamp, verified/reason |
| `sonata_listen_hour` | Aggregated per account/token/UTC day, with the cap flag |
| `sonata_epoch` | Settlement window: totals, effective rate, mode, `listen_root`, tx |
| `sonata_payout` | One row per song per epoch: seconds, amount, tx |
| `sonata_listing` | Active/inactive resale listing; at most one active row per token |
| `sonata_sale` | Sale history (indexer target) |
| `sonata_ownership` | Ownership timeline (indexer target) |
| `sonata_withdrawal` | Withdrawal history (indexer target) |

The demo seed (`packages/db/src/sonata-seed.ts`) is idempotent and guarded by
row existence. It inserts the 12 masters, eight past epochs and payouts, the
ownership history, the listener pass and the five listings **only when those
groups are absent**, so an indexer-written row is never rewound by a reseed.

## Trust boundaries

| Boundary | Trusted | Untrusted | Enforcement |
| --- | --- | --- | --- |
| Browser → API | Server session for app data | Client input | Zod validation, rate limits, demo-mode gate |
| API → chain | Server-side demo signer | RPC responses | Finality, direct view calls in `check-demo.sh` |
| Oracle → platform | Oracle key | Listen events | Only oracle may settle; listen root is public |
| Song account → owner | Master NFT contract | Caller | `nft_token` ownership check in the callback |
| Market → royalty | `nft_transfer_payout` view | Seller price | 500 bps enforced on chain |
| Platform → reserve | Contract balance | Owner | Reserve floor check in `withdraw_revenue` |

The oracle is the weakest link. It is a single signer in v1. The mitigation is
transparency: every live epoch stores a `listen_root` over the entries, and the
audit page shows the same per-song seconds the root covers, so a published
bundle can be checked against it. The eight seeded demo epochs use illustrative
roots, not real bundles. A threshold committee or proof system is v2. The full
threat model is [`specs/04-threat-model.md`](../specs/04-threat-model.md).

## Deployment

The live testnet deployment is documented in
[`ops/testnet.md`](../ops/testnet.md). Key addresses:

| Role | Account |
| --- | --- |
| Master collection | `masters-sonata.testnet` |
| Platform | `platform-sonata.testnet` |
| Market | `market-sonata.testnet` |
| Mock USDC | `usdc-sonata.testnet` |
| Oracle | `oracle-sonata.testnet` |
| Parent / faucet | `sonata.testnet` |

Song accounts are `<token-id>.masters-sonata.testnet`. Every one has zero
access keys and the global song-wallet code hash
`2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS`.

`scripts/deploy-testnet.sh`, `scripts/deploy-platform-market.sh` and
`scripts/mint-demo.sh` are idempotent: existing code is verified, not
redeployed; existing masters, listings and passes are skipped.
`scripts/check-demo.sh` is read-only and exits non-zero when the expected
catalogue, listings, pass or keyless accounts are missing.

## What is not in this build

These are real limitations, not hidden behaviour:

- **No event indexer.** A successful UI write (pass, buy, withdraw, list) is
  not written back to Postgres. The UI keeps the seeded ownership/listing/pass
  rows until an indexer mirrors the chain. The demo documents the mirror it
  uses for the sale scene.
- **Demo signers, not a browser wallet.** `SONATA_DEMO_MODE=true` lets the
  server sign as `listener`, `collector`, `nadia` or `oracle`. There is no
  wallet-selector connection in the browser. Keys are server-only.
- **Seeded earnings history.** The eight epochs, payouts, trailing-30-day
  charts and the pass receipt are seeded. The contracts and the 12 masters, 5
  listings and pass purchase are real testnet state.
- **Epoch-id mismatch.** As of 2026-11-08 the chain has settled no epochs
  (`next_epoch_id = 1`) while Postgres seeds epochs 1–8. A live settlement needs
  a fresh chain and a fresh database, or a deliberate reset of the seeded
  epoch/payout rows.
- **Publish is a UI stub.** The 12 masters were minted by
  `scripts/mint-demo.sh`; the dashboard's "Publish a master" button has no
  wizard yet.
- **Presentational controls.** The market sort/filter pills and the dashboard
  range pills change state only; the data does not refilter.
- **Rejected withdrawals are logged, not thrown.** `song-wallet` logs
  `Withdraw rejected: <reason>` and returns success at the transaction level so
  a rejected attempt cannot wedge the account. The UI does not parse the log,
  so its success toast is not proof; use the balance and the transaction log.
  This is why the demo's old-owner scene is a CLI/log proof.
- **The audit page is a ledger view.** It shows the epoch table and payouts;
  the root is a short hash with the full value on hover. There is no published
  bundle file or reserve bar in this build; reserve values are on chain.
- **Testnet only.** The USDC is a mock with no real-world value. There is no
  mainnet deployment, fiat on-ramp, auction, offer, fractional share or mobile
  app.
- **Not audited.** This is a hackathon build. Do not treat the contracts or the
  accounting as production-audited code.

## Read next

- [`specs/00-product.md`](../specs/00-product.md) — product and non-goals.
- [`specs/02-contracts.md`](../specs/02-contracts.md) — exact method names,
  events and errors.
- [`specs/03-accounting.md`](../specs/03-accounting.md) — the money contract and
  worked examples.
- [`specs/04-threat-model.md`](../specs/04-threat-model.md) — what can go wrong.
- [`docs/DEMO.md`](DEMO.md) — the 3-minute script and seeded/live split.
