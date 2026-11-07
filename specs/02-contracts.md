# 02 - Contracts

Five contracts on NEAR testnet. Rust, `near-sdk` 5.x, NEP standards. All amounts are `U128` in
micro-USDC (6 decimals) unless stated. Time is Unix seconds (`u64`).

| Contract | Account | Purpose |
| --- | --- | --- |
| `mock-usdc` | `usdc.sonata.testnet` | NEP-141 test stablecoin |
| `master-nft` | `masters.sonata.testnet` | NEP-171 masters, song account creation, royalty |
| `song-wallet` | `<slug>.masters.sonata.testnet` | Keyless per-song account, owner-gated withdrawal |
| `platform` | `platform.sonata.testnet` | Pass NFT, treasury, epoch settlement |
| `market` | `market.sonata.testnet` | Fixed-price resale, 5% royalty |

## Conventions

- **Access control**: `owner_id` is the admin. `oracle_id` is the only settlement signer.
  `collection_id` is the only contract allowed to call `register_song`. Cross-contract calls check
  `env::predecessor_account_id()`.
- **Panics**: error strings are listed per method. They are part of the interface; do not reword.
- **Events**: NEP-297 format, `standard = "sonata"`, `version = "1.0.0"`, `event` name, `data` JSON.
- **Storage**: methods that grow state require a storage deposit and refund the excess.
- **Reentrancy**: `song-wallet` uses an `is_claiming` guard. `platform` and `market` do not call
  untrusted contracts mid-state-mutation; callbacks re-check state.
- **No upgradable proxies.** Contract accounts have a full-access key held by the deployer for
  development. Song accounts have no keys.

---

## 1. mock-usdc

NEP-141 fungible token used for the pass, payouts, and resale. Testnet only. Never mainnet.

```rust
#[near(contract_state)]
pub struct Contract {
    owner_id: AccountId,
    accounts: LookupMap<AccountId, U128>,
    total_supply: U128,
    metadata: FungibleTokenMetadata,
}

#[near]
impl Contract {
    pub fn new(owner_id: AccountId) -> Self;
    pub fn mint(&mut self, account_id: AccountId, amount: U128);           // owner only
    pub fn burn(&mut self, account_id: AccountId, amount: U128);           // owner only

    // NEP-141
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    pub fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> Promise;
    pub fn ft_total_supply(&self) -> U128;
    pub fn ft_balance_of(&self, account_id: AccountId) -> U128;

    // NEP-145 storage
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance;
    pub fn storage_withdraw(&mut self, amount: Option<U128>) -> StorageBalance;
    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance>;
    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds;
}
```

Metadata: `name = "Sonata USD Coin"`, `symbol = "USDC"`, `decimals = 6`, `icon = data:image/svg+xml;...`.

Errors: `"Only owner"`, `"Insufficient balance"`, `"The account is not registered"`.

`ft_transfer_call` calls `ft_on_transfer(sender_id, amount, msg)` on the receiver and refunds any
nonzero return value to `sender_id`. Registration on the receiver is required, as in NEP-141.

---

## 2. master-nft

NEP-171 collection. Mints a master, creates a keyless song account, records the creator, and exposes
NEP-199 payouts.

### State

```rust
#[near(contract_state)]
pub struct Contract {
    owner_id: AccountId,
    collection_id: AccountId,              // == env::current_account_id()
    platform_id: AccountId,                // platform.sonata.testnet
    payment_token: AccountId,              // usdc.sonata.testnet
    song_wallet_code_hash: CryptoHash,     // sha256 of song-wallet.wasm, deployed globally
    metadata: NFTContractMetadata,
    tokens: UnorderedMap<TokenId, Master>,
    token_supply: u64,
    mint_deposit: U128,                    // yoctoNEAR, default 0.1 NEAR
}

#[near(serializers = [json, borsh])]
pub struct Master {
    pub owner_id: AccountId,
    pub creator_id: AccountId,
    pub sub_account: AccountId,
    pub metadata: TokenMetadata,
    pub minted_at: u64,
    pub last_transfer_at: u64,
    pub transfer_count: u32,
    pub royalty_bps: u16,                  // 500
}
```

