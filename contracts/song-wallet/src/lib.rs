//! song-wallet: keyless per-song account contract for Sonata.
//!
//! One instance per master, deployed as immutable global code by
//! `master-nft.nft_mint`. It holds USDC earned by the song and pays only
//! the current NFT owner, which it reads from the master-nft collection at
//! withdrawal time. No admin, no keys, no upgrade.
//!
//! Critical detail: in a promise callback, `env::predecessor_account_id()`
//! is this wallet, not the external caller. The caller is captured at the
//! start of `withdraw` / `withdraw_all` and compared to the NFT owner in
//! the callback. Never compare predecessor to owner inside a callback.

use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, ext_contract, log, near, AccountId, Gas, PanicOnDefault, Promise, PromiseOrValue,
    PromiseResult,
};
use serde_json::json;

/// Sonata / NEP-297 event standard and version.
pub const SONATA_EVENT_STANDARD: &str = "sonata";
pub const SONATA_EVENT_VERSION: &str = "1.0.0";

const GAS_FOR_OWNER_CHECK: Gas = Gas::from_tgas(10);
const GAS_FOR_BALANCE_CHECK: Gas = Gas::from_tgas(10);
const GAS_FOR_SEND_FUNDS: Gas = Gas::from_tgas(25);
const GAS_FOR_SEND_FUNDS_CALLBACK: Gas = Gas::from_tgas(15);
const WITHDRAW_MEMO: &str = "Sonata earnings";
const STATE_KEY: &[u8] = b"STATE";

/// Songs are stateless per callback stage, but the promise chain needs to
/// remember who asked, how much they wanted, and where we are.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct PendingWithdraw {
    /// External caller captured at method entry.
    pub caller: AccountId,
    /// Exactly this much, for `withdraw(amount)`: `Some(amount)`.
    /// `None` means `withdraw_all` (use `balance`).
    pub amount: Option<U128>,
    /// `ft_balance_of(self)` result for `withdraw_all`.
    pub balance: U128,
    /// Current stage of the promise chain.
    pub stage: ClaimStage,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClaimStage {
    /// Waiting for the ownership check receipt.
    OwnerCheck,
    /// Waiting for the USDC transfer receipt.
    SendFunds,
}

/// View transport for `nft_token` on the master-nft collection.
#[ext_contract(ext_nft_collection)]
#[allow(dead_code)]
trait NftCollection {
    fn nft_token(&self, token_id: String) -> Option<JsonMaster>;
}

#[ext_contract(ext_fungible_token)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_balance_of(&self, account_id: AccountId) -> U128;
}

/// What this wallet reads from `master-nft.nft_token` on the wire. Only
/// the owner field is used; the rest is carried as raw JSON.
#[derive(Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct JsonMaster {
    pub token_id: String,
    pub owner_id: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// The master-nft collection account.
    pub collection_id: AccountId,
    /// Token id of the master this wallet serves.
    pub token_id: String,
    /// USDC-like payment token account.
    pub payment_token: AccountId,
    /// Reentrancy guard: one claim at a time.
    pub is_claiming: bool,
    /// In-flight withdrawal request, cleared when the chain completes.
    pub pending: Option<PendingWithdraw>,
}

/// Emit a Sonata NEP-297 event.
fn emit_sonata(event: &str, data: serde_json::Value) {
    log!(
        "EVENT_JSON:{}",
        serde_json::to_string(&json!({
            "standard": SONATA_EVENT_STANDARD,
            "version": SONATA_EVENT_VERSION,
            "event": event,
            "data": data,
        }))
        .expect("event is serializable")
    );
}

#[near]
impl Contract {
    /// Called exactly once by `master-nft.nft_mint` on the freshly created
    /// song account. Panics on double initialization.
    #[init(ignore_state)]
    pub fn new(collection_id: AccountId, token_id: String, payment_token: AccountId) -> Self {
        if env::storage_has_key(STATE_KEY) {
            env::panic_str("Already initialized");
        }
        Self {
            collection_id: collection_id.clone(),
            token_id,
            payment_token: payment_token.clone(),
            is_claiming: false,
            pending: None,
        }
    }

