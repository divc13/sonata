//! mock-usdc: NEP-141 fungible token used by Sonata on NEAR testnet.
//!
//! Six-decimal test stablecoin with an owner-only demo mint. Storage is a
//! simplified NEP-145 with a fixed per-account cost, because
//! `platform.register_song` registers song accounts with `storage_deposit`.
//!
//! Never deploy to mainnet: the owner key can mint any amount.

use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, ext_contract, log, near, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue, PromiseResult,
};
use serde_json::json;

/// NEP-141 metadata schema version.
pub const FT_METADATA_SPEC: &str = "ft-1.0.0";
/// NEP-141 / NEP-297 event standard and version.
pub const FT_EVENT_STANDARD: &str = "nep141";
pub const FT_EVENT_VERSION: &str = "1.0.0";

/// Gas forwarded to `ft_on_transfer`. Market needs 50 Tgas for
/// `nft_transfer_payout` plus 40 Tgas for its distribution callback, so the
/// receiver budget must cover both (with margin) or the market panics with
/// "Exceeded the prepaid gas" and the buy is refunded.
const GAS_FOR_FT_ON_TRANSFER: Gas = Gas::from_tgas(120);
const GAS_FOR_RESOLVE_TRANSFER: Gas = Gas::from_tgas(15);
const ONE_YOCTONEAR: NearToken = NearToken::from_yoctonear(1);
const ZERO_TOKEN: NearToken = NearToken::from_yoctonear(0);

/// Storage charged per registered account, in bytes of contract storage.
pub const STORAGE_BYTES_PER_ACCOUNT: u64 = 120;

/// Simple inline icon (blue circle with a white C mark).
const DATA_IMAGE_SVG_ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%232775ca'/%3E%3Ccircle cx='12' cy='12' r='7' fill='none' stroke='white' stroke-width='2'/%3E%3C/svg%3E";

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// Owner-only admin: can mint and burn demo USDC.
    pub owner_id: AccountId,
    /// USDC balance of every account with a non-zero balance.
    pub balances: LookupMap<AccountId, u128>,
    /// Storage balance attached by every registered account (NEP-145).
    pub registered: LookupMap<AccountId, u128>,
    pub total_supply: u128,
    pub metadata: FungibleTokenMetadata,
}

/// NEP-141 contract metadata.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct FungibleTokenMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}

/// NEP-145 storage balance bounds.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalanceBounds {
    pub min: U128,
    pub max: U128,
}

/// NEP-145 storage balance for one account.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

/// Receiver side of `ft_transfer_call`.
#[ext_contract(ext_ft_receiver)]
trait FungibleTokenReceiver {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128>;
}

/// Emit a NEP-297 event log line.
pub fn emit(standard: &str, event: &str, data: serde_json::Value) {
    log!(
        "EVENT_JSON:{}",
        serde_json::to_string(&json!({
            "standard": standard,
            "version": FT_EVENT_VERSION,
            "event": event,
            "data": data,
        }))
        .expect("event is serializable")
    );
}

fn emit_transfer(
    old_owner_id: &AccountId,
    new_owner_id: &AccountId,
    amount: u128,
    memo: Option<&str>,
) {
    emit(
        FT_EVENT_STANDARD,
        "ft_transfer",
        json!([{
            "old_owner_id": old_owner_id.to_string(),
            "new_owner_id": new_owner_id.to_string(),
            "amount": amount.to_string(),
            "memo": memo,
        }]),
    );
}

