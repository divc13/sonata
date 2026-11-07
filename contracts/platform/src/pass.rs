//! Pass NFT: soulbound NEP-171 subset plus the `ft_on_transfer` purchase path.

use near_sdk::json_types::U128;
use near_sdk::{env, log, near, AccountId, Promise, PromiseOrValue};

use crate::*;

#[near]
impl Contract {
    /// NEP-141 receiver. `mock-usdc` calls this after moving `amount` USDC to
    /// the platform. Returning a non-zero string refunds that amount.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> String {
        assert_eq!(
            env::predecessor_account_id(),
            self.payment_token,
            "Wrong payment token"
        );
        assert_eq!(msg, "pass", "Unsupported message");
        assert!(!self.paused, "Paused");
        if amount.0 != self.subscription_price.0 {
            log!(
                "Insufficient payment: expected {}",
                self.subscription_price.0
            );
            return amount.0.to_string();
        }

        let now = now_secs();
        let current_expiry = self.pass_expiry(sender_id.clone());
        let expires_at = now.max(current_expiry) + self.pass_duration_sec;
        self.cached_balance.0 = self.cached_balance.0.saturating_add(amount.0);

        if let Some(token_id) = self.pass_by_owner.get(&sender_id) {
            let mut pass = self
                .passes
                .get(&token_id)
                .unwrap_or_else(|| env::panic_str("Pass invariant broken"));
            pass.expires_at = expires_at;
            pass.renewed_count = pass.renewed_count.saturating_add(1);
            self.passes.insert(&token_id, &pass);
            events::emit_pass_renewed(&sender_id, &token_id, expires_at, amount);
        } else {
            let token_id = format!("pass-{}", self.next_pass_id);
            self.next_pass_id += 1;
            let pass = Pass {
                owner_id: sender_id.clone(),
                expires_at,
                minted_at: now,
                renewed_count: 0,
            };
            self.passes.insert(&token_id, &pass);
            self.pass_by_owner.insert(&sender_id, &token_id);
            events::emit_pass_minted(&sender_id, &token_id, expires_at, amount);
        }

        "0".to_string()
    }

    // ------------------------------------------------------------------
    // NEP-171 subset
    // ------------------------------------------------------------------

    pub fn nft_token(&self, token_id: TokenId) -> Option<JsonPass> {
        self.passes.get(&token_id).map(|pass| JsonPass {
            token_id,
            owner_id: pass.owner_id,
            expires_at: pass.expires_at,
            minted_at: pass.minted_at,
            renewed_count: pass.renewed_count,
        })
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<JsonPass> {
        let from = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.map(|l| l as usize).unwrap_or(usize::MAX);
        self.passes
            .iter()
            .filter(|(_, pass)| pass.owner_id == account_id)
            .skip(from)
            .take(limit)
            .map(|(token_id, pass)| JsonPass {
                token_id,
                owner_id: pass.owner_id,
                expires_at: pass.expires_at,
                minted_at: pass.minted_at,
                renewed_count: pass.renewed_count,
            })
            .collect()
    }

    pub fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Sonata Pass".to_string(),
            symbol: "PASS".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }

    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let _ = (receiver_id, token_id, approval_id, memo);
        env::panic_str("Pass is non-transferable");
    }

    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let _ = (receiver_id, token_id, approval_id, memo, msg);
        env::panic_str("Pass is non-transferable");
    }

    #[payable]
    pub fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        let _ = (token_id, account_id, msg);
        env::panic_str("Pass is non-transferable");
    }

    // ------------------------------------------------------------------
    // Pass views
    // ------------------------------------------------------------------

    /// Unix seconds when the account's pass expires; 0 when it has none.
    pub fn pass_expiry(&self, account_id: AccountId) -> u64 {
        match self.pass_by_owner.get(&account_id) {
            Some(token_id) => self
                .passes
                .get(&token_id)
                .map(|pass| pass.expires_at)
                .unwrap_or(0),
            None => 0,
        }
    }

    pub fn is_pass_active(&self, account_id: AccountId) -> bool {
        self.pass_expiry(account_id) > now_secs()
    }
}
