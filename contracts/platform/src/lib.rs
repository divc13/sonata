//! platform: Sonata pass NFT, treasury, and epoch settlement.
//!
//! The platform is the money hub of Sonata:
//!
//! - listeners buy a non-transferable pass with `usdc.ft_transfer_call(platform, price, "pass")`;
//! - the oracle settles listening epochs: the platform reads its USDC balance,
//!   computes an effective hourly rate (constant or pro-rata), and pays every
//!   registered song account;
//! - the owner may withdraw revenue, but never below the artist reserve floor.
//!
//! The platform's USDC balance can only be read cross-contract, so
//! `get_stats().balance` is a cache updated whenever the platform observes its
//! own balance (pass sale, settlement balance read, withdrawal).
//!
//! Settlement is two receipts: `settle_epoch` validates and stores a
//! `PendingSettlement`, then `on_epoch_balance` consumes the `ft_balance_of`
//! result and pays out. `pending_settlement` blocks a second settlement until
//! the callback ran; the owner can clear a stuck guard with
//! `abort_settlement`.

mod events;
mod pass;
mod register;
mod settlement;
mod treasury;

#[cfg(test)]
mod tests;

pub use crate::events::{emit_epoch_settled, emit_payout_sent, emit_sonata};

use near_sdk::collections::{LookupMap, UnorderedMap};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{env, ext_contract, near, AccountId, Gas, NearToken, PanicOnDefault};

pub type TokenId = String;

/// NEP-171 metadata schema version.
pub const NFT_METADATA_SPEC: &str = "nft-1.0.0";
/// Sonata NEP-297 event standard and version.
pub const SONATA_STANDARD: &str = "sonata";
pub const SONATA_VERSION: &str = "1.0.0";
/// Seconds in an hour; the payout rate denominator.
pub const SECONDS_PER_HOUR: u128 = 3600;

/// Exactly 1 yoctoNEAR, required by NEP-141 `ft_transfer`.
pub const ONE_YOCTONEAR: NearToken = NearToken::from_yoctonear(1);
/// NEAR forwarded to `payment_token.storage_deposit` for a new account.
pub const STORAGE_REGISTRATION_DEPOSIT: NearToken =
    NearToken::from_yoctonear(12_500_000_000_000_000_000_000);
/// The platform spends this from its own balance to register a song account.
pub const SONG_REGISTRATION_DEPOSIT: NearToken = STORAGE_REGISTRATION_DEPOSIT;

/// Gas for `ft_balance_of`.
pub const GAS_FOR_BALANCE_CHECK: Gas = Gas::from_tgas(10);
/// Gas for `storage_deposit` calls.
pub const GAS_FOR_STORAGE_DEPOSIT: Gas = Gas::from_tgas(15);
/// Gas for `ft_transfer` promises.
pub const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
/// Gas for the settlement callback. Every payout promise takes
/// `GAS_FOR_FT_TRANSFER` out of this budget, so the demo keeps epochs small
/// (the spec's example has 11 entries).
pub const GAS_FOR_SETTLE_CALLBACK: Gas = Gas::from_tgas(260);
/// Gas for the revenue-withdrawal callback.
pub const GAS_FOR_WITHDRAW_CALLBACK: Gas = Gas::from_tgas(60);

/// The slice of the payment token (NEP-141 + NEP-145) the platform uses.
#[ext_contract(ext_fungible_token)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_balance_of(&self, account_id: AccountId) -> U128;
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance;
}

/// NEP-145 storage balance, as transported by `mock-usdc`.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

/// NEP-171 contract metadata.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct NFTContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

/// One pass token. A pass is soulbound: only expiry is ever updated.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Pass {
    pub owner_id: AccountId,
    pub expires_at: u64,
    pub minted_at: u64,
    pub renewed_count: u32,
}

/// JSON transport for a pass token.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct JsonPass {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub expires_at: u64,
    pub minted_at: u64,
    pub renewed_count: u32,
}

/// One closed settlement epoch.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Epoch {
    pub id: u64,
    pub started_at: u64,
    pub closed_at: u64,
    pub balance_before: U128,
    pub total_seconds: u64,
    pub effective_rate_per_hour: U128,
    pub total_paid: U128,
    pub listen_root: String,
    pub entries_count: u32,
    pub mode: String,
}

/// Treasury snapshot.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
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

/// One oracle payout row.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct PayoutEntry {
    pub token_id: TokenId,
    pub seconds: u64,
}

/// In-flight settlement, valid between `settle_epoch` and its callback.
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct PendingSettlement {
    pub epoch_id: u64,
    pub started_at: u64,
    pub closed_at: u64,
    pub entries: Vec<PayoutEntry>,
    pub listen_root: String,
}

/// In-flight revenue withdrawal, valid between `withdraw_revenue` and its callback.
#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct PendingWithdrawal {
    pub receiver_id: AccountId,
    pub amount: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner_id: AccountId,
    pub oracle_id: AccountId,
    /// The master-nft collection, the only account allowed to register songs.
    pub collection_id: AccountId,
    /// USDC-like payment token.
    pub payment_token: AccountId,
    pub subscription_price: U128,
    pub pass_duration_sec: u64,
    /// Immutable payout rate in micro-USDC per hour. No setter.
    pub rate_per_hour: U128,
    pub reserve_target: U128,
    pub one_month_reserve: U128,
    pub paused: bool,
    pub passes: UnorderedMap<TokenId, Pass>,
    pub pass_by_owner: LookupMap<AccountId, TokenId>,
    pub next_pass_id: u64,
    pub song_accounts: LookupMap<TokenId, AccountId>,
    pub epochs: UnorderedMap<u64, Epoch>,
    pub next_epoch_id: u64,
    pub total_paid: U128,
    pub total_hours_seconds: u128,
    pub pending_settlement: Option<PendingSettlement>,
    pub pending_withdrawal: Option<PendingWithdrawal>,
    /// Best-effort USDC balance cache; refreshed on every balance observation.
    pub cached_balance: U128,
}