/// Storage cost for one registered account, in yoctoNEAR.
pub fn storage_cost_yocto() -> u128 {
    env::storage_byte_cost()
        .as_yoctonear()
        .saturating_mul(STORAGE_BYTES_PER_ACCOUNT as u128)
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id: owner_id.clone(),
            balances: LookupMap::new(b"u"),
            registered: LookupMap::new(b"r"),
            total_supply: 0,
            metadata: FungibleTokenMetadata {
                spec: FT_METADATA_SPEC.into(),
                name: "Sonata USD Coin".into(),
                symbol: "USDC".into(),
                icon: Some(DATA_IMAGE_SVG_ICON.into()),
                reference: None,
                reference_hash: None,
                decimals: 6,
            },
        }
    }

    // ------------------------------------------------------------------
    // Demo supply control (owner only)
    // ------------------------------------------------------------------

    /// Mint USDC to an account. The account is registered automatically,
    /// so the demo owner never needs to attach storage first.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "Only owner");
        assert!(amount.0 > 0, "Amount must be positive");
        self.internal_deposit(&account_id, amount.0);
        emit(
            FT_EVENT_STANDARD,
            "ft_mint",
            json!([{
                "owner_id": account_id.to_string(),
                "amount": amount.0.to_string(),
            }]),
        );
    }

    /// Burn USDC from an account (owner only).
    pub fn burn(&mut self, account_id: AccountId, amount: U128) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "Only owner");
        assert!(amount.0 > 0, "Amount must be positive");
        self.internal_withdraw(&account_id, amount.0);
        emit(
            FT_EVENT_STANDARD,
            "ft_burn",
            json!([{
                "owner_id": account_id.to_string(),
                "amount": amount.0.to_string(),
            }]),
        );
    }

    // ------------------------------------------------------------------
    // NEP-141
    // ------------------------------------------------------------------

    /// Send USDC. Per NEP-141, requires exactly 1 yoctoNEAR attached and
    /// both accounts registered.
    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        assert_eq!(
            env::attached_deposit(),
            ONE_YOCTONEAR,
            "Requires attached deposit of exactly 1 yoctoNEAR"
        );
        self.assert_receiver(&receiver_id);
        let sender_id = env::predecessor_account_id();
        self.internal_transfer(&sender_id, &receiver_id, amount.0);
        emit_transfer(&sender_id, &receiver_id, amount.0, memo.as_deref());
    }

    /// Send USDC and call `ft_on_transfer` on the receiver contract. Any
    /// non-zero return value is refunded to the sender in a callback.
    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        assert_eq!(
            env::attached_deposit(),
            ONE_YOCTONEAR,
            "Requires attached deposit of exactly 1 yoctoNEAR"
        );
        self.assert_receiver(&receiver_id);
        let sender_id = env::predecessor_account_id();
        self.internal_transfer(&sender_id, &receiver_id, amount.0);
        emit_transfer(&sender_id, &receiver_id, amount.0, memo.as_deref());
        ext_ft_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_FOR_FT_ON_TRANSFER)
            .ft_on_transfer(sender_id.clone(), amount, msg)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE_TRANSFER)
                    .ft_resolve_transfer(sender_id, receiver_id, amount),
            )
            .into()
    }

    /// Resolver for `ft_transfer_call`: refunds the unused amount to the
    /// sender. Runs even when `ft_on_transfer` panicked, in which case the
    /// full amount is refunded. Returns the amount actually kept by the
    /// receiver.
    #[private]
    pub fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let mut refunded = amount.0;
        if let PromiseResult::Successful(value) = env::promise_result(0) {
            if let Ok(U128(underspent)) = serde_json::from_slice::<U128>(&value) {
                if sender_id != receiver_id {
                    refunded = underspent.min(amount.0);
                }
            } else {
                // Missing or non-standard return value: keep the transfer.
                refunded = 0;
            }
        }
        if refunded == amount.0 && sender_id != receiver_id {
            // The receiver call failed (or asked to refund everything).
            // The receiver may have already spent the funds internally, so
            // cap the refund by its actual balance: a panicking receiver
            // cannot roll back what it did complete.
            let receiver_balance = self.balances.get(&receiver_id).unwrap_or_default();
            refunded = receiver_balance.min(amount.0);
        }
        if refunded > 0 && sender_id != receiver_id {
            self.internal_withdraw(&receiver_id, refunded);
            self.internal_deposit(&sender_id, refunded);
            emit_transfer(
                &receiver_id,
                &sender_id,
                refunded,
                Some("ft_transfer_call refund"),
            );
        }
        U128(amount.0 - refunded)
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).unwrap_or_default())
    }

    pub fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }

    // ------------------------------------------------------------------
    // NEP-145 (simplified, fixed cost)
    // ------------------------------------------------------------------

    /// Register an account for storage. Anyone may deposit on behalf of
    /// any account (the platform registers song accounts without access to
    /// their keys).
    #[payable]
    pub fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        let account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let attached = env::attached_deposit();
        if let Some(current) = self.internal_storage_balance(&account_id) {
            // Already registered: give everything back.
            if attached > ZERO_TOKEN {
                Promise::new(env::predecessor_account_id()).transfer(attached);
            }
            return current;
        }
        let cost = storage_cost_yocto();
        assert!(
            attached.as_yoctonear() >= cost,
            "The attached deposit is less than the required storage"
        );
        let taken = if registration_only.unwrap_or(false) {
            // Only registration is needed: refund whatever exceeds the cost.
            cost
        } else {
            // Take the whole deposit as the account's storage balance.
            attached.as_yoctonear()
        };
        self.registered.insert(&account_id, &taken);
        let refund = attached.as_yoctonear() - taken;
        if refund > 0 {
            Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(refund));
        }
        self.internal_storage_balance(&account_id)
            .expect("account was just registered")
    }

    /// Withdraw an over-deposit. Only the registered account itself may
    /// call this.
    pub fn storage_withdraw(&mut self, amount: Option<U128>) -> StorageBalance {
        assert!(
            env::attached_deposit() == ZERO_TOKEN,
            "Storage withdraw requires no attached deposit"
        );
        let account_id = env::predecessor_account_id();
        let initial = self
            .registered
            .get(&account_id)
            .expect("Storage not registered");
        let available = initial.saturating_sub(storage_cost_yocto());
        let to_withdraw = amount.unwrap_or(U128(available)).0;
        assert!(
            to_withdraw > 0 && to_withdraw <= available,
            "Not enough storage to withdraw"
        );
        Promise::new(account_id.clone()).transfer(NearToken::from_yoctonear(to_withdraw));
        let remaining = initial - to_withdraw;
        self.registered.insert(&account_id, &remaining);
        StorageBalance {
            total: U128(remaining),
            available: U128(remaining.saturating_sub(storage_cost_yocto())),
        }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.internal_storage_balance(&account_id)
    }

    /// Fixed storage bounds: one account costs exactly
    /// `STORAGE_BYTES_PER_ACCOUNT` bytes of contract storage.
    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        let cost = storage_cost_yocto();
        StorageBalanceBounds {
            min: U128(cost),
            max: U128(u128::MAX - (u128::MAX % cost)),
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    fn internal_storage_balance(&self, account_id: &AccountId) -> Option<StorageBalance> {
        let total = self.registered.get(account_id)?;
        let available = total.saturating_sub(storage_cost_yocto());
        Some(StorageBalance {
            total: U128(total),
            available: U128(available),
        })
    }

    fn assert_receiver(&self, receiver_id: &AccountId) {
        assert_ne!(
            *receiver_id,
            env::current_account_id(),
            "Receiver is the current contract"
        );
        assert!(
            self.registered.contains_key(receiver_id),
            "The account is not registered"
        );
    }

    /// Register an account without charging: only ever used by the owner
    /// mint, which is the demo faucet.
    fn internal_register(&mut self, account_id: &AccountId) {
        if !self.registered.contains_key(account_id) {
            self.registered.insert(account_id, &storage_cost_yocto());
        }
    }

    fn internal_deposit(&mut self, account_id: &AccountId, amount: u128) {
        let balance = self.balances.get(account_id).unwrap_or_default();
        self.balances.insert(account_id, &(balance + amount));
        self.internal_register(account_id);
        self.total_supply = self.total_supply.checked_add(amount).unwrap();
    }

    fn internal_withdraw(&mut self, account_id: &AccountId, amount: u128) {
        let balance = self.balances.get(account_id).unwrap_or_default();
        assert!(balance >= amount, "Insufficient balance");
        let remaining = balance - amount;
        if remaining > 0 {
            self.balances.insert(account_id, &remaining);
        } else {
            self.balances.remove(account_id);
        }
        self.total_supply -= amount;
    }

    fn internal_transfer(&mut self, sender_id: &AccountId, receiver_id: &AccountId, amount: u128) {
        assert!(amount > 0, "Amount must be positive");
        assert_ne!(sender_id, receiver_id, "Sender and receiver are the same");
        self.internal_withdraw(sender_id, amount);
        self.internal_deposit(receiver_id, amount);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::mock::MockAction;
    use near_sdk::test_utils::{accounts, get_created_receipts, VMContextBuilder};
    use near_sdk::{testing_env, RuntimeFeesConfig};
    use std::collections::HashMap;

    const OWNER: usize = 0;
    const ALICE: usize = 1;
    const BOB: usize = 2;
    const MINTER: usize = 3;

    /// One USDC in micro-units.
    const USDC: u128 = 1_000_000;

    /// Mint `amount` to `account` as the demo owner (auto-registers it).
    fn mint(ft: &mut Contract, account: usize, amount: u128) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(OWNER))
            .build());
        ft.mint(accounts(account), U128(amount));
    }

    /// Register `account` through the public storage API (owner pays).
    fn register(ft: &mut Contract, account: usize) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(OWNER))
            .attached_deposit(NearToken::from_yoctonear(storage_cost_yocto()))
            .build());
        ft.storage_deposit(Some(accounts(account)), Some(true));
    }

    #[test]
    fn mint_increases_balance_and_supply() {
        let mut ft = Contract::new(accounts(OWNER));
        mint(&mut ft, ALICE, 5 * USDC);
        testing_env!(VMContextBuilder::new().build());
        assert_eq!(ft.ft_balance_of(accounts(ALICE)), U128(5 * USDC));
        assert_eq!(ft.ft_total_supply(), U128(5 * USDC));
        // Minted accounts are registered for storage.
        assert!(ft.storage_balance_of(accounts(ALICE)).is_some());
    }

    #[test]
    #[should_panic(expected = "Only owner")]
    fn mint_panics_for_non_owner() {
        let mut ft = Contract::new(accounts(OWNER));
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(MINTER))
            .build());
        ft.mint(accounts(ALICE), U128(USDC));
    }

    #[test]
    fn burn_reduces_balance_and_supply() {
        let mut ft = Contract::new(accounts(OWNER));
        mint(&mut ft, ALICE, 5 * USDC);
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(OWNER))
            .build());
        ft.burn(accounts(ALICE), U128(2 * USDC));
        testing_env!(VMContextBuilder::new().build());
        assert_eq!(ft.ft_balance_of(accounts(ALICE)), U128(3 * USDC));
        assert_eq!(ft.ft_total_supply(), U128(3 * USDC));
    }

    #[test]
    fn transfer_moves_balance() {
        let mut ft = Contract::new(accounts(OWNER));
        mint(&mut ft, ALICE, 2 * USDC);
        register(&mut ft, BOB);
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(ONE_YOCTONEAR)
            .build());
        ft.ft_transfer(accounts(BOB), U128(USDC), Some("test".into()));
        testing_env!(VMContextBuilder::new().build());
        assert_eq!(ft.ft_balance_of(accounts(ALICE)), U128(USDC));
        assert_eq!(ft.ft_balance_of(accounts(BOB)), U128(USDC));
        assert_eq!(ft.ft_total_supply(), U128(2 * USDC));
    }

    #[test]
    #[should_panic(expected = "Insufficient balance")]
    fn transfer_panics_on_insufficient_balance() {
        let mut ft = Contract::new(accounts(OWNER));
        mint(&mut ft, ALICE, USDC);
        register(&mut ft, BOB);
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(ONE_YOCTONEAR)
            .build());
        ft.ft_transfer(accounts(BOB), U128(2 * USDC), None);
    }

    #[test]
    #[should_panic(expected = "The account is not registered")]
    fn transfer_panics_for_unregistered_receiver() {
        let mut ft = Contract::new(accounts(OWNER));
        mint(&mut ft, ALICE, USDC);
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(ONE_YOCTONEAR)
            .build());
        // accounts(MINTER) was never registered and never minted to.
        ft.ft_transfer(accounts(MINTER), U128(USDC), None);
    }

    /// `ft_resolve_transfer` runs in the callback position of
    /// `ft_transfer_call`, so drive it directly with a mocked promise
    /// result saying the receiver kept only 1 of 3 USDC.
    #[test]
    fn transfer_call_refunds_underspent_amount() {
        let mut ft = Contract::new(accounts(OWNER));
        mint(&mut ft, ALICE, 3 * USDC);
        register(&mut ft, BOB);
        // Move the funds first: the resolver refunds from the receiver.
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(ONE_YOCTONEAR)
            .build());
        ft.ft_transfer(accounts(BOB), U128(3 * USDC), None);
        let promise_results = vec![PromiseResult::Successful(
            serde_json::to_vec(&U128(2 * USDC)).unwrap(),
        )];
        testing_env!(
            VMContextBuilder::new().build(),
            near_sdk::test_vm_config(),
            RuntimeFeesConfig::test(),
            HashMap::default(),
            promise_results
        );
        let used = ft.ft_resolve_transfer(accounts(ALICE), accounts(BOB), U128(3 * USDC));
        assert_eq!(used, U128(USDC));
        assert_eq!(ft.ft_balance_of(accounts(ALICE)), U128(2 * USDC));
        assert_eq!(ft.ft_balance_of(accounts(BOB)), U128(USDC));
        assert_eq!(ft.ft_total_supply(), U128(3 * USDC));
    }

    /// The receiver must receive enough gas to run the market's own two-call
    /// chain: `nft_transfer_payout` (50 Tgas) plus `on_transfer_payout`
    /// (40 Tgas). A smaller budget reverts every buy with "Exceeded the
    /// prepaid gas" and refunds the buyer.
    #[test]
    fn transfer_call_prepays_enough_gas_for_the_receiver() {
        use near_sdk::Gas;

        /* contracts/market/src/lib.rs: GAS_FOR_PAYOUT + GAS_FOR_CALLBACK. */
        const MARKET_SUBCALLS: Gas = Gas::from_tgas(90);
        assert!(
            GAS_FOR_FT_ON_TRANSFER.as_gas() >= MARKET_SUBCALLS.as_gas(),
            "ft_on_transfer must receive at least the market's 90 Tgas"
        );

        let mut ft = Contract::new(accounts(OWNER));
        mint(&mut ft, ALICE, USDC);
        register(&mut ft, BOB);
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(ONE_YOCTONEAR)
            .build());
        let _ = ft.ft_transfer_call(
            accounts(BOB),
            U128(USDC),
            None,
            "buy:midnight-drive".to_string(),
        );

        let receipts = get_created_receipts();
        let receiver = receipts
            .iter()
            .find(|receipt| receipt.receiver_id == accounts(BOB))
            .expect("ft_transfer_call must call the receiver");
        let gas = receiver
            .actions
            .iter()
            .find_map(|action| match action {
                MockAction::FunctionCallWeight {
                    method_name,
                    prepaid_gas,
                    ..
                } if method_name == b"ft_on_transfer" => Some(*prepaid_gas),
                _ => None,
            })
            .expect("the receiver receipt must call ft_on_transfer");
        assert_eq!(gas.as_gas(), GAS_FOR_FT_ON_TRANSFER.as_gas());
        assert!(gas.as_gas() >= MARKET_SUBCALLS.as_gas());
    }

    /// A panicking receiver must not lose the sender's funds.
    #[test]
    fn transfer_call_refunds_full_amount_on_receiver_failure() {
        let mut ft = Contract::new(accounts(OWNER));
        mint(&mut ft, ALICE, 3 * USDC);
        register(&mut ft, BOB);
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(ONE_YOCTONEAR)
            .build());
        ft.ft_transfer(accounts(BOB), U128(3 * USDC), None);
        let promise_results = vec![PromiseResult::Failed];
        testing_env!(
            VMContextBuilder::new().build(),
            near_sdk::test_vm_config(),
            RuntimeFeesConfig::test(),
            HashMap::default(),
            promise_results
        );
        let used = ft.ft_resolve_transfer(accounts(ALICE), accounts(BOB), U128(3 * USDC));
        assert_eq!(used, U128(0));
        assert_eq!(ft.ft_balance_of(accounts(ALICE)), U128(3 * USDC));
        assert_eq!(ft.ft_balance_of(accounts(BOB)), U128(0));
        assert_eq!(ft.ft_total_supply(), U128(3 * USDC));
    }

    #[test]
    fn storage_deposit_registers_and_refunds_excess() {
        let mut ft = Contract::new(accounts(OWNER));
        let cost = {
            testing_env!(VMContextBuilder::new().build());
            storage_cost_yocto()
        };
        // New account with 3x the required cost: registration keeps it all
        // (as the account's storage balance).
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(NearToken::from_yoctonear(3 * cost))
            .build());
        let balance = ft.storage_deposit(Some(accounts(BOB)), None);
        assert_eq!(balance.total, U128(3 * cost));
        assert_eq!(balance.available, U128(2 * cost));
        // Double registration changes nothing and refunds the deposit.
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(NearToken::from_yoctonear(cost))
            .build());
        let balance = ft.storage_deposit(Some(accounts(BOB)), None);
        assert_eq!(balance.total, U128(3 * cost));
        assert_eq!(
            ft.storage_balance_of(accounts(BOB)).unwrap().total,
            U128(3 * cost)
        );
        // Unregistered accounts have no storage balance entry at all.
        assert!(ft.storage_balance_of(accounts(MINTER)).is_none());
        // Fixed bounds.
        let bounds = ft.storage_balance_bounds();
        assert_eq!(bounds.min, U128(cost));
    }

    #[test]
    fn storage_deposit_registration_only_charges_fixed_cost() {
        let mut ft = Contract::new(accounts(OWNER));
        let cost = {
            testing_env!(VMContextBuilder::new().build());
            storage_cost_yocto()
        };
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(NearToken::from_yoctonear(3 * cost))
            .build());
        let balance = ft.storage_deposit(Some(accounts(BOB)), Some(true));
        assert_eq!(balance.total, U128(cost));
        assert_eq!(balance.available, U128(0));
        assert!(ft.storage_balance_of(accounts(BOB)).is_some());
    }

    #[test]
    #[should_panic(expected = "less than the required storage")]
    fn storage_deposit_panics_below_minimum() {
        let mut ft = Contract::new(accounts(OWNER));
        let cost = {
            testing_env!(VMContextBuilder::new().build());
            storage_cost_yocto()
        };
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(ALICE))
            .attached_deposit(NearToken::from_yoctonear(cost / 2))
            .build());
        ft.storage_deposit(None, None);
    }

    #[test]
    fn metadata_is_sonata_usdc() {
        let ft = Contract::new(accounts(OWNER));
        let metadata = ft.ft_metadata();
        assert_eq!(metadata.name, "Sonata USD Coin");
        assert_eq!(metadata.symbol, "USDC");
        assert_eq!(metadata.decimals, 6);
    }
}
