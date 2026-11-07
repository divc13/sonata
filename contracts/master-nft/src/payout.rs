//! NEP-199 royalties: fixed 500 bps to the creator, the rest to the seller.

use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId};

use crate::*;

#[near]
impl Contract {
    /// Split `balance` for a sale of `token_id`: 5% to the creator, the
    /// rest to the current owner. Returns a single entry when the creator
    /// is the current owner.
    pub fn nft_payout(&self, token_id: TokenId, balance: U128, max_len_payout: u32) -> Payout {
        let master = self.tokens_by_id.get(&token_id).expect("No token");
        payout_for(
            &master.creator_id,
            &master.owner_id,
            master.royalty_bps,
            balance.0,
            max_len_payout,
        )
    }

    /// Transfer the token and return the payout split for the sale. Used by
    /// the market: NFT first, money second.
    #[payable]
    pub fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: u32,
    ) -> Payout {
        assert_one_yocto();
        let sender_id = env::predecessor_account_id();
        let previous =
            self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo);
        if !previous.approved_account_ids.is_empty() {
            refund_approved_account_ids(previous.owner_id.clone(), &previous.approved_account_ids);
        }
        payout_for(
            &previous.creator_id,
            &previous.owner_id,
            previous.royalty_bps,
            balance.0,
            max_len_payout,
        )
    }
}