`TokenId = String`. Slug rules: lowercase ASCII `[a-z0-9-]`, length 3..40, no leading or trailing
hyphen, not a reserved word (`platform`, `market`, `usdc`, `oracle`, `masters`, `admin`). The sub
account is `format!("{}.{}", token_id, collection_id)`.

### Methods

```rust
#[near]
impl Contract {
    pub fn new(
        owner_id: AccountId,
        platform_id: AccountId,
        payment_token: AccountId,
        song_wallet_code_hash: CryptoHash,
        metadata: NFTContractMetadata,
    ) -> Self;

    #[payable]
    pub fn nft_mint(&mut self, token_id: TokenId, metadata: TokenMetadata, receiver_id: AccountId) -> JsonMaster;

    // NEP-171
    #[payable]
    pub fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>);
    #[payable]
    pub fn nft_transfer_call(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>, msg: String) -> PromiseOrValue<bool>;
    pub fn nft_token(&self, token_id: TokenId) -> Option<JsonMaster>;
    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<JsonMaster>;
    pub fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<JsonMaster>;
    pub fn nft_metadata(&self) -> NFTContractMetadata;
    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128;

    // NEP-178 approvals
    #[payable]
    pub fn nft_approve(&mut self, token_id: TokenId, account_id: AccountId, msg: Option<String>) -> Option<Promise>;
    #[payable]
    pub fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId);
    #[payable]
    pub fn nft_revoke_all(&mut self, token_id: TokenId);
    pub fn nft_is_approved(&self, token_id: TokenId, approved_account_id: AccountId, approval_id: Option<u64>) -> bool;

    // NEP-199
    pub fn nft_payout(&self, token_id: TokenId, balance: U128, max_len_payout: u32) -> Payout;
    pub fn nft_transfer_payout(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>, balance: U128, max_len_payout: u32) -> Payout;

    // Admin
    pub fn set_platform(&mut self, platform_id: AccountId);
    pub fn set_song_wallet_code_hash(&mut self, hash: CryptoHash);   // future mints only
    pub fn set_mint_deposit(&mut self, amount: U128);
    pub fn get_config(&self) -> Config;
}
```

### Mint flow

`nft_mint`:

1. Require `env::attached_deposit() >= mint_deposit`, refund excess.
2. Validate `token_id` slug and uniqueness.
3. `sub_account = format!("{}.{}", token_id, collection_id)`.
4. Store `Master { owner_id: receiver_id, creator_id: env::predecessor_account_id(), ... }`.
5. Emit `nft_mint`.
6. Create the sub-account with no keys:

```rust
Promise::new(sub_account.clone())
    .create_account()
    .transfer(STORAGE_FOR_SONG_ACCOUNT)          // 0.05 NEAR
    .use_global_contract_by_hash(song_wallet_code_hash)
    .function_call(
        "new".into(),
        json!({ "collection_id": collection_id, "token_id": token_id, "payment_token": payment_token }).to_string().into_bytes(),
        0,
        GAS_FOR_WALLET_INIT,
    )
```

7. Call `platform.register_song(token_id, sub_account)` with a small gas budget.
8. Return `JsonMaster`.

The song account has **no access keys**. `use_global_contract_by_hash` installs the immutable
wallet code. The wallet has no upgrade method.

### Transfer

`nft_transfer`:

- Require `predecessor == owner || is_approved`.
- Update `owner_id`, `last_transfer_at`, `transfer_count += 1`.
- Clear approvals.
- Emit `nft_transfer`.
- No funds move. The song account balance is already in the song account and stays there. The new
  owner can withdraw because `song-wallet` reads the current owner from this contract.

`nft_transfer_call` follows NEP-171: transfer, then call `nft_on_transfer` on the receiver with the
previous owner and msg. If the receiver returns `true`, refund the token to the sender; otherwise
keep the transfer. In v1 the only expected receiver is the market, which is not used for escrow.

### Payouts

`nft_payout(token_id, balance, max_len_payout)` returns one entry when `max_len_payout >= 1`:

- `creator_id`: `floor(balance * royalty_bps / 10_000)`
- `owner_id`: `balance - royalty`

`nft_transfer_payout` performs a transfer and returns the same payout for the market to use. The
market uses `nft_payout`; it does not call `nft_transfer_payout` because it needs the NFT transfer
and the payment split to be coordinated.

### Errors

