//! NEP-171 core: transfers, transfer-call, and token view.

use std::collections::HashMap;

use near_sdk::{env, ext_contract, near, AccountId, Gas, Promise, PromiseOrValue, PromiseResult};

use crate::*;

const GAS_FOR_NFT_ON_TRANSFER: Gas = Gas::from_tgas(25);
const GAS_FOR_RESOLVE_TRANSFER: Gas = Gas::from_tgas(15);

/// Receiver side of `nft_transfer_call`.
#[ext_contract(ext_non_fungible_token_receiver)]
#[allow(dead_code)]
trait NonFungibleTokenReceiver {
    /// Returns `true` if the token should be returned to the sender.
    fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_id: AccountId,
        token_id: TokenId,
        msg: String,
    ) -> Promise;
}

#[near]
impl Contract {
    /// Transfer a master to `receiver_id`. No funds move: only ownership
    /// changes, so the song account and its balance follow the token.
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        let sender_id = env::predecessor_account_id();
        let previous =
            self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo);
        if !previous.approved_account_ids.is_empty() {
            refund_approved_account_ids(previous.owner_id, &previous.approved_account_ids);
        }
    }

    /// NEP-171 transfer + `nft_on_transfer` call. If the receiver returns
    /// `true` (or fails), the token is returned to the previous owner.
    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        assert_one_yocto();
        let sender_id = env::predecessor_account_id();
        let previous = self.internal_transfer(
            &sender_id,
            &receiver_id,
            &token_id,
            approval_id,
            memo.clone(),
        );
        let authorized_id = if sender_id != previous.owner_id {
            Some(sender_id.to_string())
        } else {
            None
        };
        ext_non_fungible_token_receiver::ext(receiver_id.clone())
            .with_static_gas(GAS_FOR_NFT_ON_TRANSFER)
            .nft_on_transfer(sender_id, previous.owner_id.clone(), token_id.clone(), msg)
            .then(
                Contract::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE_TRANSFER)
                    .nft_resolve_transfer(
                        authorized_id,
                        previous.owner_id,
                        receiver_id,
                        token_id,
                        previous.approved_account_ids,
                        memo,
                    ),
            )
            .into()
    }

    /// Resolver for `nft_transfer_call`. Returns `true` when the token
    /// stays with the receiver.
    #[private]
    pub fn nft_resolve_transfer(
        &mut self,
        authorized_id: Option<String>,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: HashMap<AccountId, u64>,
        memo: Option<String>,
    ) -> bool {
        if let PromiseResult::Successful(value) = env::promise_result(0) {
            if let Ok(return_token) = serde_json::from_slice::<bool>(&value) {
                if !return_token {
                    // Receiver accepted: release the old approvals' storage.
                    if !approved_account_ids.is_empty() {
                        refund_approved_account_ids(previous_owner_id, &approved_account_ids);
                    }
                    return true;
                }
            }
        }

        // Return the token to the previous owner unless the receiver has
        // already moved it on.
        let mut master = match self.tokens_by_id.get(&token_id) {
            Some(master) if master.owner_id == receiver_id => master,
            _ => {
                if !approved_account_ids.is_empty() {
                    refund_approved_account_ids(previous_owner_id, &approved_account_ids);
                }
                return true;
            }
        };

        self.internal_remove_token_from_owner(&receiver_id, &token_id);
        self.internal_add_token_to_owner(&previous_owner_id, &token_id);
        let receiver_owner = master.owner_id.clone();
        master.owner_id = previous_owner_id.clone();
        // Approvals set by the receiver during the short custody are
        // refunded; the pre-transfer approvals are restored.
        if !master.approved_account_ids.is_empty() {
            refund_approved_account_ids(receiver_id.clone(), &master.approved_account_ids);
        }
        master.approved_account_ids = approved_account_ids;
        self.tokens_by_id.insert(&token_id, &master);

        events::emit_nft_transfer(
            authorized_id,
            &receiver_owner,
            &previous_owner_id,
            &token_id,
            memo,
        );
        events::emit_master_transferred(&token_id, &receiver_owner, &previous_owner_id, None);
        false
    }

    /// View one master.
    pub fn nft_token(&self, token_id: TokenId) -> Option<JsonMaster> {
        self.tokens_by_id
            .get(&token_id)
            .map(|master| self.to_json_master(&token_id, &master))
    }
}
