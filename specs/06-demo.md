# 06 - Demo

The demo must prove three things in under three minutes:

1. A listener pays once and plays everything.
2. A song earns real money into its own account, and the artist withdraws it.
3. A master is sold, the account moves with it, and the old owner cannot withdraw.

Judges should leave understanding that the master is the account.

## Seed data

Commit `scripts/seed-demo.ts`. It is idempotent and can reset the demo.

### Artists

| Account                | Name        | Handle   |
| ---------------------- | ----------- | -------- |
| `nadia-sonata.testnet` | Nadia Vale  | `@nadia` |
| `kofi-sonata.testnet`  | Kofi Mensah | `@kofi`  |
| `lena-sonata.testnet`  | Lena Ortiz  | `@lena`  |

### Listeners

| Account                   | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `listener.sonata.testnet` | Buys the pass, listens, demonstrates the player |
| `collector.testnet`       | Buys the master in the resale scene             |

The seller in the resale scene is the artist account `nadia-sonata.testnet`, which is also the creator. After
the sale, `nadia-sonata.testnet` is the old owner used for the failed withdrawal.

### Masters

Twelve tracks, royalty-free audio (CC0 or original), 2 to 4 minutes each. Store audio in
`apps/web/public/demo/audio/` for the demo; production uses signed S3 URLs.

| Token id         | Title          | Artist      | Genre      | Price when listed |
| ---------------- | -------------- | ----------- | ---------- | ----------------- |
| `midnight-drive` | Midnight Drive | Nadia Vale  | Synthwave  | $50.00            |
| `paper-moons`    | Paper Moons    | Kofi Mensah | Ambient    | not listed        |
| `velvet-static`  | Velvet Static  | Lena Ortiz  | Dream pop  | $35.00            |
| `slow-arc`       | Slow Arc       | Nadia Vale  | Electronic | not listed        |
| `harbor-lights`  | Harbor Lights  | Kofi Mensah | Jazz       | $80.00            |
| `glass-hours`    | Glass Hours    | Lena Ortiz  | Neo-soul   | not listed        |
| `northbound`     | Northbound     | Nadia Vale  | Indie      | not listed        |
| `after-rain`     | After Rain     | Kofi Mensah | Lo-fi      | $20.00            |
| `copper-sky`     | Copper Sky     | Lena Ortiz  | Folk       | not listed        |
| `low-tide`       | Low Tide       | Nadia Vale  | Ambient    | not listed        |
| `signal-fire`    | Signal Fire    | Kofi Mensah | Electronic | $65.00            |
| `quiet-machines` | Quiet Machines | Lena Ortiz  | Industrial | not listed        |

Covers: 1200x1200 WebP, one per track, committed under `apps/web/public/demo/covers/`. Use a
consistent editorial style: grain, warm light, no text.

### Earnings history

Seed 8 past epochs with deterministic hours. The purpose is to make charts and "trailing 30-day
earnings" look real before the live settlement.

| Epoch | Days ago | Total hours | Effective rate | Notes   |
| ----- | -------- | ----------- | -------------- | ------- |
| 1     | 56       | 412         | $0.03          | healthy |
| 2     | 49       | 530         | $0.03          | healthy |
| 3     | 42       | 488         | $0.03          | healthy |
| 4     | 35       | 601         | $0.03          | healthy |
| 5     | 28       | 574         | $0.03          | healthy |
| 6     | 21       | 690         | $0.03          | healthy |
| 7     | 14       | 742         | $0.03          | healthy |
| 8     | 7        | 811         | $0.03          | healthy |

The live epoch is 9. For the demo, the operator triggers it after the listener plays.

Seed song balances so the artist dashboard and the market cards are not empty. For example,
`midnight-drive` has $128.40, `harbor-lights` has $96.20, and the rest range from $12 to $80.

### State to reset

`scripts/reset-demo.ts` should:

- Truncate `sonata_listen_event`, `sonata_listen_hour`, `sonata_epoch`, `sonata_payout`,
  `sonata_listing`, `sonata_sale`, `sonata_ownership`, `sonata_withdrawal`.
- Keep `sonata_song`, `sonata_pass`, and the seeded earnings.
- Buy a pass for `listener.sonata.testnet` if no active pass exists. Do not add an admin `grant_pass` method
  to the contract just for the demo.
- Re-list `midnight-drive` at $50.00, owned by `nadia-sonata.testnet`.
- Re-list `velvet-static` and `harbor-lights` if the script uses them as decoys.
- Reset the collector's USDC to $200.00 and the listener's to $20.00.
- Do not reset contract state. Use a fresh deployment for a clean chain demo.

## Pre-demo checklist

Run 30 minutes before recording or presenting.

- [ ] Bun installed and `bun install` clean.
- [ ] Postgres up: `bun run db:up`.
- [ ] Migrations and seed: `bun run db:migrate && bun run db:seed`.
- [ ] Contracts deployed to testnet; addresses in `.env.local`.
- [ ] `scripts/check-demo.ts` prints all green:
  - pass active for `listener.sonata.testnet`
  - `midnight-drive` owned by `nadia-sonata.testnet`
  - listing active at $50.00
  - song account balance > 0
  - listener has USDC > $5
  - collector has USDC > $50
- [ ] Audio files load from the local server.
- [ ] Wallet selector connects to testnet.
- [ ] The oracle key is present only in the settlement process.
- [ ] `/audit` shows 8 seeded epochs and the reserve bar.
- [ ] Browser zoom at 100%, dark mode, 1440x900, and a mobile 390x844 check.
- [ ] Screen recording at 1080p, notifications off.
- [ ] Fallback recording from the last green run is downloaded locally.