    /// Withdraw `amount` of the song's USDC to the caller, if the caller is
    /// the current NFT owner at execution time.
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        let caller = env::predecessor_account_id();
        assert!(amount.0 > 0, "Amount must be positive");
        self.assert_ready();
        self.is_claiming = true;
        self.pending = Some(PendingWithdraw {
            caller: caller.clone(),
            amount: Some(amount),
            balance: U128(0),
            stage: ClaimStage::OwnerCheck,
        });
        ext_nft_collection::ext(self.collection_id.clone())
            .with_static_gas(GAS_FOR_OWNER_CHECK)
            .nft_token(self.token_id.clone())
            .then(
                Contract::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_SEND_FUNDS)
                    .on_owner_checked(U128(0)),
            )
    }

    /// Withdraw the song's whole USDC balance to the caller, if the caller
    /// is the current NFT owner at execution time.
    ///
    /// Implemented as its own promise chain (balance -> owner check ->
    /// send). Must not call `withdraw` internally: inside a callback the
    /// wallet itself would be the predecessor and would be mistaken for a
    /// legitimate caller of the remaining chain.
    pub fn withdraw_all(&mut self) -> Promise {
        let caller = env::predecessor_account_id();
        self.assert_ready();
        self.is_claiming = true;
        self.pending = Some(PendingWithdraw {
            caller: caller.clone(),
            amount: None,
            balance: U128(0),
            stage: ClaimStage::OwnerCheck,
        });
        ext_fungible_token::ext(self.payment_token.clone())
            .with_static_gas(GAS_FOR_BALANCE_CHECK)
            .ft_balance_of(env::current_account_id())
            .then(
                Contract::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_OWNER_CHECK)
                    .on_balance_fetched(),
            )
    }

    /// Second stage of `withdraw_all`: read `ft_balance_of` from the
    /// mocked result, then start the ownership check.
    #[private]
    pub fn on_balance_fetched(&mut self) -> PromiseOrValue<U128> {
        let mut pending = match &self.pending {
            Some(pending) => pending.clone(),
            None => env::panic_str("Withdraw invariant broken"),
        };
        match env::promise_result(0) {
            PromiseResult::Successful(bytes) => match serde_json::from_slice::<U128>(&bytes) {
                Ok(balance) => {
                    if balance.0 == 0 {
                        self.abort("Nothing to withdraw");
                    } else {
                        pending.balance = balance;
                        self.pending = Some(pending.clone());
                        return ext_nft_collection::ext(self.collection_id.clone())
                            .with_static_gas(GAS_FOR_OWNER_CHECK)
                            .nft_token(self.token_id.clone())
                            .then(
                                Contract::ext(env::current_account_id())
                                    .with_static_gas(GAS_FOR_SEND_FUNDS)
                                    .on_owner_checked(balance),
                            )
                            .into();
                    }
                }
                Err(_) => self.abort("Withdraw aborted"),
            },
            PromiseResult::Failed => self.abort("Withdraw aborted"),
        }
        PromiseOrValue::Value(U128(0))
    }

    /// Third stage (both withdraw paths): check that the stored caller is
    /// the current NFT owner, then transfer the funds out.
    #[private]
    pub fn on_owner_checked(&mut self, _balance: U128) -> PromiseOrValue<U128> {
        let _ = _balance;
        let mut pending = match self.pending.take() {
            Some(pending) => pending,
            None => env::panic_str("Withdraw invariant broken"),
        };
        if let PromiseResult::Successful(bytes) = env::promise_result(0) {
            if let Ok(Some(master)) = serde_json::from_slice::<Option<JsonMaster>>(&bytes) {
                if master.owner_id == pending.caller {
                    let amount = match pending.amount {
                        Some(amount) => amount,
                        None => pending.balance,
                    };
                    pending.stage = ClaimStage::SendFunds;
                    self.pending = Some(pending);
                    return ext_fungible_token::ext(self.payment_token.clone())
                        .with_static_gas(GAS_FOR_SEND_FUNDS)
                        .ft_transfer(
                            master.owner_id.clone(),
                            amount,
                            Some(WITHDRAW_MEMO.to_string()),
                        )
                        .then(
                            Contract::ext(env::current_account_id())
                                .with_static_gas(GAS_FOR_SEND_FUNDS_CALLBACK)
                                .on_funds_sent(),
                        )
                        .into();
                }
                self.abort("Not the owner");
            } else {
                self.abort("Withdraw aborted");
            }
        } else {
            self.abort("Withdraw aborted");
        }
        PromiseOrValue::Value(U128(0))
    }

    /// Final stage: emit the event on success, always release the guard.
    /// Note: this runs whether or not the USDC transfer succeeded; the
    /// transfer itself is atomic.
    #[private]
    pub fn on_funds_sent(&mut self) -> PromiseOrValue<U128> {
        let pending = self.pending.take().expect("Withdraw invariant broken");
        let finished = match pending.stage {
            ClaimStage::SendFunds => true,
            ClaimStage::OwnerCheck => false,
        };
        let amount = match pending.amount {
            Some(amount) => amount,
            None => pending.balance,
        };
        if let PromiseResult::Successful(_) = env::promise_result(0) {
            if finished {
                emit_sonata(
                    "withdraw",
                    json!({
                        "token_id": &self.token_id,
                        "owner": pending.caller.to_string(),
                        "amount": amount.0.to_string(),
                    }),
                );
            }
        }
        // The guard is reset in every path listed below.
        self.reset_guard();
        PromiseOrValue::Value(U128(0))
    }

    /// Contract configuration: collection, token id, payment token, and
    /// the current guard state.
    pub fn get_config(&self) -> Config {
        Config {
            collection_id: self.collection_id.clone(),
            token_id: self.token_id.clone(),
            payment_token: self.payment_token.clone(),
            is_claiming: self.is_claiming,
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    fn assert_ready(&self) {
        assert!(!self.is_claiming, "Claim in progress");
    }

    /// Release the guard and clear the pending request. This happens on
    /// failure instead of panicking: a panic here would roll back the
    /// state write and wedge the wallet in `"Claim in progress"` forever,
    /// letting anyone permanently freeze a song's earnings.
    fn reset_guard(&mut self) {
        self.is_claiming = false;
        self.pending = None;
    }

    /// Log a rejection reason and release the guard. The reason strings
    /// match the spec's error names so tooling can match on them.
    fn abort(&mut self, reason: &str) {
        log!("Withdraw rejected: {}", reason);
        self.reset_guard();
    }
}

/// Wallet configuration view.
#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct Config {
    pub collection_id: AccountId,
    pub token_id: String,
    pub payment_token: AccountId,
    pub is_claiming: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, RuntimeFeesConfig};
    use std::collections::HashMap;

    const COLLECTION: usize = 0;
    const USDC: usize = 2;
    const OWNER: usize = 1;
    const ATTACKER: usize = 3;

    fn s() {
        testing_env!(VMContextBuilder::new().build());
    }

    /// Fresh wallet contract state for unit testing (the same initializer
    /// the master-nft factory calls on the song account).
    fn wallet() -> Contract {
        Contract::new(
            accounts(COLLECTION),
            "midnight-drive".to_string(),
            accounts(USDC),
        )
    }

    fn as_owner() {
        testing_env!(VMContextBuilder::new()
            .current_account_id(accounts(0)) // the wallet itself
            .predecessor_account_id(accounts(OWNER))
            .build());
    }

    fn as_attacker() {
        testing_env!(VMContextBuilder::new()
            .current_account_id(accounts(0))
            .predecessor_account_id(accounts(ATTACKER))
            .build());
    }

    #[test]
    fn new_reads_config() {
        let wallet = wallet();
        let config = wallet.get_config();
        assert_eq!(config.collection_id, accounts(COLLECTION));
        assert_eq!(config.token_id, "midnight-drive");
        assert_eq!(config.payment_token, accounts(USDC));
        assert!(!config.is_claiming);
        assert!(wallet.pending.is_none());
    }

    /// Calling `new` on an account that already has contract state must
    /// panic, even though the store is replaced wholesale by this
    /// initializer.
    #[test]
    #[should_panic(expected = "Already initialized")]
    fn new_panics_when_state_exists() {
        s();
        near_sdk::env::storage_write(STATE_KEY, b"existing state");
        let _ = Contract::new(
            accounts(COLLECTION),
            "midnight-drive".to_string(),
            accounts(USDC),
        );
    }

    #[test]
    fn withdraw_captures_caller_and_sets_guard() {
        s();
        let mut wallet = wallet();
        as_owner();
        wallet.withdraw(U128(1_000_000));
        assert!(wallet.is_claiming);
        let pending = wallet.pending.clone().expect("pending must be set");
        assert_eq!(pending.caller, accounts(OWNER));
        assert_eq!(pending.amount, Some(U128(1_000_000)));
        assert_eq!(pending.stage, ClaimStage::OwnerCheck);
    }

    #[test]
    fn withdraw_all_captures_caller_and_sets_guard() {
        s();
        let mut wallet = wallet();
        as_owner();
        wallet.withdraw_all();
        assert!(wallet.is_claiming);
        let pending = wallet.pending.clone().expect("pending must be set");
        assert_eq!(pending.caller, accounts(OWNER));
        assert_eq!(pending.amount, None);
    }

    #[test]
    #[should_panic(expected = "Amount must be positive")]
    fn withdraw_panics_on_zero_amount() {
        s();
        let mut wallet = wallet();
        as_owner();
        wallet.withdraw(U128(0));
    }

    #[test]
    #[should_panic(expected = "Claim in progress")]
    fn withdraw_panics_while_claim_in_progress() {
        s();
        let mut wallet = wallet();
        as_owner();
        wallet.withdraw(U128(1_000_000));
        // A second withdrawal while the first chain is still in flight -
        // same caller or another one - must fail.
        wallet.withdraw(U128(1_000_000));
    }

    #[test]
    #[should_panic(expected = "Claim in progress")]
    fn withdraw_panics_when_guard_was_left_set() {
        s();
        let mut wallet = wallet();
        as_owner();
        wallet.is_claiming = true;
        wallet.withdraw(U128(1_000_000));
    }

    /// `on_owner_checked` is the callback position: the predecessor there
    /// is this wallet itself, never the external caller. The comparison
    /// must use the caller stored at method entry.
    #[test]
    fn owner_check_uses_stored_caller_not_callback_predecessor() {
        s();
        let mut wallet = wallet();
        as_attacker();
        wallet.withdraw(U128(1_000_000));
        assert_eq!(wallet.pending.as_ref().unwrap().caller, accounts(ATTACKER));
        // Inside the callback, this contract executed on its own behalf:
        // whoever owns the token is decided against the stored caller.
        // Simulate a successful nft_token result returning some other
        // owner, and check that no funds-transfer stage is entered.
        let master = serde_json::json!({
            "token_id": "midnight-drive",
            "owner_id": accounts(OWNER).to_string(),
        });
        let bytes = serde_json::to_vec(&master).unwrap();
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(accounts(0))
                .predecessor_account_id(accounts(0))
                .build(),
            near_sdk::test_vm_config(),
            RuntimeFeesConfig::test(),
            HashMap::default(),
            vec![PromiseResult::Successful(bytes)]
        );
        // This receipt chain aborts with a rejection log and resets the
        // guard, because the stored caller is not the owner.
        wallet.on_owner_checked(U128(0));
        assert!(!wallet.is_claiming);
        assert!(wallet.pending.is_none());
    }
}
