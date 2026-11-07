//! NEP-178 approvals: approve, check, revoke, revoke all.

use near_sdk::{env, ext_contract, near, AccountId, Gas, Promise};

use crate::*;

const GAS_FOR_NFT_ON_APPROVE: Gas = Gas::from_tgas(20);

/// Receiver side of `nft_approve` with a message.
#[ext_contract(ext_non_fungible_approval_receiver)]
#[allow(dead_code)]
trait NonFungibleTokenApprovalsReceiver {
    fn nft_on_approve(
        &mut self,
        token_id: TokenId,
        owner_id: AccountId,
        approval_id: u64,
        msg: String,
    );
}

#[near]
impl Contract {
    /// Approve `account_id` to transfer this token. The attached deposit
    /// pays for the approval storage; the excess is refunded.
    #[payable]
    pub fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        assert_at_least_one_yocto();
        let mut master = self.tokens_by_id.get(&token_id).expect("No token");
        assert_eq!(
            env::predecessor_account_id(),
            master.owner_id,
            "Predecessor must be the token owner."
        );

        let approval_id = master.next_approval_id;
        let is_new_approval = master
            .approved_account_ids
            .insert(account_id.clone(), approval_id)
            .is_none();
        let storage_used = if is_new_approval {
            bytes_for_approved_account_id(&account_id)
        } else {
            0
        };
        master.next_approval_id = master.next_approval_id.saturating_add(1);
        self.tokens_by_id.insert(&token_id, &master);
        refund_deposit(storage_used);

        msg.map(|msg| {
            ext_non_fungible_approval_receiver::ext(account_id)
                .with_static_gas(GAS_FOR_NFT_ON_APPROVE)
                .nft_on_approve(token_id, master.owner_id, approval_id, msg)
        })
    }

    /// Check whether `approved_account_id` may transfer this token,
    /// optionally pinned to a specific approval id.
    pub fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        let master = self.tokens_by_id.get(&token_id).expect("No token");
        match master.approved_account_ids.get(&approved_account_id) {
            Some(actual) => approval_id.map(|id| id == *actual).unwrap_or(true),
            None => false,
        }
    }

    /// Revoke one approval and refund its storage to the owner.
    #[payable]
    pub fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        assert_one_yocto();
        let mut master = self.tokens_by_id.get(&token_id).expect("No token");
        let predecessor = env::predecessor_account_id();
        assert_eq!(
            predecessor, master.owner_id,
            "Predecessor must be the token owner."
        );
        if master.approved_account_ids.remove(&account_id).is_some() {
            self.tokens_by_id.insert(&token_id, &master);
            refund_approved_account_ids_iter(predecessor, [account_id].iter());
        }
    }

    /// Revoke every approval and refund their storage to the owner.
    #[payable]
    pub fn nft_revoke_all(&mut self, token_id: TokenId) {
        assert_one_yocto();
        let mut master = self.tokens_by_id.get(&token_id).expect("No token");
        let predecessor = env::predecessor_account_id();
        assert_eq!(
            predecessor, master.owner_id,
            "Predecessor must be the token owner."
        );
        if !master.approved_account_ids.is_empty() {
            refund_approved_account_ids(predecessor, &master.approved_account_ids);
            master.approved_account_ids.clear();
            self.tokens_by_id.insert(&token_id, &master);
        }
    }
}
