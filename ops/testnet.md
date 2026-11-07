# Sonata testnet deployment

Status: the full demo chain is deployed on testnet (core contracts, platform, market,
12 masters, 5 resale listings and the listener pass), and the 2026-11-08 chain rescue
replaced the broken song wallets with keyless wallets running the fixed global code.
`scripts/check-demo.sh` prints `66 passed, 0 failed, 0 skipped`.

## Identifiers

| Role                    | Account                    | NEAR (after rescue)                                      |
| ----------------------- | -------------------------- | -------------------------------------------------------- |
| Parent / faucet / owner | `sonata.testnet`           | ~2.56 (≈25.84 NEAR is locked in the **new** global code) |
| Mock USDC (NEP-141)     | `usdc-sonata.testnet`      | ~3.03                                                    |
| Master NFT collection   | `masters-sonata.testnet`   | ~6.91                                                    |
| Platform / settlement   | `platform-sonata.testnet`  | ~4.47                                                    |
| Market                  | `market-sonata.testnet`    | ~7.56                                                    |
| Listen oracle           | `oracle-sonata.testnet`    | 1.00                                                     |
| Artist Nadia            | `nadia-sonata.testnet`     | ~2.05                                                    |
| Artist Kofi             | `kofi-sonata.testnet`      | ~1.53                                                    |
| Artist Lena             | `lena-sonata.testnet`      | ~1.56                                                    |
| Listener                | `listener.sonata.testnet`  | 1.00                                                     |
| Collector               | `collector.sonata.testnet` | ~0.98                                                    |
| Spare faucet identity   | `nadia.sonata.testnet`     | 2.00                                                     |

Each replacement song wallet holds about 0.298 NEAR; the code is shared global code, so
a wallet pays only for its account, initialized state and USDC registration.

Keys live locally in the macOS keychain (`sign-with-keychain`) and in
`~/.near-credentials/accounts.json`. Never commit that file or a copy of it.

