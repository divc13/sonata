//! NEP-171 enumeration views.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

use crate::*;

#[near]
impl Contract {
    /// Total number of minted masters.
    pub fn nft_total_supply(&self) -> U128 {
        U128(self.token_supply as u128)
    }

    /// All masters, paginated.
    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<JsonMaster> {
        let start = u128::from(from_index.unwrap_or(U128(0))) as usize;
        self.tokens_by_id
            .keys()
            .skip(start)
            .take(limit.unwrap_or(50) as usize)
            .map(|token_id| {
                let master = self.tokens_by_id.get(&token_id).expect("token vanished");
                self.to_json_master(&token_id, &master)
            })
            .collect()
    }

    /// Number of masters owned by `account_id`.
    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(
            self.tokens_per_owner
                .get(&account_id)
                .map(|tokens| tokens.len() as u128)
                .unwrap_or(0),
        )
    }

    /// Masters owned by `account_id`, paginated.
    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<JsonMaster> {
        let tokens = match self.tokens_per_owner.get(&account_id) {
            Some(tokens) => tokens,
            None => return vec![],
        };
        let start = u128::from(from_index.unwrap_or(U128(0))) as usize;
        tokens
            .iter()
            .skip(start)
            .take(limit.unwrap_or(50) as usize)
            .map(|token_id| {
                let master = self.tokens_by_id.get(&token_id).expect("token vanished");
                self.to_json_master(&token_id, &master)
            })
            .collect()
    }

    /// Contract metadata.
    pub fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().expect("metadata is always set")
    }
}
