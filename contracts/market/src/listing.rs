//! Listing: seller-only, ownership checked against the collection before the
//! listing becomes active.

use near_sdk::json_types::U128;
use near_sdk::{env, near, Gas, PromiseError};

use crate::{
    emit_sonata, ext_master_nft, now_secs, Contract, ContractExt, JsonToken, Listing,
    PendingListing, GAS_FOR_NFT_TOKEN, LISTING_STORAGE,
};

#[near]
impl Contract {
    /// Put a master up for sale. The attached deposit is kept as storage for
    /// the listing; the ownership check is a callback, so the listing only
    /// becomes visible once the collection agrees the seller owns the token.
    #[payable]
    pub fn list(&mut self, token_id: String, price: U128) {
        assert!(price.0 > 0, "Price must be positive");
        assert!(
            env::attached_deposit() >= LISTING_STORAGE,
            "Requires at least 0.01 NEAR for storage"
        );
        if let Some(listing) = self.listings.get(&token_id) {
            assert!(!listing.active, "Already listed");
        }
        let seller = env::predecessor_account_id();
        self.pending_listings.insert(
            &token_id,
            &PendingListing {
                seller: seller.clone(),
                price,
            },
        );
        let _ = ext_master_nft::ext(self.collection_id.clone())
            .with_static_gas(GAS_FOR_NFT_TOKEN)
            .nft_token(token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(15))
                    .on_listing_check(token_id),
            );
    }

    /// Callback for `list`. Verifies the seller is still the owner.
    #[private]
    pub fn on_listing_check(
        &mut self,
        token_id: String,
        #[callback_result] token_result: Result<Option<JsonToken>, PromiseError>,
    ) {
        let pending = self
            .pending_listings
            .remove(&token_id)
            .unwrap_or_else(|| env::panic_str("No pending listing"));
        let token = token_result.unwrap_or_else(|_| env::panic_str("Token lookup failed"));
        let token = token.unwrap_or_else(|| env::panic_str("No token"));
        assert_eq!(token.owner_id, pending.seller, "Not the owner");

        let listing = Listing {
            seller: pending.seller.clone(),
            price: pending.price,
            created_at: now_secs(),
            active: true,
        };
        self.listings.insert(&token_id, &listing);
        self.token_ids.insert(&token_id);
        emit_sonata(
            "listing_created",
            serde_json::json!({
                "token_id": token_id,
                "seller": pending.seller,
                "price": pending.price.0.to_string(),
            }),
        );
    }

    /// Take a listing down. Only the seller may cancel, and the listing must
    /// still be active. The storage deposit stays with the market because the
    /// listing record is kept for history.
    pub fn cancel(&mut self, token_id: String) {
        let mut listing = self
            .listings
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Listing not active"));
        assert_eq!(
            listing.seller,
            env::predecessor_account_id(),
            "Not the seller"
        );
        assert!(listing.active, "Listing not active");
        listing.active = false;
        self.listings.insert(&token_id, &listing);
        emit_sonata(
            "listing_cancelled",
            serde_json::json!({
                "token_id": token_id,
                "seller": listing.seller,
            }),
        );
    }
}
