# Sonata contracts

Three NEAR contracts for Sonata, built on `near-sdk 5.30` (`legacy` state).

| Crate         | Purpose                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `mock-usdc`   | NEP-141 demo USDC (6 decimals) with a fixed-cost, simplified NEP-145 storage API and an owner-only faucet.                                |
| `song-wallet` | Keyless per-song account. Holds a song's USDC and pays only the current master-NFT owner.                                                 |
| `master-nft`  | NEP-171 master collection with NEP-178 approvals and a fixed 5% NEP-199 creator royalty. Minting creates and initializes the song wallet. |

## Build and test

```bash
cargo test --workspace
cargo build --workspace --target wasm32-unknown-unknown --release
cargo fmt --all -- --check
```

Artifacts land in `target/wasm32-unknown-unknown/release/{mock_usdc,song_wallet,master_nft}.wasm`.

Host builds without `cfg(test)` or the wasm target are rejected by near-sdk on
purpose ("use cargo near build"); use the two commands above.

## Deploy

`scripts/deploy-core.sh` builds the workspace, deploys `mock-usdc`, deploys
`song-wallet` as an immutable global contract, derives its base58 code hash,
and deploys `master-nft` with that hash. Accounts and the signing method come
from the environment; no keys are stored here.

```bash
MASTER_ACCOUNT=masters.sonata.testnet \
PLATFORM_ACCOUNT=platform.sonata.testnet \
./scripts/deploy-core.sh
```

See the header of the script for every option. Target accounts must already
exist, and the collection account needs NEAR for mint-time storage.

## Cross-contract surface

### `master-nft`

- `new(owner_id, metadata, platform_id, payment_token, song_wallet_code_hash: String, mint_deposit: U128)`
- `nft_mint(token_id, metadata, receiver_id) -> JsonMaster` — payable, slug
  (`[a-z0-9-]{3,40}`, no leading/trailing `-`, not reserved), unique token id.
  Creates `<token_id>.<collection_id>` with no access keys, installs the
  global song-wallet code, calls `new(collection_id, token_id, payment_token)`,
  then `platform.register_song(token_id, song_account)`. The deposit is kept.
- `nft_transfer`, `nft_transfer_call`, `nft_resolve_transfer`, `nft_token`
- `nft_approve`, `nft_is_approved`, `nft_revoke`, `nft_revoke_all`
- `nft_total_supply`, `nft_tokens`, `nft_supply_for_owner`, `nft_tokens_for_owner`, `nft_metadata`
- `nft_payout(token_id, balance, max_len_payout) -> Payout`
- `nft_transfer_payout(receiver_id, token_id, approval_id, memo, balance, max_len_payout) -> Payout`
- `set_platform`, `set_song_wallet_code_hash`, `set_mint_deposit`, `get_config` (owner only for setters)
- Events: NEP-171 `nft_mint`/`nft_transfer`, plus Sonata `master_minted`,
  `master_transferred`, `platform_set`, `song_wallet_code_hash_set`,
  `mint_deposit_set`.

`Payout.payout` maps account id to `U128`; the creator always receives
`floor(balance * 500 / 10_000)` and the seller the remainder. When the creator
is the owner the split collapses to one full-balance entry.

### `song-wallet`

- `new(collection_id, token_id, payment_token)` — single-use initializer.
- `withdraw(amount: U128)` / `withdraw_all()` — any caller may start the
  flow; the callback checks the recorded caller against the current NFT owner
  and pays them. Rejections reset the guard and log the reason instead of
  panicking, so a rejected attempt cannot wedge the wallet.
- `get_config()` — collection, token, payment token, guard state.
- Event: Sonata `withdraw` `{ token_id, owner, amount }`.

### `mock-usdc`

- NEP-141: `ft_transfer` (exactly 1 yoctoNEAR), `ft_transfer_call` +
  `ft_resolve_transfer` refund, `ft_balance_of`, `ft_total_supply`, `ft_metadata`.
  Both sender and receiver must be registered.
- NEP-145 (simplified): `storage_deposit`, `storage_withdraw`,
  `storage_balance_of`, `storage_balance_bounds` (fixed 120-byte cost).
- Owner-only `mint` (auto-registers the recipient) and `burn`.
- Events: NEP-141 `ft_mint`, `ft_burn`, `ft_transfer`.

## Deliberate v1 choices

- The mint deposit funds the song account and platform registration; the
  excess is not refunded.
- `master-nft` never holds or moves money: `nft_transfer_payout` only returns
  the split for the marketplace to settle.
- Song-wallet callbacks record the caller at entry and never compare
  `predecessor_account_id` against the NFT owner inside a callback.