| Error | When |
| --- | --- |
| `"Invalid token id"` | Slug fails the rules |
| `"Token already exists"` | Duplicate `token_id` |
| `"Deposit too small"` | Below `mint_deposit` |
| `"Only owner"` | Admin method from a non-owner |
| `"Not approved"` | Transfer without ownership or approval |
| `"Max len payout too small"` | NEP-199 bound cannot fit |

### Events

```json
{"standard":"sonata","version":"1.0.0","event":"nft_mint","data":{"token_id":"midnight-drive","owner_id":"alice.testnet","creator_id":"alice.testnet","sub_account":"midnight-drive.masters.sonata.testnet"}}
{"standard":"sonata","version":"1.0.0","event":"nft_transfer","data":{"token_id":"midnight-drive","old_owner_id":"alice.testnet","new_owner_id":"bob.testnet","authorized_id":"market.sonata.testnet"}}
```

---

## 3. song-wallet

One instance per master, deployed as immutable global code. It holds USDC and pays only the current
NFT owner. No admin. No keys. No upgrade.

### State

```rust
#[near(contract_state)]
pub struct Contract {
    collection_id: AccountId,
    token_id: TokenId,
    payment_token: AccountId,
    is_claiming: bool,
}
```

`new` is callable once; it initializes state and panics if already initialized.

### Methods

```rust
#[near]
impl Contract {
    pub fn new(collection_id: AccountId, token_id: TokenId, payment_token: AccountId);
    pub fn withdraw(&mut self, amount: U128) -> Promise;       // owner only, async ownership check
    pub fn withdraw_all(&mut self) -> Promise;                 // owner only
    pub fn get_config(&self) -> Config;                        // collection, token, payment token
    pub fn get_owner(&self) -> Promise;                        // cross-contract view of nft_token
    pub fn get_balance(&self) -> Promise;                      // cross-contract ft_balance_of(self)
}
```

### Withdrawal flow

Critical detail: in a promise callback, `env::predecessor_account_id()` is the contract that created
the promise (the song wallet), not the external caller. The wallet must capture the external caller
at the start of the method and compare that address to the NFT owner in the callback.

`withdraw(amount)`:

1. `caller = env::predecessor_account_id()`. Require `amount > 0` and `!is_claiming`; set
   `is_claiming = true`.
2. Call `master-nft.nft_token(token_id)` with a 10 TGas budget. Store `caller` and `amount` for the
   callback.
3. In the callback `on_owner`:
   - Deserialize `Option<JsonMaster>`.
   - Require `master.owner_id == caller`; otherwise reset the guard and panic `"Not the owner"`.
   - Call `payment_token.ft_transfer(caller, amount, Some("Sonata earnings"))`.
   - Reset `is_claiming` in the transfer callback, whether the transfer succeeded or failed. Use the
     transfer callback result only for the event; the USDC transfer itself is atomic.
4. Emit `withdraw` with `caller`, `amount`, `token_id`.

`withdraw_all` uses the same pattern, but the first step calls `payment_token.ft_balance_of(self)` and
stores the resulting `balance` plus `caller`. A second callback calls `master-nft.nft_token`, then a
third callback checks `owner == caller` and transfers `balance` to `caller`. If the balance is zero,
panic `"Nothing to withdraw"`. Do not implement `withdraw_all` by calling `withdraw` internally:
`withdraw` would see the wallet itself as the caller.

Ownership is read at withdrawal time, not cached. This is what stops a seller from withdrawing after
a transfer. There is a race only if the seller submits a withdrawal in the same block as the
transfer; the receipt order decides, and the contract check uses the owner at execution time. The
market should transfer the NFT before releasing the sale proceeds, so the seller cannot withdraw
after the sale is final.

The `caller` is stored in a temporary field keyed by the operation. Because only one withdrawal runs
at a time per wallet (the guard), a single `pending: Option<PendingWithdraw>` field is sufficient.
`PendingWithdraw { caller, amount, stage }` is cleared on completion or failure.

### Errors

| Error | When |
| --- | --- |
| `"Already initialized"` | `new` called twice |
| `"Not the owner"` | Caller is not the current NFT owner |
| `"Nothing to withdraw"` | Zero balance |
| `"Claim in progress"` | Reentrancy guard is set |

### Events

```json
{"standard":"sonata","version":"1.0.0","event":"withdraw","data":{"token_id":"midnight-drive","owner":"alice.testnet","amount":"1200000"}}
```

