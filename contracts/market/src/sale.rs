//! Buy: USDC in via `ft_transfer_call`, NFT out via `nft_transfer_payout`,
//! then the payout split in the callback.

use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, PromiseError, PromiseOrValue};

use crate::{
    emit_sonata, ext_fungible_token, ext_master_nft, royalty_split, split_payout, Contract,
    ContractExt, Payout, PendingBuy, GAS_FOR_CALLBACK, GAS_FOR_FT_TRANSFER, GAS_FOR_PAYOUT,
    ONE_YOCTONEAR,
};

#[near]
impl Contract {
    /// NEP-141 receiver entry point. `msg` is `buy:<token_id>`.
    ///
    /// Everything that rejects the buy returns the amount as a string, which
    /// makes `ft_resolve_transfer` refund it to the buyer. Once the NFT call
    /// is in flight the amount is held here until `on_transfer_payout`.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<String> {
        assert_eq!(
            env::predecessor_account_id(),
            self.payment_token,
            "Only the payment token"
        );

        let Some(token_id) = msg.strip_prefix("buy:") else {
            return PromiseOrValue::Value(amount.0.to_string());
        };
        let token_id = token_id.to_string();
        let listing = self
            .listings
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Listing not active"));
        assert!(listing.active, "Listing not active");

        if amount.0 != listing.price.0 {
            // Refund the buyer: returning the amount tells the token to undo
            // the transfer.
            near_sdk::log!("Wrong amount");
            return PromiseOrValue::Value(amount.0.to_string());
        }
        if self.pending_buys.contains_key(&token_id) {
            near_sdk::log!("Buy already in progress");
            return PromiseOrValue::Value(amount.0.to_string());
        }

        self.pending_buys.insert(
            &token_id,
            &PendingBuy {
                buyer: sender_id.clone(),
                amount,
            },
        );

        let promise = ext_master_nft::ext(self.collection_id.clone())
            .with_static_gas(GAS_FOR_PAYOUT)
            .with_attached_deposit(ONE_YOCTONEAR)
            .nft_transfer_payout(
                sender_id.clone(),
                token_id.clone(),
                None,
                Some("sale".to_string()),
                amount,
                2,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_transfer_payout(sender_id, token_id, amount),
            );
        PromiseOrValue::Promise(promise)
    }

    /// Callback for `nft_transfer_payout`.
    ///
    /// `Ok(payout)` means the NFT moved in the same receipt. `Err` means the
    /// NFT leg failed: the buyer's USDC is kept here (returning `"0"` stops
    /// the token's automatic refund) and `recover` can refund it later.
    #[private]
    pub fn on_transfer_payout(
        &mut self,
        buyer: AccountId,
        token_id: String,
        amount: U128,
        #[callback_result] payout_result: Result<Payout, PromiseError>,
    ) -> String {
        let pending = self
            .pending_buys
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("No pending buy"));
        assert_eq!(pending.buyer, buyer, "Wrong buyer");
        assert_eq!(pending.amount, amount, "Wrong amount");

        let mut listing = self
            .listings
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Listing not active"));

        let payout = match payout_result {
            Ok(payout) => payout,
            Err(_) => {
                near_sdk::log!("NFT transfer failed; funds held for recover");
                emit_sonata(
                    "buy_failed",
                    serde_json::json!({
                        "token_id": token_id,
                        "buyer": buyer,
                        "amount": amount.0.to_string(),
                    }),
                );
                return "0".to_string();
            }
        };

        let seller = listing.seller.clone();
        let (creator, royalty, seller_amount) = split_payout(&payout, &seller, amount.0)
            .unwrap_or_else(|| env::panic_str("Invalid payout"));
        // The market never sets the royalty: enforce the collection's fixed
        // 500 bps. A creator that is also the seller gets the whole payout.
        if creator.is_some() {
            let (expected_royalty, expected_seller) = royalty_split(amount.0, self.royalty_bps);
            assert_eq!(royalty, expected_royalty, "Unexpected royalty");
            assert_eq!(seller_amount, expected_seller, "Unexpected seller amount");
        }

        if let Some(creator) = creator {
            if royalty > 0 {
                let _ = ext_fungible_token::ext(self.payment_token.clone())
                    .with_static_gas(GAS_FOR_FT_TRANSFER)
                    .with_attached_deposit(ONE_YOCTONEAR)
                    .ft_transfer(
                        creator,
                        U128(royalty),
                        Some(format!("royalty:{}", token_id)),
                    );
            }
        }
        let _ = ext_fungible_token::ext(self.payment_token.clone())
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .with_attached_deposit(ONE_YOCTONEAR)
            .ft_transfer(
                seller.clone(),
                U128(seller_amount),
                Some(format!("sale:{}", token_id)),
            );

        listing.active = false;
        self.listings.insert(&token_id, &listing);
        self.pending_buys.remove(&token_id);

        emit_sonata(
            "sale",
            serde_json::json!({
                "token_id": token_id,
                "seller": seller,
                "buyer": buyer,
                "price": amount.0.to_string(),
                "royalty": royalty.to_string(),
                "tx": env::block_height().to_string(),
            }),
        );
        "0".to_string()
    }

    /// Safety valve: the owner refunds a buyer whose NFT leg failed.
    pub fn recover(&mut self, token_id: String) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "Not the owner"
        );
        let pending = self
            .pending_buys
            .remove(&token_id)
            .unwrap_or_else(|| env::panic_str("No pending buy"));
        let _ = ext_fungible_token::ext(self.payment_token.clone())
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .with_attached_deposit(ONE_YOCTONEAR)
            .ft_transfer(
                pending.buyer.clone(),
                pending.amount,
                Some(format!("recover:{}", token_id)),
            );
        emit_sonata(
            "buy_recovered",
            serde_json::json!({
                "token_id": token_id,
                "buyer": pending.buyer,
                "amount": pending.amount.0.to_string(),
            }),
        );
    }
}
