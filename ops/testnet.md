# Sonata testnet deployment

Status: core contracts deployed 2026-11-07. Platform and market are not built yet, so no
masters have been minted (see [Blockers](#blockers)).

## Identifiers

| Role                  | Account                    | NEAR (after core deploy) |
| --------------------- | -------------------------- | ------------------------ |
| Parent / faucet / owner | `sonata.testnet`         | ~1.90 (≈25 NEAR is locked in the global song-wallet code) |
| Mock USDC (NEP-141)   | `usdc-sonata.testnet`      | ~3.00                    |
| Master NFT collection | `masters-sonata.testnet`   | ~10.00                   |
| Platform / settlement | `platform-sonata.testnet`  | 2.00                     |
| Market                | `market-sonata.testnet`    | 10.00                    |
| Listen oracle         | `oracle-sonata.testnet`    | 1.00                     |
| Artist Nadia          | `nadia-sonata.testnet`     | 10.00                    |
| Artist Kofi           | `kofi-sonata.testnet`      | 10.00                    |
| Artist Lena           | `lena-sonata.testnet`      | 10.00                    |
| Listener              | `listener.sonata.testnet`  | 1.00                     |
| Collector             | `collector.sonata.testnet` | 1.00                     |
| Spare artist account  | `nadia.sonata.testnet`     | 5.00                     |

Keys live locally in the macOS keychain (`sign-with-keychain`) and in
`~/.near-credentials/accounts.json`. Never commit that file or a copy of it.

Song accounts are created by the master contract as sub-accounts of the collection:
`midnight-drive.masters-sonata.testnet`, `paper-moons.masters-sonata.testnet`, and so on.

The spec's original dotted names (`masters.sonata.testnet`, `nadia.testnet`) were placeholders.
These hyphenated accounts are the deployed testnet names. `ops/testnet.env` is the source of truth
for scripts.

## Deployed state

| Contract | Account | Deployment tx |
| -------- | ------- | ------------- |
| `mock-usdc` | `usdc-sonata.testnet` | `8ZcesJpwF4WBXqni1xTYRwpwEQXhs1bcm4ApJ4e3dATG` |
| `song-wallet` (global, immutable) | code hash `2iaWAuzRDNsNn65eVCh8qwNboRdrrFVgtGv7o4EmCMuS` | `8Z2XAssgGwpiAvzogTeqSUPMufrbhn6PQuYLVaGSRM91` |
| `master-nft` | `masters-sonata.testnet` | `ATZJhwhpeZHV4qbgRxkVV4XGVV9J3GRQ63ZXBDrzLF2G` |

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
  "token_supply": 0,
  "royalty_bps": 500
}
```

USDC: symbol `USDC`, 6 decimals, owner `sonata.testnet`, total supply `1220000000` micro-USDC
(1,220.00 USDC) after the demo mint.

Demo USDC balances (micro-USDC, 6 decimals):

| Account | Micro-USDC | USDC | Mint tx |
| ------- | ---------- | ---- | ------- |
| `listener.sonata.testnet` | `20000000` | 20.00 | `6b1Qo2rUtdcF18SGAGHqkeXPaXRE1nnT16asKq5uA9py` |
| `collector.sonata.testnet` | `200000000` | 200.00 | `4JBYNSBHLYcJPD1qvjLDs5f1jCz5ddCrNosjedPviSyk` |
| `platform-sonata.testnet` | `1000000000` | 1000.00 | `8Q9z7Ueo8nZjSinMyJvsM9BwdSCLhBY1H85DfEVhNdRw` |

`mock-usdc.mint` auto-registers the recipient, so no separate `storage_deposit` was needed.

## Repeatable scripts

From the repository root:

```bash
# Build, deploy (idempotent) and verify the three core contracts.
scripts/deploy-testnet.sh

# Same, then top the demo accounts up to their target USDC balances.
scripts/deploy-testnet.sh --fund-demo

# Read-only status of USDC, collection and pass/market contracts.
scripts/check-demo.sh
```

`scripts/deploy-testnet.sh` sources `ops/testnet.env`, skips contracts that already have code,
verifies `ft_metadata`/`get_config`/the global code hash, and exits non-zero if the deployed
configuration does not match the local wasm. It skips `platform-sonata.testnet` and
`market-sonata.testnet` with a clear message until `platform.wasm`/`market.wasm` exist (their
constructor wiring is not decided yet). `--fund-demo` mints only the shortfall, so it is safe to
re-run.

`scripts/check-demo.sh` talks to the RPC node with read-only view calls (`curl` + `python3`, no
`jq`/npm) so it never prompts for a keychain password. It exits 1 if a core check fails; missing
platform/market code is reported as `SKIP`.

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
4. ⏳ Deploy platform to `platform-sonata.testnet` with USDC, masters, oracle and the demo
   treasury `sonata.testnet`. The crate/wasm does not exist yet.
5. ✅ Deploy master-nft to `masters-sonata.testnet` with platform, USDC, song-wallet code hash and
   a 0.1 NEAR mint deposit.
6. ⏳ Deploy market to `market-sonata.testnet` with masters, USDC, platform and fee recipient.
7. ⏳ Wire owner-only setters (`master-nft.set_platform`, `platform.set_oracle`,
   `platform.set_reserve_targets`). `set_platform` is only needed if the platform account changes;
   the current value is already `platform-sonata.testnet`.
8. ⏳ Mint the 12 demo masters from the artist accounts.
9. ⏳ Register listener/collector on USDC (done for the demo mint, since `mint` auto-registers) and
   send them mock USDC (✅ done).
10. ⏳ Register platform and market on USDC (storage deposit) and fund their NEAR balances for
    cross-contract calls. Platform is already registered by the demo mint.

## Blockers

- **Platform and market contracts are not built.** There is no `contracts/platform` or
  `contracts/market` crate in the workspace and no `platform.wasm`/`market.wasm`, so
  `scripts/deploy-testnet.sh` skips them.
- **Minting is blocked until platform is deployed.** `master-nft.nft_mint` creates the song
  sub-account, installs the global song-wallet code, initializes the wallet, then calls
  `platform.register_song`. With no code at `platform-sonata.testnet`, that cross-contract call
  fails and the whole mint transaction reverts. Do not mint masters before step 4.
- `sonata.testnet` has ~1.9 NEAR left after locking the global code; top it up (or fund platform
  from `market`/artists) before paying for platform deployment and demo transactions.

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