### Security notes

- The wallet trusts `master-nft` as the ownership oracle. If the collection is upgraded maliciously,
  ownership can change. The collection is deployed once and its admin key is held by the team.
- The wallet has no function to move funds except `withdraw`, and `withdraw` always pays
  `predecessor` after the ownership check.
- The wallet cannot be upgraded, so a bug requires migrating the master to a new collection, which is
  out of scope for v1.

---

## 4. platform

Pass NFT, treasury, epoch settlement, reserve. The most important contract.

### State

```rust
#[near(contract_state)]
pub struct Contract {
    owner_id: AccountId,
    oracle_id: AccountId,
    collection_id: AccountId,             // master-nft
    payment_token: AccountId,             // mock-usdc
    subscription_price: U128,             // 5_000_000
    pass_duration_sec: u64,               // 2_592_000 (30 days)
    rate_per_hour: U128,                  // 30_000 (immutable)
    reserve_target: U128,                 // 3 months of payouts
    one_month_reserve: U128,              // pro-rata threshold
    paused: bool,
    passes: UnorderedMap<TokenId, Pass>,
    pass_by_owner: LookupMap<AccountId, TokenId>,
    next_pass_id: u64,
    song_accounts: LookupMap<TokenId, AccountId>,
    epochs: UnorderedMap<u64, Epoch>,
    next_epoch_id: u64,
    total_paid: U128,
    total_hours_seconds: u128,
}

#[near(serializers = [json, borsh])]
pub struct Pass {
    pub owner_id: AccountId,
    pub expires_at: u64,
    pub minted_at: u64,
    pub renewed_count: u32,
}

#[near(serializers = [json, borsh])]
pub struct Epoch {
    pub id: u64,
    pub started_at: u64,
    pub closed_at: u64,
    pub balance_before: U128,
    pub total_seconds: u64,
    pub effective_rate_per_hour: U128,
    pub total_paid: U128,
    pub reserve_target: U128,
    pub one_month_reserve: U128,
    pub listen_root: String,
    pub entries_count: u32,
}

#[near(serializers = [json, borsh])]
pub struct Stats {
    pub balance: U128,
    pub reserve_target: U128,
    pub one_month_reserve: U128,
    pub rate_per_hour: U128,
    pub total_paid: U128,
    pub next_epoch_id: u64,
    pub paused: bool,
    pub oracle_id: AccountId,
    pub subscription_price: U128,
}

#[near(serializers = [json, borsh])]
pub struct PayoutEntry {
    pub token_id: TokenId,
    pub seconds: u64,
}
```

`rate_per_hour` is set in `new` and has **no setter**. It is immutable. The demo value is
`30_000` micro-USDC ($0.03) per 3600 seconds.

### Methods

```rust
#[near]
impl Contract {
    pub fn new(
        owner_id: AccountId,
        oracle_id: AccountId,
        collection_id: AccountId,
        payment_token: AccountId,
        subscription_price: U128,
        pass_duration_sec: u64,
        rate_per_hour: U128,
        reserve_target: U128,
        one_month_reserve: U128,
    ) -> Self;

    // Pass NFT (NEP-171, non-transferable)
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> String;
    pub fn nft_token(&self, token_id: TokenId) -> Option<JsonPass>;
    pub fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<JsonPass>;
    pub fn nft_metadata(&self) -> NFTContractMetadata;
    pub fn nft_transfer(&mut self, ...);          // always panics
    pub fn nft_transfer_call(&mut self, ...);     // always panics

    // Pass views
    pub fn pass_expiry(&self, account_id: AccountId) -> u64;      // 0 if none
    pub fn is_pass_active(&self, account_id: AccountId) -> bool;

    // Song registry
    pub fn register_song(&mut self, token_id: TokenId, song_account: AccountId); // collection only

    // Settlement
    pub fn settle_epoch(&mut self, epoch_id: u64, entries: Vec<PayoutEntry>, listen_root: String);

    // Treasury
    pub fn get_stats(&self) -> Stats;
    pub fn get_epoch(&self, epoch_id: u64) -> Option<Epoch>;
    pub fn get_epochs(&self, from_index: u64, limit: u64) -> Vec<Epoch>;
    pub fn withdraw_revenue(&mut self, receiver_id: AccountId, amount: U128); // owner only
    pub fn set_reserve_targets(&mut self, reserve_target: U128, one_month_reserve: U128); // owner
    pub fn set_oracle(&mut self, oracle_id: AccountId);          // owner
    pub fn pause(&mut self);                                      // owner
    pub fn unpause(&mut self);                                    // owner
}
```

