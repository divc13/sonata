//! Internal helpers: storage refunds, owner enumeration, slug rules,
//! payout math, and the single transfer path used by NEP-171 and NEP-199.

use std::collections::HashMap;
use std::mem::size_of;

use near_sdk::json_types::U128;
use near_sdk::{env, AccountId, CryptoHash, NearToken, Promise};

use crate::*;

/// Require exactly 1 yoctoNEAR (NEP-171 security rule).
pub fn assert_one_yocto() {
    assert_eq!(
        env::attached_deposit(),
        NearToken::from_yoctonear(1),
        "Requires attached deposit of exactly 1 yoctoNEAR"
    );
}

/// Require at least 1 yoctoNEAR (approval storage deposits).
pub fn assert_at_least_one_yocto() {
    assert!(
        env::attached_deposit() >= NearToken::from_yoctonear(1),
        "Requires attached deposit of at least 1 yoctoNEAR"
    );
}

/// Refund the storage cost of approved account ids to `account_id`.
pub fn refund_approved_account_ids_iter<'a, I>(
    account_id: AccountId,
    approved_account_ids: I,
) -> Promise
where
    I: Iterator<Item = &'a AccountId>,
{
    let storage_released: u128 = approved_account_ids
        .map(bytes_for_approved_account_id)
        .sum();
    let amount = env::storage_byte_cost().saturating_mul(storage_released);
    Promise::new(account_id).transfer(amount)
}

/// Refund all approved account ids in a map.
pub fn refund_approved_account_ids(
    account_id: AccountId,
    approved_account_ids: &HashMap<AccountId, u64>,
) -> Promise {
    refund_approved_account_ids_iter(account_id, approved_account_ids.keys())
}

/// Refund the deposit above what the current storage use costs.
pub fn refund_deposit(storage_used: u128) {
    let required_cost = env::storage_byte_cost().saturating_mul(storage_used);
    let attached = env::attached_deposit();
    assert!(
        required_cost <= attached,
        "Must attach {} to cover storage",
        required_cost
    );
    let refund = attached.saturating_sub(required_cost);
    if refund > NearToken::from_yoctonear(1) {
        Promise::new(env::predecessor_account_id()).transfer(refund);
    }
}

/// Approximate bytes an approved account id occupies in state.
pub fn bytes_for_approved_account_id(account_id: &AccountId) -> u128 {
    account_id.as_str().len() as u128 + 4 + size_of::<u64>() as u128
}

/// Deterministic per-owner storage prefix.
pub fn hash_account_id(account_id: &AccountId) -> CryptoHash {
    let mut hash = CryptoHash::default();
    hash.copy_from_slice(&env::sha256(account_id.as_bytes()));
    hash
}

/// Current time in Unix seconds.
pub fn now_secs() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

/// Slug rules: lowercase ASCII letters, digits and hyphens; 3..=40 chars;
/// no leading/trailing hyphen; not a reserved infrastructure name.
pub fn is_valid_slug(slug: &str) -> bool {
    if !(3..=40).contains(&slug.len()) {
        return false;
    }
    if slug.starts_with('-') || slug.ends_with('-') {
        return false;
    }
    if RESERVED_SLUGS.contains(&slug) {
        return false;
    }
    slug.bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// NEP-199 payout split. The creator royalty is `floor(balance * bps /
/// 10_000)`; the current owner receives the rest. When the creator is the
/// owner the split collapses into a single full-balance entry.
pub fn payout_for(
    creator_id: &AccountId,
    owner_id: &AccountId,
    royalty_bps: u16,
    balance: u128,
    max_len_payout: u32,
) -> Payout {
    let mut payout: HashMap<AccountId, U128> = HashMap::new();
    if creator_id == owner_id {
        payout.insert(owner_id.clone(), U128(balance));
    } else {
        let royalty = balance
            .checked_mul(royalty_bps as u128)
            .expect("royalty overflow")
            / BPS_DENOMINATOR;
        if royalty > 0 {
            payout.insert(creator_id.clone(), U128(royalty));
        }
        payout.insert(owner_id.clone(), U128(balance - royalty));
    }
    assert!(
        payout.len() as u32 <= max_len_payout,
        "Max len payout too small"
    );
    Payout { payout }
}

impl Contract {
    pub(crate) fn internal_add_token_to_owner(
        &mut self,
        account_id: &AccountId,
        token_id: &TokenId,
    ) {
        let mut tokens = self.tokens_per_owner.get(account_id).unwrap_or_else(|| {
            UnorderedSet::new(StorageKey::TokensPerOwnerInner {
                account_id_hash: hash_account_id(account_id),
            })
        });
        tokens.insert(token_id);
        self.tokens_per_owner.insert(account_id, &tokens);
    }

    pub(crate) fn internal_remove_token_from_owner(
        &mut self,
        account_id: &AccountId,
        token_id: &TokenId,
    ) {
        let mut tokens = self
            .tokens_per_owner
            .get(account_id)
            .expect("Token should be owned by the sender");
        tokens.remove(token_id);
        if tokens.is_empty() {
            self.tokens_per_owner.remove(account_id);
        } else {
            self.tokens_per_owner.insert(account_id, &tokens);
        }
    }

    /// The single transfer path. Checks ownership or approval, moves the
    /// token between owner sets, updates counters, clears approvals, emits
    /// events, and returns the pre-transfer master (for payout math and
    /// approval storage refunds).
    pub(crate) fn internal_transfer(
        &mut self,
        sender_id: &AccountId,
        receiver_id: &AccountId,
        token_id: &TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) -> Master {
        let mut master = self.tokens_by_id.get(token_id).expect("No token");
        let previous = master.clone();
        if sender_id != &master.owner_id {
            let actual_approval_id = master
                .approved_account_ids
                .get(sender_id)
                .unwrap_or_else(|| env::panic_str("Not approved"));
            if let Some(enforced_approval_id) = approval_id {
                assert_eq!(
                    actual_approval_id, &enforced_approval_id,
                    "The actual approval_id is different from the given approval_id"
                );
            }
        }
        assert_ne!(
            &master.owner_id, receiver_id,
            "The token owner and the receiver should be different"
        );

        self.internal_remove_token_from_owner(&master.owner_id, token_id);
        self.internal_add_token_to_owner(receiver_id, token_id);

        master.owner_id = receiver_id.clone();
        master.last_transfer_at = now_secs();
        master.transfer_count = master.transfer_count.saturating_add(1);
        master.approved_account_ids.clear();
        self.tokens_by_id.insert(token_id, &master);

        let authorized_id = if sender_id != &previous.owner_id {
            Some(sender_id.to_string())
        } else {
            None
        };
        events::emit_nft_transfer(
            authorized_id.clone(),
            &previous.owner_id,
            receiver_id,
            token_id,
            memo.clone(),
        );
        events::emit_master_transferred(
            token_id,
            &previous.owner_id,
            receiver_id,
            authorized_id.as_deref(),
        );
        previous
    }

    pub(crate) fn to_json_master(&self, token_id: &TokenId, master: &Master) -> JsonMaster {
        master.clone().into_json(token_id.clone())
    }
}
