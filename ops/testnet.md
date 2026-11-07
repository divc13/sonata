# Sonata testnet deployment

Status: the full demo chain is deployed on testnet (2026-11-07): core contracts, platform,
market, all 12 masters, five resale listings and the listener pass. `scripts/check-demo.sh`
prints `66 passed, 0 failed, 0 skipped`.

## Identifiers

| Role                    | Account                    | NEAR (after demo)                                         |
| ----------------------- | -------------------------- | --------------------------------------------------------- |
| Parent / faucet / owner | `sonata.testnet`           | ~1.90 (≈25 NEAR is locked in the global song-wallet code) |
| Mock USDC (NEP-141)     | `usdc-sonata.testnet`      | ~3.01                                                     |
| Master NFT collection   | `masters-sonata.testnet`   | ~10.60                                                    |
| Platform / settlement   | `platform-sonata.testnet`  | ~4.48                                                     |
| Market                  | `market-sonata.testnet`    | ~7.55                                                     |
| Listen oracle           | `oracle-sonata.testnet`    | 1.00                                                      |
| Artist Nadia            | `nadia-sonata.testnet`     | ~9.56                                                     |
| Artist Kofi             | `kofi-sonata.testnet`      | ~9.53                                                     |
| Artist Lena             | `lena-sonata.testnet`      | ~9.56                                                     |
| Listener                | `listener.sonata.testnet`  | 1.00                                                      |
| Collector               | `collector.sonata.testnet` | 1.00                                                      |
| Spare artist account    | `nadia.sonata.testnet`     | 5.00                                                      |

`platform-sonata.testnet` was funded with 2.5 NEAR from `market-sonata.testnet`
(`2BgY5RHbKw7kMRP3yjYe9k8jD9M81ZikuNYkxGLcxJY4` for 0.5, then
`BycbwYXxkAQnD9y2fD7ufqJVqHd5dS7KzXR5T92iZQ8G` for 2.0) because a 394 KB wasm needs
about 4.13 NEAR of storage plus its 0.05 NEAR USDC registration deposit.

Keys live locally in the macOS keychain (`sign-with-keychain`) and in
`~/.near-credentials/accounts.json`. Never commit that file or a copy of it.

Song accounts are created by the master contract as sub-accounts of the collection:
`midnight-drive.masters-sonata.testnet`, `paper-moons.masters-sonata.testnet`, and so on.

The spec's original dotted names (`masters.sonata.testnet`, `nadia.testnet`) were placeholders.
These hyphenated accounts are the deployed testnet names. `ops/testnet.env` is the source of truth
for scripts.

## Deployed state

| Contract                          | Account                                                  | Deployment tx                                  |
| --------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `mock-usdc`                       | `usdc-sonata.testnet`                                    | `8ZcesJpwF4WBXqni1xTYRwpwEQXhs1bcm4ApJ4e3dATG` |
| `song-wallet` (global, immutable) | code hash `2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS` | `8Z2XAssgGwpiAvzogTeqSUPMufrbhn6PQuYLVaGSRM91` |
| `master-nft`                      | `masters-sonata.testnet`                                 | `ATZJhwhpeZHV4qbgRxkVV4XGVV9J3GRQ63ZXBDrzLF2G` |
| `platform`                        | `platform-sonata.testnet`                                | `6TtCMN2aQ5jQ2gSXw2g7TVLM21Wgo2RPNNkqwhgT5nV4` |
| `market`                          | `market-sonata.testnet`                                  | `A3fNoVnQpBhkC4hDBBzcu8RnZSgmotS5thPpAXzr3j8V` |

Deployed code hashes: platform `GSvQDjqoVTrnGPMtdXW2dPoCvZJ2pe4xk1zkaD62s44b`, market
`7xxARpMzwxs2P59ki6A1eqou7o3i8cnMzwhckPGZnFJz`, master collection
`BEUYq18tdtJkRr1adcmomToj9YRFHW9zjp6mSPJ6sTYK`.

`song-wallet` global code hash:
`2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS`,
which is base58(sha256(`contracts/target/wasm32-unknown-unknown/release/song_wallet.wasm`)).

`master-nft.get_config` as deployed:

```json
{
  "owner_id": "sonata.testnet",
  "collection_id": "masters-sonata.testnet",
  "platform_id": "platform-sonata.testnet",
  "payment_token": "usdc-sonata.testnet",
  "song_wallet_code_hash": "2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS",
  "mint_deposit": "100000000000000000000000",
  "token_supply": 12,
  "royalty_bps": 500
}
```

`platform.get_stats` as deployed (after the listener pass):

```json
{
  "balance": "5000000",
  "reserve_target": "900000000",
  "one_month_reserve": "300000000",
  "rate_per_hour": "30000",
  "total_paid": "0",
  "next_epoch_id": 1,
  "paused": false,
  "oracle_id": "oracle-sonata.testnet",
  "subscription_price": "5000000"
}
```