### Buy pass

The listener calls `usdc.ft_transfer_call(platform, 5_000_000, "pass")`.

`ft_on_transfer(sender_id, amount, msg)`:

1. Require not paused.
2. Require `env::predecessor_account_id() == payment_token`.
3. Require `msg == "pass"`.
4. Require `amount == subscription_price`; otherwise return `amount` (refund) and do not mint.
5. `expires_at = max(now, pass_expiry(sender_id)) + pass_duration_sec`.
6. If the sender has a pass token, update its expiry and `renewed_count += 1`; emit `pass_renewed`.
   Otherwise mint a new pass token `pass-<n>`, map `pass_by_owner[sender] = token_id`, emit
   `pass_minted`.
7. Return `"0"` to accept the USDC.

The pass is non-transferable. `nft_transfer` and `nft_transfer_call` panic
`"Pass is non-transferable"`. `nft_approve` also panics for passes.

### Register song

`register_song(token_id, song_account)`:

- Require `predecessor == collection_id`.
- Require `song_account` ends with `.<collection_id>`.
- Insert once. Panic `"Song already registered"` on duplicate with a different account.
- Register `song_account` on USDC: call
  `payment_token.storage_deposit(Some(song_account), Some(true))` with enough attached NEAR for the
  storage. A song account that is not registered on USDC cannot receive a payout. If the platform's
  NEAR balance is insufficient, panic `"Cannot register song account"` and let the mint be retried.

USDC registration is also required for the platform and the market themselves. `platform.new` and
`market.new` must call `storage_deposit` on the payment token during initialization, with the NEAR
deposit attached to the constructor call.

### Settle epoch

Only `oracle_id`. The epoch id must equal `next_epoch_id`. `entries` must be nonempty and sorted by
`token_id` ascending, with no duplicates. `total_seconds` is the sum of `seconds`.

Algorithm (see `03-accounting.md` for the full derivation). Artists are paid first; the reserve only
restricts platform withdrawals, never artist payouts.

```
balance       = usdc.ft_balance_of(platform)
total_seconds = sum(entry.seconds)
if total_seconds == 0 {
    effective = 0
} else {
    max_rate = balance * 3600 / total_seconds
    effective = min(rate_per_hour, max_rate)
}
for entry in entries:
    song_account = song_accounts.get(entry.token_id) or panic "Song not registered"
    payout = effective * entry.seconds / 3600
    if payout > 0:
        usdc.ft_transfer(song_account, payout, "epoch:<id>")
        total_paid += payout
store Epoch { balance_before: balance, total_seconds, effective_rate_per_hour: effective, total_paid, listen_root, ... }
next_epoch_id += 1
emit epoch_settled
```

Notes:

- `balance` is read before any transfer. Because `ft_transfer` promises execute after the state
  write, compute all payouts and validate all song accounts first, then issue transfers, then store
  the epoch and advance `next_epoch_id`. A second settlement cannot run until `next_epoch_id`
  advances.
- The platform must be registered on USDC and have enough storage. `new` calls `storage_deposit`
  on USDC for the platform account.
- If a `song_account` is missing, panic `"Song not registered"` before any transfer.
- Rounding is floor at both `effective` and `payout`. The sum of payouts is <= `balance`.
- The remainder stays in the platform balance and becomes withdrawable revenue above the reserve.
  The reserve target does not reduce the payout pool.

### Withdraw revenue

`withdraw_revenue(receiver_id, amount)`:

- Owner only.
- Require not paused? Allow while paused for emergency withdrawal, but keep the reserve.
- `balance = ft_balance_of(self)`.
- Require `balance - amount >= max(reserve_target, one_month_reserve)`.
- Require `amount > 0`.
- `ft_transfer(receiver_id, amount, "platform revenue")`.
- Emit `revenue_withdrawn`.

The owner can never touch the reserve. This is the platform's promise to artists. The reserve can be
lowered by `set_reserve_targets`, which is owner-only and emits an event; the demo treats this as a
governance action and the UI shows it.

