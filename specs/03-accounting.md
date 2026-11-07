# 03 - Accounting

This file is the money contract. If code disagrees with it, the code is wrong.

## Units

| Unit           | Representation              | Example               |
| -------------- | --------------------------- | --------------------- |
| USDC           | `U128`, 6 decimals          | `5_000_000` = $5.00   |
| Rate `R`       | micro-USDC per 3600 seconds | `30_000` = $0.03/hour |
| Listening time | **seconds**, `u64`          | `14_400` = 4 hours    |
| Display hours  | seconds / 3600, 2 decimals  | `4.00 h`              |

The oracle reports **seconds**, not floating-point hours. All on-chain math is integer. The UI
converts to hours for display. This avoids rounding drift and makes the audit bundle exact.

## Constants (locked)

```ts
export const PASS_PRICE_USDC = 5_000_000n; // $5.00
export const PASS_DURATION_SEC = 2_592_000n; // 30 days
export const RATE_PER_HOUR_USDC = 30_000n; // $0.03
export const DAILY_CAP_SEC = 14_400n; // 4 hours
export const ROYALTY_BPS = 500n; // 5%
export const RESERVE_MONTHS = 3n;
export const PRO_RATA_THRESHOLD_MONTHS = 1n;
```

`R` is immutable after deployment. There is no admin setter. The only way to change it is a new
platform contract and a migration, which is out of scope.

## Epoch settlement

An epoch is a settlement window. Production: weekly, Monday 00:00 UTC. Demo: manual trigger from
`/audit`. Epoch ids start at **1** (`platform.new` initializes `next_epoch_id = 1`, so there is no
epoch 0); seeded demo history uses negative ids.

Inputs from the oracle:

```ts
type PayoutEntry = {
  tokenId: string; // "midnight-drive"
  seconds: number; // verified listening seconds in this epoch
};
```

Constraints:

- Entries are sorted by `tokenId` ascending, unique.
- `totalSeconds = sum(seconds)`.
- Every `tokenId` is registered in `platform.song_accounts`.
- Seconds are already capped per user per day and filtered for active passes.

### Step 1: available balance

```
balance = usdc.ft_balance_of(platform)
```

This is all USDC held by the platform: pass revenue plus unspent prior revenue. There is no separate
reserve account. The reserve is a **policy floor** on withdrawals, not a segregated pot.

### Step 2: effective rate

```
if totalSeconds == 0:
    effectiveRate = 0
else:
    effectiveRate = min(R, floor(balance * 3600 / totalSeconds))
```

In integer code:

```rust
let max_rate = balance
    .checked_mul(3600.into()).unwrap()
    .checked_div(total_seconds.into()).unwrap();
let effective = std::cmp::min(rate_per_hour, max_rate);
```

- If `balance >= R * totalSeconds / 3600`, the platform pays the full constant `R`.
- Otherwise it pays a pro-rata rate, because even spending the entire balance cannot fund `R`.
- The platform **never** pays more than its balance.

There is no "spendable = balance - reserve" in the payout formula. Artists are paid first. The
reserve only restricts **platform withdrawals** (step 5). This is deliberate: a reserve that blocks
artist payouts would break the promise.

### Step 3: per-song payout

```
payout_i = floor(effectiveRate * seconds_i / 3600)
```

The sum of payouts is less than or equal to `balance`. Dust from flooring stays in the platform and
is not redistributed in v1. The audit page reports `dust = balance - totalPaid` for the epoch.

### Step 4: transfer

For each entry with `payout_i > 0`:

```
usdc.ft_transfer(song_account_i, payout_i, "epoch:<id>")
```

The transfer is direct. There is no internal `claimable` ledger. The song account's USDC balance is
the artist's balance. The artist withdraws from the song account at any time.

If `payout_i == 0`, skip the transfer and emit no `payout_sent` event. The entry still appears in the
epoch record.

### Step 5: platform revenue

After settlement, the platform balance is:

```
balance_after = balance_before - totalPaid
```

The platform may withdraw:

```
withdrawable = max(0, balance_after - max(reserve_target, one_month_reserve))
```

`withdraw_revenue` enforces this on chain. The owner cannot touch the reserve. The reserve target is
3 months of trailing payouts; the one-month reserve is the hard floor. Both are stored on chain,
updated by the owner, and emitted in events.

### Step 6: record

```ts
type Epoch = {
  id: number;
  startedAt: number;
  closedAt: number;
  balanceBefore: bigint;
  totalSeconds: number;
  effectiveRatePerHour: bigint;
  totalPaid: bigint;
  reserveTarget: bigint;
  oneMonthReserve: bigint;
  listenRoot: string;
  entriesCount: number;
};
```