`market.get_listings(0, 100)` returns five active `(TokenId, Listing)` rows; see
[Demo chain writes](#demo-chain-writes).

USDC: symbol `USDC`, 6 decimals, owner `sonata.testnet`, total supply `1220000000` micro-USDC
(1,220.00 USDC) after the demo mint.

Demo USDC balances after the pass purchase (micro-USDC, 6 decimals):

| Account                    | Micro-USDC   | USDC    | Mint tx                                        |
| -------------------------- | ------------ | ------- | ---------------------------------------------- |
| `listener.sonata.testnet`  | `15000000`   | 15.00   | `6b1Qo2rUtdcF18SGAGHqkeXPaXRE1nnT16asKq5uA9py` |
| `collector.sonata.testnet` | `200000000`  | 200.00  | `4JBYNSBHLYcJPD1qvjLDs5f1jCz5ddCrNosjedPviSyk` |
| `platform-sonata.testnet`  | `1005000000` | 1005.00 | `8Q9z7Ueo8nZjSinMyJvsM9BwdSCLhBY1H85DfEVhNdRw` |

`mock-usdc.mint` auto-registers the recipient, so no separate `storage_deposit` was needed.
The listener paid `5000000` micro-USDC for the pass, so the platform balance includes it.

## Demo chain writes

`scripts/mint-demo.sh` wrote the whole demo catalogue in one idempotent pass:

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

Every song account is keyless and points at the global `song-wallet` code:
`view_account <token>.masters-sonata.testnet` returns
`global_contract_hash: 2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS` and
`view_access_key_list` is empty.

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

# Read-only status of USDC, collection, masters, listings and the pass.
scripts/check-demo.sh
```

`scripts/deploy-testnet.sh` sources `ops/testnet.env`, skips contracts that already have code,
verifies `ft_metadata`/`get_config`/the global code hash, and exits non-zero if the deployed
configuration does not match the local wasm. It skips `platform-sonata.testnet` and
`market-sonata.testnet` with a clear message; `scripts/deploy-platform-market.sh` owns those two
contracts. `--fund-demo` mints only the shortfall, so it is safe to re-run.

`scripts/deploy-platform-market.sh` builds `contracts/platform`/`contracts/market` (when their
crates exist), prints `platform/market not merged yet` and exits 0 when they do not, and otherwise
deploys both with `with-init-call new` and 0.05 NEAR of USDC storage deposit. It checks the target
account's NEAR balance first (`ensure_deploy_balance`); a wasm deploy needs the code storage,
about 4.2 NEAR for the 394 KB platform. Existing code is never redeployed, only verified through
`get_stats`/`get_listings`.

`scripts/mint-demo.sh` reads `scripts/demo-catalogue.json` (pinned to
`packages/db/src/sonata-seed.ts` by `scripts/__tests__/demo-catalogue.test.ts`). It mints only
tokens that `nft_token` does not already return, mints from the artist account with 0.1 NEAR and
300 Tgas, approves the market, lists only when no matching active listing exists, and buys the
pass only when `is_pass_active` is false. A re-run on the deployed state prints only `skipping`.

`scripts/check-demo.sh` talks to the RPC node with read-only view calls (`curl` + `python3`, no
`jq`/npm) so it never prompts for a keychain password. It exits 0 only when all 12 masters, the
five listings, the listener pass and the keyless song accounts match. `rpc.testnet.near.org` rate
limits bursts of view calls; set `SONATA_RPC_URL=https://archival-rpc.testnet.fastnear.com` when
re-running it in a loop. The deploy/mint scripts accept the same override.

## Exact commands used

All `near` write commands were wrapped in a pseudo-TTY because near-cli-rs 0.30.1 is interactive:

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

2. Song wallet as an immutable global contract (the signer pays storage for the code; the
   250 KB wasm locked ~25 NEAR in `sonata.testnet`):

```bash
yes '' | script -q /dev/null near contract deploy-as-global \
  use-file contracts/target/wasm32-unknown-unknown/release/song_wallet.wasm \
  as-global-hash sonata.testnet \
  network-config testnet sign-with-keychain send
```

`deploy-as-global ... as-global-hash` prints `Wasm code hash: ...` and skips the deploy if
that hash is already global. `contracts/scripts/deploy-core.sh`'s `sha256_base58` helper
derives the same hash locally.

3. Master collection:

```bash
MASTER_ARGS='{"owner_id":"sonata.testnet","metadata":{"spec":"nft-1.0.0","name":"Sonata Masters","symbol":"SONG","icon":null,"base_uri":null,"reference":null,"reference_hash":null},"platform_id":"platform-sonata.testnet","payment_token":"usdc-sonata.testnet","song_wallet_code_hash":"2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS","mint_deposit":"100000000000000000000000"}'

yes '' | script -q /dev/null near contract deploy "$MASTERS_ACCOUNT" \
  use-file contracts/target/wasm32-unknown-unknown/release/master_nft.wasm \
  with-init-call new json-args "$MASTER_ARGS" \
  prepaid-gas 100Tgas attached-deposit 0NEAR \
  network-config testnet sign-with-keychain send
```

Verify read-only:

```bash
yes '' | script -q /dev/null near contract call-function as-read-only "$USDC_ACCOUNT" \
  ft_metadata json-args '{}' network-config testnet now

yes '' | script -q /dev/null near contract call-function as-read-only "$MASTERS_ACCOUNT" \
  get_config json-args '{}' network-config testnet now

# Global code exists (result contains a non-empty code_base64):
curl -s -X POST "$NEAR_RPC_URL" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"x","method":"query","params":{"request_type":"view_global_contract_code","finality":"final","code_hash":"2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS"}}'
```

Mint demo USDC (owner-only; `sonata.testnet` signs, `mint` auto-registers the recipient):

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
  `yes '' | script -q /dev/null near ...`; `scripts/deploy-testnet.sh` does this automatically
  when stdin is not a terminal.
- `attached-deposit`/token amounts need a unit. `attached-deposit 0` fails with
  `invalid token unit: 0`; use `0NEAR`.
- `contract deploy` signs as the account being deployed (no `sign-as`). `call-function
  as-transaction` needs `sign-as <signer>` before `network-config`, and read-only calls end in
  `now`.
- `contract deploy-as-global ... as-global-hash` charges the code storage (~25 NEAR for the
  250 KB song wallet) to the signer, not to the contract account. Fund the signer first; the
  code is immutable and the hash is the same regardless of which account deployed it.
- `sign-with-keychain` is macOS-only. Keys for every account already exist in the keychain;
  never print or commit them.
- near-cli-rs defaults to `https://archival-rpc.testnet.fastnear.com/` for its calls, while
  `ops/testnet.env` points `NEAR_RPC_URL` at `https://rpc.testnet.near.org`. Both see the same
  testnet state; the scripts use the direct RPC URL for read-only checks so they do not depend
  on the CLI's spinner output.
- `contracts/scripts/deploy-core.sh` was fixed for 0.30.1 (`attached-deposit 0` → `0NEAR`).
  It still assumes the caller provides a TTY (wrap it as above) and expects the target accounts
  to exist.

## Deploy order

1. ✅ Build all wasm:
   `cargo build --manifest-path contracts/Cargo.toml --workspace --target wasm32-unknown-unknown --release`
2. ✅ Deploy mock USDC to `usdc-sonata.testnet` with owner `sonata.testnet`.
3. ✅ Deploy song-wallet as a global contract and record its code hash.
4. ✅ Deploy platform to `platform-sonata.testnet` with USDC, masters, oracle and the demo
   treasury `sonata.testnet` (`6TtCMN2aQ5jQ2gSXw2g7TVLM21Wgo2RPNNkqwhgT5nV4`).
5. ✅ Deploy master-nft to `masters-sonata.testnet` with platform, USDC, song-wallet code hash and
   a 0.1 NEAR mint deposit.
6. ✅ Deploy market to `market-sonata.testnet` with masters, USDC and owner
   (`A3fNoVnQpBhkC4hDBBzcu8RnZSgmotS5thPpAXzr3j8V`).
7. ✅ Constructor wiring. `master-nft.platform_id` was already `platform-sonata.testnet`, and
   `platform.new` received the oracle and reserve targets, so no owner setters were needed.
8. ✅ Mint the 12 demo masters from the artist accounts.
9. ✅ Register listener/collector on USDC and send them mock USDC.
10. ✅ Register platform and market on USDC (their constructors call `storage_deposit`).
11. ✅ Approve the market for five masters, list them and buy the listener pass.

Everything above is repeatable through the scripts; re-running `deploy-platform-market.sh` and
`mint-demo.sh` on the current state only verifies/skips.

## Blockers

None for the chain demo. `scripts/check-demo.sh` reports
`66 passed, 0 failed, 0 skipped` against testnet.

Operational notes:

- Writes need macOS keychain (`sign-with-keychain`) and a pseudo-TTY. Both scripts wrap `near`
  in `yes '' | script -q /dev/null`; `script` may exit 1 with `write master: Input/output error`
  after a successful transaction, so the scripts trust the printed `Transaction ID`, not the
  wrapper status.
- `rpc.testnet.near.org` rate limits bursts of view calls; pass
  `SONATA_RPC_URL=https://archival-rpc.testnet.fastnear.com` to any of the three scripts when
  re-running in a loop.
- Deploying a wasm needs the code storage in the target account. `platform-sonata.testnet`
  needed 2.5 NEAR from `market-sonata.testnet` before its 394 KB wasm could deploy; the script
  now preflights this and prints the shortfall.
- The web app still needs `.env.local` wired to the contract IDs below; that is outside the chain
  scripts.

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
- The song account is keyless. Its only withdraw path checks the master NFT owner.
- Platform and market must register themselves on USDC in their constructors.
- `platform.register_song` registers the song account on USDC with a storage deposit.
- The faucet rate-limits new account creation. User accounts created from `sonata.testnet` have
  only 1 NEAR, which is enough for gas and demo transactions.
- To create more top-level accounts later, retry the faucet after the 429 window.