## The 3-minute live script

### Scene 1: The player (0:00 to 0:25)

Open `/`. The catalog appears. The pass strip says "Pass active, 24 days left."

> "Sonata is a subscription player where every master is its own account. Listeners pay once. Songs
> earn per verified hour. And the master can be sold with its wallet."

Click a featured master. The now-playing panel opens. Press play. The progress moves. The line under
the title reads "Earning $0.03/hr for @nadia."

> "No per-song purchase. No ads. The listener pays $5 for 30 days, and the song earns every hour
> that is actually listened to."

### Scene 2: The pass (0:25 to 0:45)

Open `/pass`. If the seeded pass is active, show the receipt and say "This is the pass: $5, 30 days,
non-transferable." If it is not active, buy it with the listener wallet.

> "One pass unlocks the whole catalog. It is an NFT, but you never need to know that."

### Scene 3: The artist gets paid (0:45 to 1:30)

Switch to `/artist/dashboard` as `nadia-sonata.testnet`.

> "Nadia has four masters. Each one has a song account. The dashboard shows the song's balance,
> not a platform IOU."

Point at `slow-arc`: balance and trailing 30-day earnings.

Click `Withdraw`. Confirm. The toast shows the amount and a transaction link. The balance drops.

> "That payout came from the last epoch, straight into the song account. The platform never held an
> IOU."

Leave `midnight-drive` untouched for the sale scene.

> "The withdrawal is signed by the song account, but the song account has no keys. It checks that
> the caller is the current owner of the master, then pays. That check is the whole security model."

Open `/master/midnight-drive` and the `Chain` tab. Show the song account address and the zero-key
badge.

> "This is a real NEAR account with no access keys. Nobody can log into it. It can only pay its
> owner."

### Scene 4: The sale (1:30 to 2:20)

Open `/market`. Show `midnight-drive` listed at $50.00 with "Includes $128.40 in the song account."

> "The master is for sale. The price includes the balance in the song account, because the account
> goes with the master."

Connect as `collector.testnet`. Click `Buy master`. Confirm the USDC payment. The success receipt
shows the NFT, the creator royalty ($2.50), and the seller proceeds ($47.50).

> "The creator gets 5% forever. The seller gets the rest. And the buyer gets the master, the
> account, and everything in it."

Open `/master/midnight-drive` as the collector. The owner badge says `collector.testnet`. Click
`Withdraw` and withdraw the balance.

> "The new owner can withdraw immediately."

Switch back to `nadia-sonata.testnet` (the seller and creator). Open the same master and click `Withdraw`.
The error toast says "Not the owner."

> "The old owner cannot. The account checks the current owner at withdrawal time, not a cached
> balance. That is what stops a seller from keeping the income."

### Scene 5: The audit (2:20 to 2:50)

Open `/audit`.

> "Every epoch publishes the total verified hours, the effective rate, every payout, and a hash of
> the raw listening bundle. The rate is fixed at $0.03 in the contract. The platform keeps the
> remainder, and it cannot withdraw below a three-month reserve."

Point at the reserve bar and the latest epoch row. Click the `listenRoot` link. The audit JSON opens.

> "Anyone can recompute the payouts. The oracle is the trust point, and it is fully auditable."

### Scene 6: Close (2:50 to 3:00)

Return to the home screen.

> "Sonata: every song is an account. One pass, a fixed rate, and a master you can sell with its
> wallet."

## 60-second X video script

Use the same flow, cut to:

1. Play a song (5s).
2. Buy the pass receipt (5s).
3. Artist balance and withdraw (10s).
4. Song account with no keys (5s).
5. Buy the master, royalty split (10s).
6. New owner withdraws (5s).
7. Old owner fails (5s).
8. Audit root (5s).
9. Logo and tagline (5s).

Text overlays:

- "Every song is an account."
- "$5 / 30 days. $0.03 per verified hour."
- "The master owns the wallet."
- "Sell the master. The wallet goes with it."
- "The old owner cannot withdraw."

## Failure modes and fallbacks

| Failure                      | Fallback                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Testnet RPC slow             | Use a second RPC; pre-warm the page; keep a recorded clip                           |
| Wallet will not connect      | Use the seeded session and a pre-recorded wallet flow                               |
| Settlement transaction fails | Show the last successful epoch and the audit bundle; explain the retry              |
| Audio does not load          | Use the local files; preload before recording                                       |
| Contract bug found late      | Do not patch on stage. Use the last green deployment and note the fix in the README |
| Judge asks for mainnet       | "Testnet by design; the USDC is a mock and the contracts are the deliverable"       |

## What not to do

- Do not show a seed for a pass with no expiry or a zero balance.
- Do not claim the platform is profitable; say the demo parameters are designed to be sustainable.
- Do not say "guaranteed yield." The marketplace shows trailing earnings, not a promise.
- Do not use the word "mint" in the listener flow. Use "publish" for artists and "NFT" only in
  details.
- Do not show a raw private key, even a test one, on screen.

## Reproducibility

A judge should be able to run:

```bash
bun install
bun run db:up
bun run db:migrate
bun run db:seed
bun run dev
```

Then, with contracts deployed and `.env.local` set:

```bash
bun run demo:check
bun run demo:settle
bun run demo:reset
```

Add these scripts to the root `package.json`. `demo:settle` calls the settlement service with the
oracle key from the environment. `demo:check` verifies balances, ownership, listings, and pass
state. `demo:reset` restores the seed state.

The README links to a public deployment and the demo video. The repo is public before the
submission deadline: **2026-11-14 23:59 UTC**.