#[derive(near_sdk::borsh::BorshSerialize, near_sdk::BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    Passes,
    PassByOwner,
    SongAccounts,
    Epochs,
}

#[near]
impl Contract {
    /// Create the platform and register it for USDC storage with the attached
    /// NEAR. `rate_per_hour` is immutable for the life of the contract.
    #[init]
    #[payable]
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
    ) -> Self {
        assert!(
            env::attached_deposit() >= STORAGE_REGISTRATION_DEPOSIT,
            "Deposit too small"
        );
        assert!(subscription_price.0 > 0, "Invalid subscription price");
        assert!(pass_duration_sec > 0, "Invalid pass duration");

        let contract = Self {
            owner_id,
            oracle_id,
            collection_id,
            payment_token,
            subscription_price,
            pass_duration_sec,
            rate_per_hour,
            reserve_target,
            one_month_reserve,
            paused: false,
            passes: UnorderedMap::new(StorageKey::Passes),
            pass_by_owner: LookupMap::new(StorageKey::PassByOwner),
            next_pass_id: 1,
            song_accounts: LookupMap::new(StorageKey::SongAccounts),
            epochs: UnorderedMap::new(StorageKey::Epochs),
            next_epoch_id: 1,
            total_paid: U128(0),
            total_hours_seconds: 0,
            pending_settlement: None,
            pending_withdrawal: None,
            cached_balance: U128(0),
        };
        contract.register_platform_on_token();
        contract
    }

    // ------------------------------------------------------------------
    // Treasury / admin
    // ------------------------------------------------------------------

    pub fn get_stats(&self) -> Stats {
        Stats {
            balance: self.cached_balance,
            reserve_target: self.reserve_target,
            one_month_reserve: self.one_month_reserve,
            rate_per_hour: self.rate_per_hour,
            total_paid: self.total_paid,
            next_epoch_id: self.next_epoch_id,
            paused: self.paused,
            oracle_id: self.oracle_id.clone(),
            subscription_price: self.subscription_price,
        }
    }

    pub fn get_epoch(&self, epoch_id: u64) -> Option<Epoch> {
        self.epochs.get(&epoch_id)
    }

    pub fn get_epochs(&self, from_index: u64, limit: u64) -> Vec<Epoch> {
        self.epochs
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(|(_, epoch)| epoch)
            .collect()
    }

    pub fn set_reserve_targets(&mut self, reserve_target: U128, one_month_reserve: U128) {
        self.assert_owner();
        self.reserve_target = reserve_target;
        self.one_month_reserve = one_month_reserve;
        events::emit_reserve_targets_changed(reserve_target, one_month_reserve);
    }

    pub fn set_oracle(&mut self, oracle_id: AccountId) {
        self.assert_owner();
        self.oracle_id = oracle_id;
    }

    pub fn pause(&mut self) {
        self.assert_owner();
        self.paused = true;
    }

    pub fn unpause(&mut self) {
        self.assert_owner();
        self.paused = false;
    }
}

impl Contract {
    pub(crate) fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "Only owner");
    }

    pub(crate) fn assert_oracle(&self) {
        assert_eq!(env::predecessor_account_id(), self.oracle_id, "Only oracle");
    }

    /// Register this contract on the payment token using the constructor deposit.
    fn register_platform_on_token(&self) {
        let _ = ext_fungible_token::ext(self.payment_token.clone())
            .with_static_gas(GAS_FOR_STORAGE_DEPOSIT)
            .with_attached_deposit(env::attached_deposit())
            .storage_deposit(Some(env::current_account_id()), Some(true));
    }
}

// ----------------------------------------------------------------------
// Pure helpers (unit-testable without a chain)
// ----------------------------------------------------------------------

/// Unix seconds from the nanosecond block timestamp.
pub fn now_secs() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

/// `effective = min(rate_per_hour, balance * 3600 / total_seconds)`.
///
/// A zero-length epoch pays nothing.
pub fn compute_effective_rate(rate_per_hour: u128, balance: u128, total_seconds: u64) -> u128 {
    if total_seconds == 0 {
        return 0;
    }
    let max_rate = balance.saturating_mul(SECONDS_PER_HOUR) / total_seconds as u128;
    rate_per_hour.min(max_rate)
}

/// Floor payout: `effective_rate_per_hour * seconds / 3600`.
pub fn payout_for_seconds(effective_rate_per_hour: u128, seconds: u64) -> u128 {
    effective_rate_per_hour.saturating_mul(seconds as u128) / SECONDS_PER_HOUR
}

/// `"constant"` when the epoch paid the full rate, `"pro-rata"` otherwise.
pub fn settlement_mode(rate_per_hour: u128, effective_rate_per_hour: u128) -> &'static str {
    if effective_rate_per_hour == rate_per_hour {
        "constant"
    } else {
        "pro-rata"
    }
}

/// The reserve rule: after paying `amount`, the remainder must still cover the
/// larger of the two reserve targets. An overdraft never passes.
pub fn reserve_ok(
    balance: u128,
    amount: u128,
    reserve_target: u128,
    one_month_reserve: u128,
) -> bool {
    balance >= amount && balance - amount >= reserve_target.max(one_month_reserve)
}

/// Strictly ascending token ids (catches duplicates and out-of-order rows).
pub fn is_strictly_sorted(entries: &[PayoutEntry]) -> bool {
    entries
        .windows(2)
        .all(|pair| pair[0].token_id < pair[1].token_id)
}
