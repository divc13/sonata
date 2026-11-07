# Sonata demo

Three minutes, three claims:

1. A listener pays once and plays everything.
2. A song earns into its own account, and the artist withdraws it.
3. A master is sold, its account moves with it, and the old owner cannot withdraw.

The point judges should leave with: **the master is the account**.

This is the recording and live-presentation script. It uses the seeded catalogue
and history plus the real NEAR testnet deployment. Read
["What is live, what is seeded"](#what-is-live-what-is-seeded) before recording;
it is the difference between a demo that survives questions and one that does
not.

## Key facts

| Fact | Value |
| --- | --- |
| Masters | 12, one 1-of-1 NFT each |
| Active resale listings | 5 |
| Pass | $5.00 for 30 days, non-transferable |
| Free tier | 30-second preview of every master |
| Artist rate `R` | $0.03 per verified listening hour |
| Daily cap | 4 verified hours per listener per day, across all songs |
| Self-listens | Owner and creator listens never earn |
| Secondary royalty | 5% to the creator, the rest to the seller |
| Settlement | Manual for the demo; weekly in production |
| Currency | Mock USDC (NEP-141, 6 decimals), NEAR testnet |

## Run sheet

| Time | Route | Action | Proof |
| --- | --- | --- | --- |
| 0:00 | `/` | Hero and shelves; click Midnight Drive | Seeded catalogue |
| 0:20 | `/` | Play; let the player stop at 0:30 | Free preview (prep-expired pass) |
| 0:50 | `/pass` | Show `$5 / 30 days`; buy live or restore the row | Live pass tx or seeded receipt |
| 1:05 | `/` or `/master/midnight-drive` | Play past 0:30 | Full playback |
| 1:10 | terminal | Newest `sonata_listen_event` rows | Verified heartbeat |
| 1:25 | `/audit` | Eight epochs and the latest payouts | Seeded history; no live settle |
| 1:52 | `/artist/dashboard` | Withdraw Slow Arc | Live withdraw (funded account) |
| 2:12 | `/market` → `/master/midnight-drive` | Buy for `$50.00` | Live buy |
| 2:32 | terminal (optional `/artist/dashboard`) | Withdraw as Nadia; show the log and unchanged balance | Wallet logs `Not the owner` |
| 2:47 | `/master/midnight-drive` or terminal | Collector withdraw | Live success |
| 2:57 | `/` | Close | — |

The details, including the prep that makes each proof live, follow.

## What is live, what is seeded

The app is a hybrid. The catalogue and money history come from Postgres; the
contracts, masters, listings, pass and keyless song accounts are real on NEAR
testnet.

### Live on testnet (verifiable today)

- The four contract accounts (USDC, masters, platform, market) and the global
  song-wallet code are deployed.
- All 12 masters are minted. Every song account is a real sub-account of
  `masters-sonata.testnet` with **zero access keys** and the global
  `song-wallet` code.
- Five resale listings are active on `market-sonata.testnet`.
- `listener.sonata.testnet` bought a 30-day pass on chain.
- `scripts/check-demo.sh` reads all of the above with view calls only.

### Seeded in Postgres (demo history)

- The `sonata_song` rows (12 masters, owners, covers, audio paths).
- The `sonata_listing` rows shown on `/market` (five active listings).
- The eight past epochs and their per-song payouts (charts, trailing 30-day
  earnings, `/audit` history, the artist payout table).
- The listener's `sonata_pass` row shown on `/pass` and `/library`. Its
  on-screen receipt hash is a deterministic demo hash, not a chain transaction.
- The ownership/history rows on the master detail page.

The seeded epochs use negative ids (`-1`…`-8`, labelled Demo 1–Demo 8) so they
can never occupy a chain id. Real epochs start at **1**: the deployed
`platform` initializes `next_epoch_id = 1`, and there is no epoch 0. At the time
of writing (2026-11-08) the live chain has settled **no** epochs, so
`platform.get_stats.next_epoch_id` is `1`. The `/audit` button reads that value
from the chain and labels itself `Settle epoch 1`; `scripts/settle-demo.ts`
takes the id you pass. See the Epoch settlement scene below for the exact
command and the precondition.

### Demo-gated live writes

These are real transactions when `SONATA_DEMO_MODE=true` and the matching
server-side keys are set:

| Action | Route | Signer |
| --- | --- | --- |
| Buy the pass | `/pass` | `listener.sonata.testnet` |
| Buy a master | `/master/<token>` | `collector.sonata.testnet` |
| Withdraw earnings | `/artist/dashboard`, `/master/<token>` | `nadia-sonata.testnet` or the current demo owner |
| List a master | `/master/<token>` | `nadia-sonata.testnet` |
| Settle an epoch | `/audit` | `oracle-sonata.testnet` |
| Record a listen heartbeat | the player | `listener.sonata.testnet` |

Successful writes are **not reindexed into Postgres** in this build. The chain
is authoritative; the UI's owner/listing/history rows stay seeded until an
indexer lands. The recording path below mirrors the two writes it needs with a
small SQL statement, clearly labelled as a demo stand-in. Do not present that
mirror as product behaviour.

## Deployed testnet accounts

From [`ops/testnet.md`](../ops/testnet.md). NEAR balances are the recorded
after-demo values from 2026-11-07 and will drift with gas use.

| Role | Account | NEAR (recorded) |
| --- | --- | --- |
| Parent / faucet / contract owner | `sonata.testnet` | ~1.90 |
| Mock USDC (NEP-141) | `usdc-sonata.testnet` | ~3.01 |
| Master NFT collection | `masters-sonata.testnet` | ~10.60 |
| Platform / settlement | `platform-sonata.testnet` | ~4.48 |
| Market | `market-sonata.testnet` | ~7.55 |
| Listen oracle | `oracle-sonata.testnet` | 1.00 |
| Artist, Nadia Vale | `nadia-sonata.testnet` | ~9.56 |
| Artist, Kofi Mensah | `kofi-sonata.testnet` | ~9.53 |
| Artist, Lena Ortiz | `lena-sonata.testnet` | ~9.56 |
| Listener | `listener.sonata.testnet` | 1.00 |
| Collector | `collector.sonata.testnet` | 1.00 |
| Spare artist account | `nadia.sonata.testnet` | 5.00 |

Song accounts are `<token-id>.masters-sonata.testnet`, for example
`midnight-drive.masters-sonata.testnet`. They are keyless and immutable.

The app defaults to these deployed ids in `packages/near/src/config.ts`; no
override is needed for the demo. The optional server overrides are:

```bash
SONATA_NEAR_RPC_URL=https://rpc.testnet.fastnear.com
SONATA_MASTERS_ID=masters-sonata.testnet
SONATA_PLATFORM_ID=platform-sonata.testnet
SONATA_MARKET_ID=market-sonata.testnet
SONATA_USDC_ID=usdc-sonata.testnet
SONATA_ORACLE_ID=oracle-sonata.testnet
```

## Before you record

> **The live sale is destructive to the demo state.** After the collector buys
> Midnight Drive, the chain has four active listings and the collector owns the
> token, so `./scripts/check-demo.sh` no longer matches the pristine
> 12 masters / 5 listings / Nadia ownership expectations. Capture the
> submission proof and a green `check-demo.sh` recording **before** the sale, or
> record the sale against a disposable deployment.

Run this 30 minutes before the take.

```bash
bun install
bun run db:up
bun run db:migrate
bun run db:seed
bun run dev
```

Open <http://localhost:3000>. Local credentials are `local@example.test` /
`LocalDev123!`.

`.env.local` needs the database URL and auth secret for the app, and these for
the live writes (never commit them):

```bash
SONATA_DEMO_MODE=true
SONATA_DEMO_LISTENER_SECRET_KEY=<listener key>
SONATA_DEMO_COLLECTOR_SECRET_KEY=<collector key>
SONATA_ORACLE_SECRET_KEY=<oracle key>
SONATA_NADIA_SECRET_KEY=<nadia key>
```

Read-only pages render without the keys. Leave `SONATA_DEMO_MODE=false` if you
only want the seeded narrative and no live writes.

### Chain check

```bash
./scripts/check-demo.sh
```

This is read-only (curl + Python, no keychain prompt). It must print
`0 failed` and exit 0. On this checkout it printed **65 passed, 0 failed,
1 skipped** because the local `song_wallet.wasm` was not built; the skipped
check compares the global code hash to the local wasm. Build the contracts
first if you want the full 66 checks:

```bash
cargo build --manifest-path contracts/Cargo.toml --workspace \
  --target wasm32-unknown-unknown --release
```

### Browser setup

- 1440x900, zoom 100%, dark mode.
- 1080p recording, notifications off, no private keys or `.env.local` on screen.
- Pre-open `/`, `/pass`, `/artist/dashboard`, `/master/midnight-drive`,
  `/market`, `/audit` in tabs so the first paint is warm.
- Keep a recent green `check-demo.sh` recording as the fallback clip.

### Live-money prep (optional, but needed for the withdraw scenes)

As of 2026-11-08 the deployed song accounts hold **0 USDC**, because no epoch
has settled on chain. A live withdraw would log `Nothing to withdraw` (and move
nothing). Fund the two song accounts used in the script with mock USDC before
recording:

```bash
source ops/testnet.env

# 1.00 USDC into Slow Arc for the artist-withdraw scene.
yes '' | script -q /dev/null near contract call-function as-transaction "$USDC_ACCOUNT" mint \
  json-args '{"account_id":"slow-arc.masters-sonata.testnet","amount":"1000000"}' \
  prepaid-gas 30Tgas attached-deposit 0NEAR \
  sign-as sonata.testnet network-config testnet sign-with-keychain send

# 2.00 USDC into Midnight Drive for the sale and old-owner scenes.
yes '' | script -q /dev/null near contract call-function as-transaction "$USDC_ACCOUNT" mint \
  json-args '{"account_id":"midnight-drive.masters-sonata.testnet","amount":"2000000"}' \
  prepaid-gas 30Tgas attached-deposit 0NEAR \
  sign-as sonata.testnet network-config testnet sign-with-keychain send
```

`mint` is owner-only and auto-registers the recipient. This is demo funding,
not an epoch settlement. Say so if asked.

### Free-preview prep

The seeded pass is active, and the player reads the demo listener's
`sonata_pass` row. To show the 30-second free tier, expire that row, record the
preview, then restore it before the pass scene:

```bash
# Expire the demo pass so the player treats the listener as free tier.
docker compose exec -T postgres psql -U postgres -d local_platforms -c \
  "update sonata_pass set expires_at = now() - interval '1 minute' where account_id = 'listener.sonata.testnet';"

# Restore it after the preview scene.
docker compose exec -T postgres psql -U postgres -d local_platforms -c \
  "update sonata_pass set starts_at = now() - interval '6 days', expires_at = now() + interval '24 days' where account_id = 'listener.sonata.testnet';"
```

Reload the page after each update; the player refetches entitlement on mount
and once a minute. If you use another Postgres, substitute your `DATABASE_URL`
with `psql` instead of the compose service.

### Demo-only mirror for the sale (optional, UI-only path)

After the live buy, the chain owner is the collector but the seeded UI still
shows Nadia. To show the collector's withdraw button on the master page, mirror
the two chain writes into Postgres. This stands in for the indexer that is not
in this build.

```bash
docker compose exec -T postgres psql -U postgres -d local_platforms -c \
  "update sonata_song set owner_account_id = 'collector.sonata.testnet' where token_id = 'midnight-drive';
   update sonata_listing set active = false where token_id = 'midnight-drive';"
```

The alternative, with no database edit, is the collector CLI withdraw in the
new-owner withdraw step below. The UI mirror is better on camera; the CLI is
better proof.

## The 3-minute script

Times are cumulative. Speak over the action; do not wait for animations.

### Home and catalogue, 0:00–0:20

**Open:** `/`

**Viewer sees:** the Midnight Drive hero, badges `Master`, `1 of 1`,
`For sale · $50.00`, the artist line `Nadia Vale @nadia`, a Play button, and
`Earns $0.03 / hr per verified hour`. Below: `12` masters, `5` for sale, the
paid-to-artists total, and verified listening hours. Then the pass strip
(`$5 / 30 days`), top-earning masters, and new releases.

**Say:**

> "Sonata is a subscription player where every master is its own account.
> Listeners pay once. Songs earn per verified hour. And the master can be sold
> with its wallet."

**Do:** hover the shelves, then click the Midnight Drive card (or `View the
master`). Do not press Play yet if you are showing the preview next.

### Free preview, 0:20–0:50

**Prep:** the pass row is expired (see ["Free-preview prep"](#free-preview-prep)).
Open `/` and press **Play** on the hero.

**Viewer sees:** the player bar fills with Midnight Drive. The progress moves.
At 0:30 the player pins the position to `0:30`, pauses, shows
`30-second preview ended`, and toasts `Preview ended — Get the Sonata pass to
hear the full track.` The seek bar cannot pass the free limit.

**Say:**

> "No per-song purchase. The free tier is a 30-second look at every master.
> The pass opens the whole recording and turns listening into artist earnings."

**Do:** let it stop at 0:30. Do not seek past it; the player clamps the seek.

### The pass, 0:50–1:05

**Open:** `/pass`

**Viewer sees (expired row):** status `Pass ended` or `Free tier`, the price
card `$5.00 / 30 days`, `about 17¢ a day`, the included list, and the
`Free preview vs the pass` table: free = 30-second previews, pass = every
master in full.

**Do (live path):** click **Get 30 days**. The toast reads
`Pass active for 30 days` with a real transaction hash. This is a live
`usdc.ft_transfer_call(platform, 5 USDC, "pass")` signed by the listener.

**Do (seeded path):** if you skip the live purchase, restore the pass row with
the SQL above and reload. The page now shows `Pass active`, the days left, and
the receipt line: `$5.00 · <date> · tx <hash>`.

**Say:**

> "One pass, five dollars, thirty days, the whole catalogue. It is an NFT, but
> you never need to know that. It is non-transferable, and renewal extends from
> the later of now and the current expiry."

**Note:** before a live purchase, the receipt hash on screen is the seeded demo
hash. The original real pass purchase transaction is
`3NDAvwfaDm2c3TAn2ypmfLNpLahoCHiCUaub3jSsdcqL` (see
[`ops/testnet.md`](../ops/testnet.md)). If you show the live purchase, mirror
the new toast's hash into the pass row before the next scene:

```bash
docker compose exec -T postgres psql -U postgres -d local_platforms -c \
  "update sonata_pass
   set starts_at = now(), expires_at = now() + interval '30 days', tx_hash = '<tx-from-toast>'
   where account_id = 'listener.sonata.testnet';"
```

Then reload `/pass`. This is a demo stand-in for the missing indexer, not a
product claim.

### Full playback and verified listening, 1:05–1:25

**Open:** `/` (or `/master/midnight-drive`)

**Do:** press **Play**. Let it run past 0:30. The player does not stop this
time.

**Viewer sees:** playback continues. While it plays, the player posts a
15-second heartbeat to `sonata.listen.record` as the demo listener. Pause and
the partial chunk is dropped; only time while the track is actually playing is
counted.

**Proof:** cut to a terminal (or a small inset) and show the newest rows:

```bash
docker compose exec -T postgres psql -U postgres -d local_platforms -c \
  "select account_id, token_id, seconds, verified, reason
   from sonata_listen_event order by id desc limit 3;"
```

The new row has `verified = true`, `reason = null`, the listener account and
`midnight-drive`. A preview is never credited.

**Say:**

> "The listener does not report a stream count. The player sends verified
> heartbeats: an active pass, real elapsed time, a listener who is not the
> owner or creator. The daily cap is four hours across all songs."

### Epoch settlement, 1:25–1:52

**Open:** `/audit`

**Viewer sees:** six stats — total paid, verified listening, masters, active
listings, settled epochs, next epoch — then the settled-history table (8 seeded
epochs), each row with dates, hours, effective rate `$0.03 / hr`, total paid,
mode, and the listen root + transaction. Below it, `Latest epoch payouts`: one
receipt row per song account. The page labels the history as seeded, mirrored
from contract settlements. The seeded epochs use demo roots and demo
transaction hashes, not real chain proofs.

**Say:**

> "Each live epoch stores the verified hours, the effective rate, every payout,
> and a hash over the entries. The rate is fixed at three cents in the
> contract. The platform keeps the remainder and cannot withdraw below a
> three-month reserve. A published bundle can be checked against the stored
> root."

**Audit UI note:** the current page does not render a reserve bar or link to a
bundle file. The reserve values are on chain (`platform.get_stats`);
`check-demo.sh` prints `reserve_target` and `one_month_reserve`. The listen root
is a short hash with the full value in the hover title, not a download link.
Say "the reserve is on chain" rather than pointing at a bar that is not there.

**Important:** the deployed chain's `next_epoch_id` is currently `1`, while the
seeded Postgres history uses negative ids (`Demo 1`–`Demo 8`). The `/audit`
button reads the chain and offers `Settle epoch 1`, which the contract accepts
(epochs start at 1; there is no epoch 0). Settling it mirrors a real epoch next
to the demo history. Show the seeded history and the command instead:

```bash
bun run scripts/settle-demo.ts <epoch>
```

`<epoch>` must be the chain's `next_epoch_id`, not `max(seeded id) + 1`.
`scripts/settle-demo.ts` also refuses an epoch id that already exists in
`sonata_epoch`. See [`ops/testnet.md`](../ops/testnet.md) for the deployed
`get_stats`.

To demonstrate a live settlement on this exact chain, use a **separate
database** (or record the seeded audit scene first), delete the seeded
epoch/payout rows, play a track long enough to write a verified heartbeat, then
settle chain epoch 1:

```bash
# Destructive: removes the eight seeded epochs and their payouts.
docker compose exec -T postgres psql -U postgres -d local_platforms -c \
  "delete from sonata_payout; delete from sonata_epoch;"

# Play a Sonata master for at least 15 seconds with an active pass first.
bun run scripts/settle-demo.ts 1
```

The platform holds 5 USDC from the pass purchase, so a short live epoch is
fully funded. The script prints the entries, listen root and transaction, then
mirrors the chain epoch and payouts into Postgres. The audit page will show
epoch 1 instead of the seeded history.

### Artist withdraw, 1:52–2:12

**Open:** `/artist/dashboard`

**Viewer sees:** Nadia's four masters, her 30-day earnings, settled history,
fixed rate, earnings chart, and the master table with `Owner`, `30d earnings`,
`Song account`, `Balance` (`—`), and `Withdraw`. The balance is read on chain at
withdrawal time, not cached in the table.

**Do:** click **Withdraw** on **Slow Arc**. The toast reads
`Withdrew from Slow Arc` and the transaction hash. The song account balance
goes to zero. This scene needs the song account to hold USDC; fund it with the
mint in the prep section. An unfunded account fails earlier with
`Nothing to withdraw`.

**Say:**

> "Nadia has four masters. Each one has a song account. The dashboard shows the
> song's earnings, not a platform IOU. This payout is the song account signing
> a transfer to its current owner."

**Proof:** the withdraw is signed by the keyless song account's contract, but
the account has no access keys. `./scripts/check-demo.sh` prints
`access keys: 0` for every song account. The song-wallet reads the current
master owner at withdrawal time.

### Market buy, 2:12–2:32

**Open:** `/market`

**Viewer sees:** five listings. Midnight Drive at `$50.00`, with its trailing
30-day earnings. The copy: "Buy the recording, and its account comes with it."

**Do:** click the Midnight Drive card. On `/master/midnight-drive`, the sidebar
shows `Buy this master`, `$50.00`, trailing 30 days, recent verified hours, and
an annual estimate. Click **Buy for $50.00**. The toast reads `Master bought`
with the transaction hash.

**Say:**

> "The master is for sale. The price includes the balance in the song account,
> because the account goes with the master. The buyer is the collector; the
> payment is mock USDC on testnet."

**On chain:** `usdc.ft_transfer_call(market, 50 USDC, "buy:midnight-drive")`.
The market pays the creator 5% (`$2.50`) and the seller the rest (`$47.50`), then
transfers the NFT to the collector. The song account's balance is untouched and
now belongs to the new owner.

### Old owner blocked, 2:32–2:47

**Why the CLI:** the song wallet deliberately **logs** a rejected withdrawal
(`Withdraw rejected: Not the owner`) and returns success at the transaction
level, so a rejected attempt cannot wedge the account. The dashboard's demo
button does not parse that log and can show a success toast even when no funds
moved. Do not use the toast as proof. Use the CLI, the log and the unchanged
balance.

**Do (CLI, signed as Nadia):**

```bash
source ops/testnet.env
yes '' | script -q /dev/null near contract call-function as-transaction \
  midnight-drive.masters-sonata.testnet withdraw_all \
  json-args '{}' prepaid-gas 100Tgas attached-deposit 0NEAR \
  sign-as nadia-sonata.testnet network-config testnet sign-with-keychain send
```

The command prints a transaction hash. Inspect the outcome:

```bash
near transaction view-status <tx-hash> network-config testnet
```

The logs contain `Withdraw rejected: Not the owner`. Show the song-account
balance before and after; it is unchanged:

```bash
yes '' | script -q /dev/null near contract call-function as-read-only \
  "$USDC_ACCOUNT" ft_balance_of \
  json-args '{"account_id":"midnight-drive.masters-sonata.testnet"}' \
  network-config testnet now
```

**Optional visual:** open `/artist/dashboard` as Nadia and show the seeded
Midnight Drive row, then say the row is seeded and the chain is authoritative.
(The dashboard always acts as `nadia-sonata.testnet`; there is no sign-in
switch.)

**Say:**

> "The old owner cannot. The account checks the current owner at withdrawal
> time, not a cached balance. The wallet logs the rejection instead of
> panicking, so a failed attempt cannot wedge it. That is what stops a seller
> from keeping the income after a transfer."

**Note:** this scene needs a non-zero song balance. An empty account logs
`Nothing to withdraw` before the ownership check.

### New owner withdraw, 2:47–2:57

**Option A, UI (after the demo-only mirror):** run the SQL mirror above, reload
`/master/midnight-drive`. The `Current owner` stat shows the collector, the buy
box is gone, and the Demo actions panel shows **Withdraw earnings** as
`collector.sonata.testnet`. Click it. The toast reads `Earnings withdrawn` with
the transaction hash.

**Option B, CLI proof (no database edit):**

```bash
source ops/testnet.env
yes '' | script -q /dev/null near contract call-function as-transaction \
  midnight-drive.masters-sonata.testnet withdraw_all \
  json-args '{}' prepaid-gas 100Tgas attached-deposit 0NEAR \
  sign-as collector.sonata.testnet network-config testnet sign-with-keychain send
```

The collector receives the song account's USDC. Show the balance change:

```bash
yes '' | script -q /dev/null near contract call-function as-read-only \
  "$USDC_ACCOUNT" ft_balance_of \
  json-args '{"account_id":"collector.sonata.testnet"}' \
  network-config testnet now
```

**Say:**

> "The new owner can withdraw immediately. The NFT, the account, its balance,
> and its future income all moved together."

### Close, 2:57–3:00

**Open:** `/`

> "Sonata: every song is an account. One pass, a fixed rate, and a master you
> can sell with its wallet."

## 60-second X cut

Use the same flow, cut to:

1. Play a song, 5 s.
2. The pass receipt, 5 s.
3. Artist earnings and withdraw, 10 s.
4. Song account in the chain tab, with `access keys: 0` from `check-demo.sh`, 5 s.
5. Buy the master, royalty split, 10 s.
6. New owner withdraws, 5 s.
7. Old owner fails, 5 s.
8. Audit root and latest payouts, 5 s.
9. Logo and tagline, 5 s.

Text overlays:

- "Every song is an account."
- "$5 / 30 days. $0.03 per verified hour."
- "The master owns the wallet."
- "Sell the master. The wallet goes with it."
- "The old owner cannot withdraw."

## Failure modes and fallbacks

| Failure | Fallback |
| --- | --- |
| Testnet RPC slow | Use `SONATA_RPC_URL=https://archival-rpc.testnet.fastnear.com` for reads; pre-warm the pages; keep the last green recording |
| Wallet/signing key missing | The UI still renders from seed; show the recorded withdraw clip and `check-demo.sh` |
| Settlement transaction fails | Show the seeded audit history and the command; explain the epoch-id precondition |
| Song account is empty | Fund it with the USDC mint above, or show the seeded dashboard and the chain check |
| Audio does not load | Use the committed files under `apps/web/public/demo/`; preload before recording |
| Contract bug found late | Do not patch on stage. Use the last green deployment and note the fix in the README |
| Judge asks for mainnet | "Testnet by design; the USDC is a mock and the contracts are the deliverable" |

## What not to do

- Do not show a raw private key, even a test one, on screen.
- Do not claim the platform is profitable; say the demo parameters are designed
  to be sustainable.
- Do not say "guaranteed yield." The market shows trailing earnings, not a
  promise.
- Do not call the seeded transaction hashes or listen roots real proofs.
- Do not claim a hidden tab is not credited; the current player only stops
  counting when playback stops.
- Do not use the dashboard's success toast as proof that a rejected withdrawal
  moved funds; inspect the log and the balance.
- Do not call the SQL mirror an indexer or a product feature.
- Do not use the word "mint" in the listener flow. Use "publish" for artists and
  "NFT" only in details.