The contract stores `balanceBefore`, `totalSeconds`, `effectiveRatePerHour`, `totalPaid`, and
`listenRoot`. The indexer adds the per-entry rows.

## Reserve policy

The reserve exists so the platform can keep paying `R` when revenue dips. It is not a separate
account and it is not a claim on future revenue.

| Coverage      | Meaning    | Behavior                                                                         |
| ------------- | ---------- | -------------------------------------------------------------------------------- |
| >= 3 months   | Healthy    | Platform may withdraw above 3 months                                             |
| 1 to 3 months | Building   | Platform may not withdraw below 3 months; payouts still at `R` if balance allows |
| < 1 month     | Distressed | Payouts are pro-rata if `R` would exhaust the balance; no platform withdrawal    |

`reserve_target = 3 * trailing_30d_payouts`. `one_month_reserve = trailing_30d_payouts`. The owner
updates both at the start of each month from the indexer's trailing payout sum. The update emits
`reserve_targets_changed`. In the demo, the values are seeded and the audit page shows them.

The update is owner-only and immediate in v1. A malicious owner could lower the reserve and withdraw.
Mitigation: the owner is the platform multisig in production; for the demo it is a single key and the
risk is documented in `04-threat-model.md`. A future version can timelock the update.

## Worked examples

All examples use `R = $0.03/hour`.

### 1. Healthy epoch

- Balance before: $1,000.00 (`1_000_000_000`)
- Verified seconds: 72,000 (20,000 hours)
- `R * hours = $600.00`
- `max_rate = 1,000,000,000 * 3600 / 72,000 = 50,000` micro-USDC/hour ($0.05)
- `effective = min(30,000, 50,000) = 30,000` ($0.03)
- Total paid: $600.00
- Balance after: $400.00
- Reserve target (3 months at $300/month): $900.00; one-month floor: $300.00
- Withdrawable: `max(0, 400 - max(900, 300)) = $0`
- Platform keeps $400 as reserve. It cannot withdraw until the reserve reaches $900.

### 2. Pro-rata epoch

- Balance before: $250.00 (`250_000_000`)
- Verified seconds: 72,000 (20,000 hours)
- `R * hours = $600.00`, more than the balance
- `max_rate = 250,000,000 * 3600 / 72,000 = 12,500` ($0.0125/hour)
- `effective = min(30,000, 12,500) = 12,500`
- Total paid: $250.00
- Balance after: $0
- Withdrawable: $0
- Event includes `"mode":"pro-rata"` and `effective_rate_per_hour = "12500"`.

### 3. Partial reserve draw

- Balance before: $400.00
- Verified seconds: 36,000 (10,000 hours)
- `R * hours = $300.00`
- `max_rate = 400,000,000 * 3600 / 36,000 = 40,000` ($0.04)
- `effective = 30,000` ($0.03)
- Total paid: $300.00
- Balance after: $100.00
- One-month floor is $300.00, so the reserve is now under one month. No withdrawal. The next epoch
  will be pro-rata if it needs more than the balance.

### 4. Rounding

- 1 second: `30,000 * 1 / 3600 = 8` micro-USDC ($0.000008)
- 3,599 seconds: `30,000 * 3599 / 3600 = 29,991` micro-USDC ($0.029991)
- 3,600 seconds: `30,000` micro-USDC ($0.03)
- Floor everywhere. A song that earns less than 1 micro-USDC in an epoch gets 0 and no transfer.

### 5. Pass unit economics

- One pass: $5.00
- Max verified listening: 4 h/day x 30 days = 120 h
- Max artist payout per pass: 120 x $0.03 = $3.60
- Platform margin at max usage: $1.40
- At 2 h/day: 60 h x $0.03 = $1.80 payout, $3.20 margin
- Break-even usage: $5 / $0.03 = 166.67 h, which is above the 120 h cap. The cap is what makes the
  pass profitable. If the cap is bypassed, a 24 h/day listener generates $21.60 in payouts, so the
  cap is a hard requirement, not a growth limit.

### 6. Sale mid-epoch

- Epoch 7 settles $1.20 into `midnight-drive.masters-sonata.testnet`.
- The seller lists the master for $50.00.
- A collector buys it. The NFT moves to the collector. The song account already holds $1.20.
- The seller's `withdraw` call panics with `"Not the owner"`.
- The collector calls `withdraw_all` and receives $1.20.
- There is no split of the $1.20. It belongs to the song, not to a person. The listing price should
  reflect the balance; the UI shows "includes $1.20 in the song account" on the listing.

### 7. Royalty