Song accounts are keyless. The **live** payout accounts are the replacement
`<token>-v2.masters-sonata.testnet` accounts (see
[Chain rescue](#chain-rescue-2026-11-08)); the original
`<token>.masters-sonata.testnet` accounts still exist in the NFT metadata but no
longer receive payouts.

The spec's original dotted names (`masters.sonata.testnet`, `nadia.testnet`) were
placeholders. These hyphenated accounts are the deployed testnet names.
`ops/testnet.env` is the source of truth for scripts (`SONG_WALLET_CODE_HASH` names
the immutable global code).

## Deployed state

| Contract                          | Account                                                  | Deployment tx                                  |
| --------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `mock-usdc` (v2 during rescue)    | `usdc-sonata.testnet`                                    | `7rkSQdZp2DxSpGE3eqSjn85UZULTguoe2Kh5FD7zdwCg` |
| `song-wallet` (global, immutable) | code hash `7a5e1ngxxtsn4Q9wavUzgTsiw2rveqvBRqFaX2uki4Gr` | `EmEKWWGhiPtb4X1xSfdTiB15mzMUQtth3T79cM2xRzwT` |
| `master-nft`                      | `masters-sonata.testnet`                                 | `ATZJhwhpeZHV4qbgRxkVV4XGVV9J3GRQ63ZXBDrzLF2G` |
| `platform` (v2 during rescue)     | `platform-sonata.testnet`                                | `2DxtPGresXbXBEkxyhFY4wPc4tADs81MC3WXRRGHQjCF` |
| `market`                          | `market-sonata.testnet`                                  | `A3fNoVnQpBhkC4hDBBzcu8RnZSgmotS5thPpAXzr3j8V` |

Deployed code hashes after the rescue: platform
`7Avy2DZ8PBxjEy7da7H9T9Ze1CLM1JZGv1Vz7XJqs54e`, market
`7xxARpMzwxs2P59ki6A1eqou7o3i8cnMzwhckPGZnFJz`, master collection
`BEUYq18tdtJkRr1adcmomToj9YRFHW9zjp6mSPJ6sTYK`, mock USDC
`7VTDQPoeY19byvmY4PW9T1dBabsharzehLRvxXUVXYEL`.

`song-wallet` global code hash:
`7a5e1ngxxtsn4Q9wavUzgTsiw2rveqvBRqFaX2uki4Gr`,
which is base58(sha256(`contracts/target/wasm32-unknown-unknown/release/song_wallet.wasm`)).
The superseded hash `2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS` (deployment tx
`8Z2XAssgGwpiAvzogTeqSUPMufrbhn6PQuYLVaGSRM91`) is still global and still backs the
original wallets.

`master-nft.get_config` as deployed:

```json
{
  "owner_id": "sonata.testnet",
  "collection_id": "masters-sonata.testnet",
  "platform_id": "platform-sonata.testnet",
  "payment_token": "usdc-sonata.testnet",
  "song_wallet_code_hash": "7a5e1ngxxtsn4Q9wavUzgTsiw2rveqvBRqFaX2uki4Gr",
  "mint_deposit": "100000000000000000000000",
  "token_supply": 12,
  "royalty_bps": 500
}
```

`platform.get_stats` after epoch 2:

```json
{
  "balance": "1004820000",
  "reserve_target": "900000000",
  "one_month_reserve": "300000000",
  "rate_per_hour": "30000",
  "total_paid": "180000",
  "next_epoch_id": 3,
  "paused": false,
  "oracle_id": "oracle-sonata.testnet",
  "subscription_price": "5000000"
}
```

`market.get_listings(0, 100)` returns five active `(TokenId, Listing)` rows; see
[Demo chain writes](#demo-chain-writes) and [E2E](#full-money-flow-e2e-2026-11-08).

USDC: symbol `USDC`, 6 decimals, owner `sonata.testnet`, total supply `1220060000`
micro-USDC (1,220.06 USDC). The extra 60,000 micro-USDC was minted to refill
`midnight-drive-v2` so the dashboard withdrawal could be exercised twice
(`EgSLDAGEH8ozq3gGsAXX4ycmPBoSL7yfFzQYqp34jd9p`).

Demo USDC balances after the rescue E2E (micro-USDC, 6 decimals):

| Account                    | Micro-USDC   | USDC    |
| -------------------------- | ------------ | ------- |
| `listener.sonata.testnet`  | `15000000`   | 15.00   |
| `collector.sonata.testnet` | `180060000`  | 180.06  |
| `platform-sonata.testnet`  | `1004820000` | 1004.82 |
| `kofi-sonata.testnet`      | `20000000`   | 20.00   |
| `nadia-sonata.testnet`     | `120000`     | 0.12    |

`kofi` received the $20 after-rain sale; `collector` paid it and then withdrew the
master's $0.06 song-account balance; `nadia` withdrew $0.12 of Midnight Drive
earnings (two $0.06 withdrawals during E2E).

## Chain rescue (2026-11-08)

The original wallets ran immutable code whose `ft_transfer` promise did not attach the
1 yoctoNEAR NEP-141 requires and whose gas budgets were too small; `midnight-drive`
was also wedged in `is_claiming: true`. Global-code accounts cannot change their code
hash in place, so each master got a replacement account. Nothing was re-minted and no
NFT, listing, pass, epoch or payout row was reset.

### Global code

The fixed wasm was deployed as a new immutable global contract signed by
`sonata.testnet`; the code-storage charge was 25.8371 NEAR and the transaction is
`EmEKWWGhiPtb4X1xSfdTiB15mzMUQtth3T79cM2xRzwT`. `sonata.testnet` was funded for it
from the demo artist accounts (see [Funding transfers](#funding-transfers)). The
collection was then pointed at the new hash with
`masters.set_song_wallet_code_hash` (`9jkVEPbAe7bAZkiWobsiM8Edwq4m8XMjGbgEcnm8Muhw`).

`CryptoHash` deserializes from a JSON **array of 32 bytes**, not a base58 string:

```bash
HASH_ARRAY='[97,159,136,91,153,152,114,5,128,54,210,227,186,216,68,150,81,60,147,212,100,18,116,23,40,95,97,47,118,156,127,219]'
near contract call-function as-transaction masters-sonata.testnet set_song_wallet_code_hash \
  json-args "{\"hash\":$HASH_ARRAY}" prepaid-gas 30Tgas attached-deposit 0NEAR \
  sign-as sonata.testnet network-config testnet sign-with-keychain send
```

### USDC and platform upgrades

Both were redeployed with the new wasm **without re-init**, so state and balances
survived:

| Contract    | Previous code hash                             | New code hash                                  | Tx                                             |
| ----------- | ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `mock-usdc` | `3yxyTigFbVEHmwKq3CHAkhoMhXnyoBQRs4FCsrbTtNQd` | `7VTDQPoeY19byvmY4PW9T1dBabsharzehLRvxXUVXYEL` | `7rkSQdZp2DxSpGE3eqSjn85UZULTguoe2Kh5FD7zdwCg` |
| `platform`  | `GSvQDjqoVTrnGPMtdXW2dPoCvZJ2pe4xk1zkaD62s44b` | `7Avy2DZ8PBxjEy7da7H9T9Ze1CLM1JZGv1Vz7XJqs54e` | `2DxtPGresXbXBEkxyhFY4wPc4tADs81MC3WXRRGHQjCF` |

Verification after both deploys: `ft_metadata`/`ft_total_supply` and every demo
`ft_balance_of` were unchanged; `platform.get_stats`, `pass_expiry`, `get_epoch(1)` and
every `get_song_account` survived. `set_song_account` is owner-only and was called by
`sonata.testnet` 12 times.

### Funding transfers

`sonata.testnet` started at 1.90 NEAR, not enough for the ~25.84 NEAR global-code
storage.

| From                   | To               | Amount   | Tx                                             |
| ---------------------- | ---------------- | -------- | ---------------------------------------------- |
| `nadia-sonata.testnet` | `sonata.testnet` | 2.5 NEAR | `EoPeHJC7QtUHFUEguiahKD3KZLVWrdPkBKXPnUykPZU2` |
| `nadia-sonata.testnet` | `sonata.testnet` | 5 NEAR   | `Br2YPn5gQn7Jv2s6pdJdAhM47cxvfSRMnNm3TMuhK7Xv` |
| `kofi-sonata.testnet`  | `sonata.testnet` | 8 NEAR   | `99UbdMsb74j9EPz6ac3JYxuNV3bTXsVkdawebdTUB6xv` |
| `lena-sonata.testnet`  | `sonata.testnet` | 8 NEAR   | `FNNiJ3a2rJuDf3wrce6kK7h6GXtSrvX3UrNik5qYG1go` |
| `nadia.sonata.testnet` | `sonata.testnet` | 3 NEAR   | `31A5DUMQ1egFaNbvwPRDLt8rwXzbAGDYphzFzbegUd5E` |

The 12 replacements were created as sub-accounts of the collection with 0.3 NEAR
each; `masters-sonata.testnet` paid that (its free balance after the rescue is about
1.6 NEAR above the contract's storage stake).

### Replacement wallets

| Token            | Live payout account                        | Superseded account                      |
| ---------------- | ------------------------------------------ | --------------------------------------- |
| `midnight-drive` | `midnight-drive-v2.masters-sonata.testnet` | `midnight-drive.masters-sonata.testnet` |
| `paper-moons`    | `paper-moons-v2.masters-sonata.testnet`    | `paper-moons.masters-sonata.testnet`    |
| `velvet-static`  | `velvet-static-v2.masters-sonata.testnet`  | `velvet-static.masters-sonata.testnet`  |
| `slow-arc`       | `slow-arc-v2.masters-sonata.testnet`       | `slow-arc.masters-sonata.testnet`       |
| `harbor-lights`  | `harbor-lights-v2.masters-sonata.testnet`  | `harbor-lights.masters-sonata.testnet`  |
| `glass-hours`    | `glass-hours-v2.masters-sonata.testnet`    | `glass-hours.masters-sonata.testnet`    |
| `northbound`     | `northbound-v2.masters-sonata.testnet`     | `northbound.masters-sonata.testnet`     |
| `after-rain`     | `after-rain-v2.masters-sonata.testnet`     | `after-rain.masters-sonata.testnet`     |
| `copper-sky`     | `copper-sky-v2.masters-sonata.testnet`     | `copper-sky.masters-sonata.testnet`     |
| `low-tide`       | `low-tide-v2.masters-sonata.testnet`       | `low-tide.masters-sonata.testnet`       |
| `signal-fire`    | `signal-fire-v2.masters-sonata.testnet`    | `signal-fire.masters-sonata.testnet`    |
| `quiet-machines` | `quiet-machines-v2.masters-sonata.testnet` | `quiet-machines.masters-sonata.testnet` |

The machine-readable copy is `scripts/demo-wallets.json`, written by the rescue
script. Each wallet was created (key saved to the keychain only for setup), deployed
with `use-global-hash`, initialized with
`collection_id = masters-sonata.testnet`, `token_id = <token>`,
`payment_token = usdc-sonata.testnet`, registered on USDC with
`storage_deposit({ registration_only: true })` and then stripped of every access key.
The platform mapping and `sonata_song.sub_account` were updated last, so a failure
mid-run never left the app pointing at a half-initialized wallet.

Representative transaction trail for one full wallet (the script prints the same six
ids for each token and is idempotent):

| Step                              | `midnight-drive-v2` tx                         | `quiet-machines-v2` tx                         |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| create 0.3 NEAR sub-account       | `FLi8tuarzhdQ1WeNKvaVQteeFfFySpobDp6nyf3Ryd7S` | `HL3AEdZMj6j1MTPed7iyqvLK3rxpzyspW9zUBqMk1QK9` |
| deploy global song-wallet code    | `4h7UhqyW8hPoY1vEVo1w7k99g9gxZjSnGwJvMAQz71tv` | `H5L6ykW2geNbEVGxhxTq941zCyonnyJxWptFEKFhdVE5` |
| `new(collection, token, payment)` | `6bGmNpHnDgNESkmN52WnjnQUNU76qyaZGpUuPVxQoK8p` | `9K4SJFVMzuLNbCtmbyk57y2L791XyTVQqVTz9aAHEB7E` |
| USDC `storage_deposit`            | `4XfNjDB5u69EbHfJ5dXgi1FGmuULTzE9qT6ew9HziTmW` | `GLQZJ3i5T9ZmGvLhrhxmQBkbcUV6TmwD4KdFzczxQTMo` |
| delete all access keys            | `KsfGgU89r9Pzizq651a6trGg8LJP6Kp6DRGSJ8V1gkC`  | `57ELDn56Sei95hGASDchqfzY5mn66ZVEVYnxYPxDKvWv` |
| `platform.set_song_account`       | `9WEF2L2vZzP2W14nSQjpa5qxdh8PSwdMoHXA5ikojBry` | `BLB6hcyD1dhRPwcNxKECfcS5vJ2QjaWDCNqQQtLysUDr` |

`signal-fire-v2` needed only the final mapping repair after an RPC rate limit
(`7ZbiZKfLSWvx2Cs65DXhM9qdrjQnRY78eRVi1Y4EH175`); every wallet was verified keyless
with `global_contract_hash = 7a5e…4Gr` before the mapping moved.

Postgres was updated with
`scripts/rescue-song-wallets.sh --update-db`: only `sonata_song.sub_account` and
`updated_at` changed. Owners (`sonata_ownership`/`sonata_song.owner_account_id`),
listings, passes, epochs and payouts were not reset.

The original wallets still hold the epoch-1 earnings (`midnight-drive` 0.03 USDC and
wedged with `is_claiming: true`, `after-rain` 0.03 USDC). Those funds are stranded by
the old immutable code; they are deliberately not part of the live payout path.

## Full money flow E2E (2026-11-08)

The app ran on `http://localhost:3001` with `.env`/`.env.local`; the buy and withdrawal
surfaces were driven with Chrome via Playwright against the real pages. The page waits
for the target button's React props before clicking, because Next dev hydrates the
streamed table several seconds after paint.

| Step                           | Surface                                          | Result                                                                         | Evidence                                       |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| Artist withdraw (nadia)        | `/artist/dashboard` → Midnight Drive → Withdraw  | toast `Withdrew from Midnight Drive`; wallet 0.06 → 0, nadia +0.06             | `FUvtA8wrTFK6kZo8VQn6jPkd2RVMX3GRTNaswK86AqR6` |
| Buy after-rain (collector)     | `/master/after-rain` → Buy for $20.00            | toast `Master bought`; chain owner collector; listing inactive; `synced: true` | `HAc1amw9y58eU5gAUKo77GbDFoNNKgDF723SSWyRwJsn` |
| New owner withdraw (collector) | `/master/after-rain` → Withdraw earnings         | toast `Earnings withdrawn`; wallet 0.06 → 0, collector +0.06                   | `DRAeQnZNsQi4PtD7Tfdm6oRvGFXDyifKjMAtjMrLvcUU` |
| Old owner blocked (nadia)      | `sonata.songs.withdraw` tRPC (nadia, after-rain) | `FORBIDDEN`: "…owned by collector.sonata.testnet…", no receipt, no funds       | tRPC pre-check                                 |
| Relist after-rain (collector)  | `sonata.market.list` tRPC (collector, $20)       | 5 active listings, seller collector, `synced: true`                            | `7PzdEWf4PtPLSpopsw9xHeb9eNN1PxUVaa7CfimFF1EX` |
| Free preview (no active pass)  | `/master/midnight-drive` → Play                  | paused at 30s with `30-second preview ended` + pass CTA and toast              | DB pass expired then restored                  |

The relist needed one direct `masters.nft_approve` retry after a transient
`WasmTrap(Unreachable)` from the RPC (`4JzBFaz58gfXB4We6nQGVeghK4VPWkuw3TuhtwfjUYNX`);
the same call through tRPC then succeeded. The preview test temporarily moved only
`sonata_pass.expires_at` (cached pass) to the past and restored
`2026-12-01 12:46:04.543498`; the on-chain pass was never touched.

Post-E2E state: `after-rain` is owned and re-listed by `collector.sonata.testnet` at
20.00 USDC; the library page shows it under "Masters you own"; the DB owner, listing
row and `sonata_ownership` sale row all match the chain.

## Epoch 2

120 verified heartbeats (60 × 60s for `midnight-drive` and `after-rain`) were recorded
as `listener.sonata.testnet` through
`POST /api/trpc/sonata.listen.record`. The oracle then settled chain epoch 2:

- tx `8v8NRwewY3Zm6nXuXZwrKGjxmwN3BbXJsoFfSRx5JWrB`
- `total_seconds` 14400, `effective_rate_per_hour` 30000, `total_paid` 120000
- payouts: `midnight-drive` and `after-rain` 7200s each → 60000 micro-USDC each,
  sent to the replacement wallets `midnight-drive-v2` and `after-rain-v2`
- platform balance 1004940000 → 1004820000; `next_epoch_id` 3

Note: the demo settlement window is a rolling seven days, so the 60+60 verified
heartbeats already paid in epoch 1 were re-aggregated. That is why epoch 2 totals
14400s (2×7200) instead of the 7200s added by this run, and why each new wallet
received $0.06 instead of $0.03. No history was deleted or overwritten.

## Demo chain writes

The original mint/approve/list/pass writes are unchanged from the first deployment
(2026-11-07); see the [mint transaction table](#mint-and-listing-transactions).

### Mint and listing transactions

| Write                              | Transaction                                    |
| ---------------------------------- | ---------------------------------------------- |
| Mint `midnight-drive`              | `34upSBFwqZ8xAVt8yUcUYXfAJfxNxdtKvkrdtiqXsrFs` |
| Mint `paper-moons`                 | `HRKYVoGy7diNCopJAt7THnuHfFc6BkrxcoB21UMLBxve` |
| Mint `velvet-static`               | `96utEvxjp6bTnWkKXJ77RLKzSG5ADV7654VSCfXscPYX` |
| Mint `slow-arc`                    | `8DTvz21qL4c292vXqycAm22RqXtNUJbT5gT1jV3V592b` |
| Mint `harbor-lights`               | `D7u6tAgBwuLrowd9KwAPULAfUhZpA24Uy9ALdALft1sv` |
| Mint `glass-hours`                 | `BweVptCy3nSvWKoaGSAq2byawttRcuFXVqckHdXXxx1k` |
| Mint `northbound`                  | `FatDidxAR9yHQzrPrc9e1Gd2YVUe5xmsCsTpTetBK6Vn` |
| Mint `after-rain`                  | `5ZAypbqQqZVY41kxmWXNXJMQTWf6LnH23mxEink7bKX8` |
| Mint `copper-sky`                  | `3BYptGqPde892KhcKdDiHbhRctLNWvbSmBKwsddamo4N` |
| Mint `low-tide`                    | `2vCZcTZqGkk46XUJ9RQcL5zWvUFF8Ct4ShNFWkBizVmh` |
| Mint `signal-fire`                 | `BtXpFHsnawmDYqtZN8YTUdMCMjhdCKZj7QN6KDwBwb9E` |
| Mint `quiet-machines`              | `2HxKfHQZXGnk9s14N5AL5kJ3APCfsQyiTxiZzYqm23sj` |
| Approve `midnight-drive`           | `9AgwHN69o6quV29vpVoFAk2aSBVa2SYiksVcm8aShorq` |
| List `midnight-drive` (50.00 USDC) | `G46rLzrvjcTJ4WujFrHnsxGPr1FN87kK2oUUn2r88KD`  |
| Approve `velvet-static`            | `53cJ6nEvdWGwz84K3WhNuDhFfifjCsxPUXKqme8QjKez` |
| List `velvet-static` (35.00 USDC)  | `G58GbDDbL8viexS26x9RCAkMnEWfXh3zipy1B1bctY3w` |
| Approve `harbor-lights`            | `Cxs7MEyJGDtxBsYHoBoFtDJLDDFnU8pTmUoHLRuRkcEN` |
| List `harbor-lights` (80.00 USDC)  | `5SW9fvCWC3JeAPwsuW9gnmJpC9o3nrDaoEodNy1Ltt6f` |
| Approve `after-rain`               | `52G8srDrMiiDQ73oqW9mwFTD1Z6WTZYsaKQHoTsC7EeN` |
| List `after-rain` (20.00 USDC)     | `8Z4hkYjqZ8pRXxTWKiDgU6CuYRV8dSo3iVvv9e3huHwz` |
| Approve `signal-fire`              | `5x45m4iBmjhhehXnhsJHLJxdjPkh1kQxw1FKvNB9BqRm` |
| List `signal-fire` (65.00 USDC)    | `2ySsoDSiXggTuWbiM3PNbwW3ZjTkN9oE6fJtFiqXZ8LG` |
| Buy listener pass (5.00 USDC)      | `3NDAvwfaDm2c3TAn2ypmfLNpLahoCHiCUaub3jSsdcqL` |

## Repeatable scripts

From the repository root:

```bash
# Build, deploy (idempotent) and verify the three core contracts.
scripts/deploy-testnet.sh

# Same, then top the demo accounts up to their target USDC balances.
scripts/deploy-testnet.sh --fund-demo

# Build, deploy (idempotent) and verify platform + market.
scripts/deploy-platform-market.sh

# Mint the 12 masters, approve + list five of them, buy the listener pass.
scripts/mint-demo.sh

# Recreate/verify the 12 keyless replacement song wallets and the mapping file.
scripts/rescue-song-wallets.sh

# Same, and point sonata_song.sub_account at them (needs the local Postgres).
scripts/rescue-song-wallets.sh --update-db

# Read-only status of USDC, collection, masters, listings, pass and wallets.
scripts/check-demo.sh
```

`scripts/rescue-song-wallets.sh` reads `scripts/demo-catalogue.json`, creates
`<token>-v2.masters-sonata.testnet` sub-accounts funded by
`masters-sonata.testnet`, deploys the global hash from `SONG_WALLET_CODE_HASH` (or
the local wasm), initializes, registers on USDC, deletes every access key, sets the
platform mapping and writes `scripts/demo-wallets.json`. Every step checks current
chain state first, so a re-run only verifies. It sleeps between transactions to stay
under the archival RPC rate limit; `RESCUE_SLEEP` and `WALLET_FUND` override the
defaults. The `--update-db` flag needs `sonata-postgres` running.

`scripts/check-demo.sh` talks to the RPC with read-only view calls (`curl` +
`python3`, no `jq`/npm) so it never prompts for a keychain password. It verifies the
12 masters, the five listings, the listener pass, and the **platform-mapped
replacement wallets** (global code hash + initialized config + zero access keys). It
also accepts the post-E2E state: `after-rain` owned/relisted by the collector and a
collector USDC floor of 180.00. The scripts default to
`https://rpc.testnet.fastnear.com`; set `SONATA_RPC_URL` (or `NEAR_RPC_URL`) to
override.

## Exact commands used

All `near` write commands were wrapped in a pseudo-TTY because near-cli-rs 0.30.1 is
interactive:

```bash
yes '' | script -q /dev/null near ...
```

Build:

```bash
cargo build --manifest-path contracts/Cargo.toml --workspace \
  --target wasm32-unknown-unknown --release
```

1. Mock USDC (`attached-deposit` must include a unit; plain `0` is rejected):

```bash
source ops/testnet.env
yes '' | script -q /dev/null near contract deploy "$USDC_ACCOUNT" \
  use-file contracts/target/wasm32-unknown-unknown/release/mock_usdc.wasm \
  with-init-call new json-args '{"owner_id":"sonata.testnet"}' \
  prepaid-gas 30Tgas attached-deposit 0NEAR \
  network-config testnet sign-with-keychain send
```

2. Song wallet as an immutable global contract (the signer pays storage for the code;
   the 258 KB wasm locked 25.84 NEAR in `sonata.testnet`):

```bash
yes '' | script -q /dev/null near contract deploy-as-global \
  use-file contracts/target/wasm32-unknown-unknown/release/song_wallet.wasm \
  as-global-hash sonata.testnet \
  network-config testnet sign-with-keychain send
```

`deploy-as-global ... as-global-hash` prints `Wasm code hash: ...` and skips the
deploy if that hash is already global. `contracts/scripts/deploy-core.sh`'s
`sha256_base58` helper derives the same hash locally.

3. Master collection:

```bash
MASTER_ARGS='{"owner_id":"sonata.testnet","metadata":{"spec":"nft-1.0.0","name":"Sonata Masters","symbol":"SONG","icon":null,"base_uri":null,"reference":null,"reference_hash":null},"platform_id":"platform-sonata.testnet","payment_token":"usdc-sonata.testnet","song_wallet_code_hash":"7a5e1ngxxtsn4Q9wavUzgTsiw2rveqvBRqFaX2uki4Gr","mint_deposit":"100000000000000000000000"}'

yes '' | script -q /dev/null near contract deploy "$MASTERS_ACCOUNT" \
  use-file contracts/target/wasm32-unknown-unknown/release/master_nft.wasm \
  with-init-call new json-args "$MASTER_ARGS" \
  prepaid-gas 100Tgas attached-deposit 0NEAR \
  network-config testnet sign-with-keychain send
```

4. In-place wasm upgrades (no `with-init-call`, so state survives):

```bash
yes '' | script -q /dev/null near contract deploy "$USDC_ACCOUNT" \
  use-file contracts/target/wasm32-unknown-unknown/release/mock_usdc.wasm \
  without-init-call network-config testnet sign-with-keychain send

yes '' | script -q /dev/null near contract deploy "$PLATFORM_ACCOUNT" \
  use-file contracts/target/wasm32-unknown-unknown/release/platform.wasm \
  without-init-call network-config testnet sign-with-keychain send
```

Verify read-only:

```bash
yes '' | script -q /dev/null near contract call-function as-read-only "$USDC_ACCOUNT" \
  ft_metadata json-args '{}' network-config testnet now

yes '' | script -q /dev/null near contract call-function as-read-only "$MASTERS_ACCOUNT" \
  get_config json-args '{}' network-config testnet now

# Global code exists (result contains a non-empty code_base64):
curl -s -X POST "$NEAR_RPC_URL" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"x","method":"query","params":{"request_type":"view_global_contract_code","finality":"final","code_hash":"7a5e1ngxxtsn4Q9wavUzgTsiw2rveqvBRqFaX2uki4Gr"}}'
```

Mint demo USDC (owner-only; `sonata.testnet` signs, `mint` auto-registers the
recipient):

```bash
yes '' | script -q /dev/null near contract call-function as-transaction "$USDC_ACCOUNT" mint \
  json-args '{"account_id":"listener.sonata.testnet","amount":"20000000"}' \
  prepaid-gas 30Tgas attached-deposit 0NEAR \
  sign-as sonata.testnet network-config testnet sign-with-keychain send

yes '' | script -q /dev/null near contract call-function as-read-only "$USDC_ACCOUNT" \
  ft_balance_of json-args '{"account_id":"listener.sonata.testnet"}' \
  network-config testnet now
```

## CLI quirks (near-cli-rs 0.30.1)

- The CLI expects a TTY. On macOS wrap every write as
  `yes '' | script -q /dev/null near ...`; `scripts/deploy-testnet.sh` does this
  automatically when stdin is not a terminal.
- `attached-deposit`/token amounts need a unit. `attached-deposit 0` fails with
  `invalid token unit: 0`; use `0NEAR`.
- `contract deploy` signs as the account being deployed (no `sign-as`). `call-function
  as-transaction` needs `sign-as <signer>` before `network-config`, and read-only calls
  end in `now`.
- `contract deploy-as-global ... as-global-hash` charges the code storage to the
  signer, not to the contract account. Fund the signer first; the code is immutable
  and the hash is the same regardless of which account deployed it.
- `contract deploy ... use-global-hash <hash> without-init-call` installs an existing
  global code on an account; the account signs it. `scripts/rescue-song-wallets.sh`
  uses this plus `account delete-keys`.
- `set_song_wallet_code_hash` takes `CryptoHash`, which is a 32-element JSON byte
  array (base58 strings are rejected with `WasmTrap(Unreachable)`).
- `sign-with-keychain` is macOS-only. Keys for every account already exist in the
  keychain; never print or commit them.
- near-cli-rs defaults to `https://archival-rpc.testnet.fastnear.com/` for its calls,
  while `ops/testnet.env` points `NEAR_RPC_URL` at `https://rpc.testnet.fastnear.com`.
  The public archival endpoint rate-limits bursts; the rescue script sleeps between
  writes and is safe to re-run.
- `contracts/scripts/deploy-core.sh` was fixed for 0.30.1 (`attached-deposit 0` →
  `0NEAR`). It still assumes the caller provides a TTY (wrap it as above) and expects
  the target accounts to exist.

## Deploy order

1. ✅ Build all wasm:
   `cargo build --manifest-path contracts/Cargo.toml --workspace --target wasm32-unknown-unknown --release`
2. ✅ Deploy mock USDC to `usdc-sonata.testnet` with owner `sonata.testnet`
   (upgraded in place on 2026-11-08).
3. ✅ Deploy song-wallet as a global contract and record its code hash
   (new hash deployed 2026-11-08).
4. ✅ Deploy platform to `platform-sonata.testnet` with USDC, masters, oracle and the
   demo treasury `sonata.testnet` (`6TtCMN2aQ5jQ2gSXw2g7TVLM21Wgo2RPNNkqwhgT5nV4`;
   upgraded in place on 2026-11-08).
5. ✅ Deploy master-nft to `masters-sonata.testnet` with platform, USDC, song-wallet
   code hash and a 0.1 NEAR mint deposit.
6. ✅ Deploy market to `market-sonata.testnet` with masters, USDC and owner
   (`A3fNoVnQpBhkC4hDBBzcu8RnZSgmotS5thPpAXzr3j8V`).
7. ✅ Constructor wiring. `master-nft.platform_id` was already
   `platform-sonata.testnet`, and `platform.new` received the oracle and reserve
   targets, so no owner setters were needed.
8. ✅ Mint the 12 demo masters from the artist accounts.
9. ✅ Register all five demo accounts (`listener`, `collector`, `nadia`, `kofi`,
   `lena`) on USDC and send listener/collector mock USDC.
   `scripts/deploy-testnet.sh --fund-demo` does this idempotently
   (`storage_deposit` refunds the deposit when an account is already registered).
10. ✅ Register platform and market on USDC (their constructors call
    `storage_deposit`).
11. ✅ Approve the market for five masters, list them and buy the listener pass.
12. ✅ Rescue the song wallets: deploy the fixed global code, repoint the collection,
    upgrade USDC + platform in place, create 12 keyless replacement wallets, update
    `platform.song_accounts` and `sonata_song.sub_account`.
13. ✅ Record 120 verified heartbeats and settle chain epoch 2.
14. ✅ Run the buy/withdraw/relist/preview E2E and `scripts/check-demo.sh` (66/66).

## Blockers

None for the chain demo. `scripts/check-demo.sh` reports
`66 passed, 0 failed, 0 skipped` against the post-E2E testnet state.

Operational notes:

- Writes need macOS keychain (`sign-with-keychain`) and a pseudo-TTY. `script` may exit
  1 with `write master: Input/output error` after a successful transaction, so trust
  the printed `Transaction ID`, not the wrapper status.
- The public archival RPC rate-limits bursts of signing/access-key calls. Keep a few
  seconds between consecutive `near` writes (the rescue script does).
- Deploying a wasm needs the code storage in the target account. A global code deploy
  needs the full storage on the **signer** (~25.84 NEAR for 258 KB).
- The original song wallets are still keyless and immutable; their 0.03 USDC each is
  stranded and `midnight-drive`'s is wedged. The fixed path is the replacement
  wallets. Do not delete the original accounts: the NFT metadata still references
  them.
- A local `next dev` on `127.0.0.1` blocks Next dev resources (`allowedDevOrigins`);
  use `http://localhost:3001` for browser automation.
- The web app still needs `.env.local` wired to the contract IDs below; that is outside
  the chain scripts.

## Contract IDs for the web app

```bash
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_MASTERS_CONTRACT=masters-sonata.testnet
NEXT_PUBLIC_PLATFORM_CONTRACT=platform-sonata.testnet
NEXT_PUBLIC_MARKET_CONTRACT=market-sonata.testnet
NEXT_PUBLIC_USDC_CONTRACT=usdc-sonata.testnet
```

## Notes

- USDC is a demo token with 6 decimals. All accounting is in micro-USDC.
- Song wallets are keyless. Their only withdraw path checks the master NFT owner.
- `platform.set_song_account` is the owner-only migration hook for a wallet swap; it
  updates the payout mapping only.
- Platform and market must register themselves on USDC in their constructors.
- `platform.register_song` registers the song account on USDC with a storage deposit.
- The faucet rate-limits new account creation. User accounts created from
  `sonata.testnet` have only 1 NEAR, which is enough for gas and demo transactions.