### Errors

| Error | When |
| --- | --- |
| `"Only oracle"` | `settle_epoch` from a non-oracle |
| `"Epoch id mismatch"` | `epoch_id != next_epoch_id` |
| `"Empty epoch"` | No entries |
| `"Unsorted entries"` | Duplicate or out-of-order token ids |
| `"Song not registered"` | Missing song account |
| `"Only collection"` | `register_song` from a non-collection |
| `"Song already registered"` | Duplicate registration |
| `"Only owner"` | Admin method |
| `"Paused"` | Pass purchase or settlement while paused |
| `"Pass is non-transferable"` | Transfer attempt |
| `"Wrong payment token"` | `ft_on_transfer` from a non-USDC account |
| `"Insufficient payment"` | Amount below price (refunded, not minted) |
| `"Reserve floor"` | Revenue withdrawal would breach the reserve |

### Events

```json
{"standard":"sonata","version":"1.0.0","event":"pass_minted","data":{"account_id":"listener.testnet","token_id":"pass-1","expires_at":1765000000,"amount":"5000000"}}
{"standard":"sonata","version":"1.0.0","event":"pass_renewed","data":{"account_id":"listener.testnet","token_id":"pass-1","expires_at":1767592000,"amount":"5000000"}}
{"standard":"sonata","version":"1.0.0","event":"epoch_settled","data":{"epoch_id":1,"total_seconds":360000,"effective_rate_per_hour":"30000","total_paid":"3000000","listen_root":"ipfs://bafy...","entries_count":11,"mode":"constant"}}
{"standard":"sonata","version":"1.0.0","event":"reserve_targets_changed","data":{"reserve_target":"900000000","one_month_reserve":"300000000"}}
{"standard":"sonata","version":"1.0.0","event":"payout_sent","data":{"epoch_id":1,"token_id":"midnight-drive","song_account":"midnight-drive.masters.sonata.testnet","amount":"120000","seconds":14400}}
{"standard":"sonata","version":"1.0.0","event":"revenue_withdrawn","data":{"receiver_id":"sonata.testnet","amount":"500000"}}
```

---

## 5. market

Fixed-price resale. The seller keeps the NFT until the sale; the market uses a NEP-171 approval to
transfer at buy time.

### State

```rust
#[near(contract_state)]
pub struct Contract {
    owner_id: AccountId,
    collection_id: AccountId,
    payment_token: AccountId,
    royalty_bps: u16,                       // 500, immutable
    listings: LookupMap<TokenId, Listing>,
}

#[near(serializers = [json, borsh])]
pub struct Listing {
    pub seller: AccountId,
    pub price: U128,
    pub created_at: u64,
    pub active: bool,
}
```

### Methods

```rust
#[near]
impl Contract {
    pub fn new(owner_id: AccountId, collection_id: AccountId, payment_token: AccountId) -> Self;

    #[payable]
    pub fn list(&mut self, token_id: TokenId, price: U128);     // seller only, async ownership check
    pub fn cancel(&mut self, token_id: TokenId);                 // seller only
    pub fn get_listing(&self, token_id: TokenId) -> Option<Listing>;
    pub fn get_listings(&self, from_index: u64, limit: u64) -> Vec<(TokenId, Listing)>;

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<String>;
    pub fn on_token(&mut self, buyer: AccountId, token_id: TokenId, amount: U128) -> String; // private callback
}
```

### List

`list(token_id, price)`:

1. Require `price > 0`; require `env::attached_deposit() >= LISTING_STORAGE`.
2. Call `master-nft.nft_token(token_id)`.
3. In callback `on_listing_check`, require `token.owner_id == predecessor` (stored before the call).
4. Store `Listing { seller, price, created_at: now, active: true }`; emit `listing_created`.
5. The seller must have approved the market for this token (`nft_approve(market, ...)`) or approve
   after listing. The buy will fail with `"Not approved"` if not.

### Buy

Buyer calls `usdc.ft_transfer_call(market, price, "buy:<token_id>")`.

`ft_on_transfer(sender_id, amount, msg)`:

1. Parse `msg` as `buy:<token_id>`.
2. Look up the listing; require active.
3. Require `amount == listing.price`; otherwise return `amount` (refund).
4. Call `master-nft.nft_token(token_id)`.
5. In callback `on_token`:
   - Require `token.owner_id == listing.seller`; else refund the buyer and cancel the listing.
   - `creator = token.creator_id`.
   - `royalty = amount * 500 / 10_000`.
   - `seller_amount = amount - royalty`.
   - `usdc.ft_transfer(creator, royalty, "royalty:<token_id>")`.
   - `usdc.ft_transfer(listing.seller, seller_amount, "sale:<token_id>")`.
   - `master-nft.nft_transfer(buyer, token_id, None, Some("sale"))` (market is approved).
   - Set `listing.active = false`; emit `sale`.
   - Return `"0"`.
6. If the callback panics, the USDC stays in the market contract. The owner can call
   `recover(token_id)` to refund the recorded buyer. This is a demo safety valve, not a normal path.

The NFT transfer and the payment transfers are separate promises. Order: pay royalty and seller,
then transfer NFT. If the NFT transfer fails, the payments have already happened. To avoid this, use
`nft_transfer_payout` or a two-phase callback:
- Phase 1: `master-nft.nft_transfer_payout(buyer, token_id, ..., amount, 2)` returns the payout and
  transfers the NFT in the same receipt.
- Phase 2: on the callback, send USDC to the creator and seller.
This is the correct order: NFT first, then money. Spec: use `nft_transfer_payout` (NEP-199) which
transfers and returns the payout, then in the callback distribute USDC. The market holds the buyer's
USDC from `ft_on_transfer` until the callback. If the NFT transfer fails, the callback is not
executed; the market owner can refund the buyer via `recover`.
- `nft_transfer_payout` requires the market to be approved. The seller approves the market in `list`
  or in the UI before listing.

### Royalty

`royalty_bps = 500` (5%). The creator is read from the token, not from the listing. The market never
lets the seller set the royalty. The remaining 95% goes to the seller.

### Errors

| Error | When |
| --- | --- |
| `"Price must be positive"` | `price == 0` |
| `"Listing not active"` | Buy of a missing or cancelled listing |
| `"Not the seller"` | Cancel by a non-seller |
| `"Not the owner"` | List by a non-owner |
| `"Wrong amount"` | Payment below price (refunded) |
| `"Not approved"` | NFT transfer without approval |
| `"Already listed"` | Duplicate active listing |

### Events

```json
{"standard":"sonata","version":"1.0.0","event":"listing_created","data":{"token_id":"midnight-drive","seller":"alice.testnet","price":"50000000"}}
{"standard":"sonata","version":"1.0.0","event":"sale","data":{"token_id":"midnight-drive","seller":"alice.testnet","buyer":"collector.testnet","price":"50000000","royalty":"2500000","tx":"..."}}
```

---

## Deployment order

1. Deploy `mock-usdc` at `usdc.sonata.testnet`.
2. Deploy `song-wallet` globally, capture `sha256(wasm)`.
3. Deploy `master-nft` at `masters.sonata.testnet` with the platform account (placeholder) and the
   wallet hash. Fund it with NEAR for sub-account creation.
4. Deploy `platform` at `platform.sonata.testnet` with `collection_id = masters...`, `oracle_id`,
   and the demo parameters.
5. Deploy `market` at `market.sonata.testnet`.
6. Call `master-nft.set_platform(platform)`, `platform.set_oracle(oracle)`, and
   `platform.set_reserve_targets(...)`.
7. Register the platform on USDC and deposit storage.
8. Mint one test master end to end.
9. Run the full demo script (`06-demo.md`).

## Contract tests (minimum)

- `master-nft`: mint creates a sub-account with zero keys; duplicate slug fails; transfer updates
  owner; payout splits 5% to creator; approval transfer works.
- `song-wallet`: owner withdraws; non-owner panics; old owner after transfer panics; zero balance
  panics; reentrancy guard.
- `platform`: pass mint and renewal; non-transferable; settlement at R; pro-rata when short; reserve
  floor; only oracle; duplicate epoch fails; unsorted entries fail; revenue withdrawal blocked below
  reserve.
- `market`: list, buy, royalty split, cancel, non-owner list fails, unapproved transfer fails.

Integration test: one master, one listener, one epoch, one sale, one failed withdrawal by the old
owner. See `06-demo.md`.