- Sale price: $50.00 (`50_000_000`)
- Creator royalty: `50,000,000 * 500 / 10_000 = 2,500,000` ($2.50)
- Seller proceeds: `50,000,000 - 2,500,000 = 47,500,000` ($47.50)
- If the creator is also the seller, they receive both sides: $50.00 total. The 5% is not a fee to
  the platform; it is a payment to the creator.

## Listening verification

The chain trusts the oracle. The oracle trusts the listen pipeline. The pipeline is specified here.

### Heartbeats

- The player sends a heartbeat every **15 seconds** while playing and the tab is visible.
- A heartbeat includes `sessionId`, `songId`, `positionMs`, `playedMs`, `visibility`, and a
  server-issued `sessionToken`.
- `sessionToken` is a short-lived JWT bound to `(userId, songId, passExpiry, sessionId)`, signed by
  the API with `LISTEN_SESSION_SECRET`. It expires after 2 hours and is single-use per session.
- The player must send a heartbeat within 30 seconds of the previous one. A gap larger than 30
  seconds credits at most 15 seconds and starts a new segment.

### Server checks

A heartbeat is **verified** only if all of the following hold:

1. The session token is valid and matches the user, song, and session.
2. The user has an active pass at the heartbeat timestamp (`pass_expiry > now`).
3. `positionMs` is within `[0, durationMs + 2000]`.
4. `playedMs` since the last heartbeat is between 0 and 20,000.
5. The tab is visible. Hidden time is not credited.
6. The playback rate is 1.0 (the player does not support speed changes in v1).
7. The account has at most 3 concurrent sessions.
8. The song is not already being counted in another session for the same account.

### Aggregation

- Events are grouped by `(account_id, song_id, UTC day)`.
- Credit is the sum of verified gaps, capped at `DAILY_CAP_SEC` per account per day.
- The daily cap is applied **across all songs**, not per song. Once an account hits 4 hours in a day,
  later events are marked `capped` and excluded.
- Only time inside the epoch window is included.
- Self-listening by the song's current owner or creator is **excluded**. This prevents an artist from
  farming their own master. Document this in the UI: "Owner and creator listens do not earn."
- The oracle publishes the full bundle before submitting:

```json
{
  "epochId": 7,
  "start": 1764547200,
  "end": 1765152000,
  "ratePerHour": "30000",
  "entries": [
    { "tokenId": "midnight-drive", "seconds": 14400 },
    { "tokenId": "paper-moons", "seconds": 7200 }
  ],
  "totalSeconds": 21600,
  "listenRoot": "ipfs://bafy...",
  "generatedAt": 1765152100
}
```

The bundle contains per-user rows (hashed account ids) so artists can audit without exposing raw
listener identities. The hash of the bundle is stored as `listenRoot`. The settlement service pins
the bundle to IPFS; the demo also writes it to `public/audit/epoch-<id>.json`.

### Oracle

- The oracle key is separate from the platform owner key.
- The oracle runs in `services/settlement`, not in the browser.
- It computes the bundle, pins it, and calls `platform.settle_epoch`.
- The oracle cannot change the rate, withdraw platform revenue, or mint passes.
- A compromised oracle can inflate hours up to the platform balance. Mitigations: the owner can
  `pause` settlement, the balance is finite, and the reserve withdrawal lock prevents the owner from
  draining it. A per-epoch cap is a v2 hardening item.

## Money invariants

These must hold after every operation:

1. `sum(song account balances) + platform balance + market escrow == total USDC minted - burned`.
2. `platform.balance >= 0`.
3. `platform.balance` after a settlement equals `balance_before - total_paid`.
4. `sum(payouts) <= balance_before`.
5. `effective_rate <= R`.
6. `platform.withdraw_revenue` can never reduce the balance below
   `max(reserve_target, one_month_reserve)`.
7. A song account's USDC can only leave via `withdraw` to the current NFT owner.
8. The sum of royalties and seller proceeds on a sale equals the sale price.
9. A pass cannot be transferred.
10. `R` cannot change.

## Accounting tests

- Healthy epoch pays R.
- Pro-rata epoch pays `balance/hours`.
- Zero hours pays nothing and leaves the balance untouched.
- One-second entry floors to 8 micro-USDC.
- Duplicate or unsorted entries panic.
- Missing song account panics before any transfer.
- Settlement twice with the same epoch id panics.
- Revenue withdrawal above the reserve succeeds; below the reserve panics.
- Sale royalty is exactly 5%, rounded down.
- Old owner withdrawal after sale panics.
- A self-listen by the owner is excluded.
- The 4-hour daily cap is enforced across songs.
- A heartbeat with a hidden tab or no active pass is not credited.
