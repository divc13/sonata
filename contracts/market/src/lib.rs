//! market: fixed-price resale for Sonata masters.
//!
//! The seller keeps the NFT until the sale. The market only holds the
//! seller's approval; at buy time it calls `nft_transfer_payout` (NFT first)
//! and distributes the buyer's USDC in the callback (money second). If the
//! NFT leg fails, the USDC stays here and the owner can refund the buyer
//! with `recover`.
//!
//! Money never leaves this contract except through `ft_transfer` on the
//! configured payment token.

mod listing;
mod sale;

#[cfg(test)]
mod tests;

use std::collections::HashMap;

use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::serde::Deserialize;
use near_sdk::{env, ext_contract, log, near, AccountId, Gas, NearToken, PanicOnDefault};
use serde_json::json;

pub type TokenId = String;

/// Fixed creator royalty, in basis points (5%). Immutable by design.
pub const ROYALTY_BPS: u16 = 500;
/// Basis-point denominator.
pub const BPS_DENOMINATOR: u128 = 10_000;
/// Minimum attached deposit for one listing, in yoctoNEAR (0.01 NEAR).
pub const LISTING_STORAGE: NearToken = NearToken::from_yoctonear(10_000_000_000_000_000_000_000);
/// One yoctoNEAR, required by NEP-171 transfers and NEP-141 `ft_transfer`.
pub const ONE_YOCTONEAR: NearToken = NearToken::from_yoctonear(1);

/// Sonata event standard and version.
pub const SONATA_STANDARD: &str = "sonata";
pub const SONATA_VERSION: &str = "1.0.0";

const GAS_FOR_STORAGE_DEPOSIT: Gas = Gas::from_tgas(10);
const GAS_FOR_NFT_TOKEN: Gas = Gas::from_tgas(10);
const GAS_FOR_PAYOUT: Gas = Gas::from_tgas(50);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(40);
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(25);

/// A listing kept in the market's own state.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Listing {
    pub seller: AccountId,
    pub price: U128,
    pub created_at: u64,
    pub active: bool,
}

/// A `list` call waiting on the ownership check.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct PendingListing {
    pub seller: AccountId,
    pub price: U128,
}

/// Buyer funds held while the NFT leg is in flight.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct PendingBuy {
    pub buyer: AccountId,
    pub amount: U128,
}

/// The slice of `master-nft.nft_token` the market reads.
#[derive(Deserialize, Debug, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct JsonToken {
    pub owner_id: AccountId,
    pub creator_id: AccountId,
}

/// NEP-199 payout returned by `nft_transfer_payout`.
#[derive(Deserialize, Debug, Clone, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[allow(dead_code)]
#[ext_contract(ext_master_nft)]
trait MasterNft {
    fn nft_token(&self, token_id: TokenId) -> Option<JsonToken>;
    fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: u32,
    ) -> Payout;
}

#[allow(dead_code)]
#[ext_contract(ext_fungible_token)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner_id: AccountId,
    pub collection_id: AccountId,
    pub payment_token: AccountId,
    /// Always 500: the market never lets anyone choose the royalty.
    pub royalty_bps: u16,
    pub listings: LookupMap<TokenId, Listing>,
    /// Enumeration order for `get_listings`.
    pub token_ids: UnorderedSet<TokenId>,
    /// `list` calls waiting on `on_listing_check`.
    pub pending_listings: LookupMap<TokenId, PendingListing>,
    /// `buy` calls waiting on `on_transfer_payout`.
    pub pending_buys: LookupMap<TokenId, PendingBuy>,
}

#[near]
impl Contract {
    /// Deploy-time setup. The attached NEAR registers this market account
    /// on the payment token; excess is refunded by `storage_deposit`.
    #[init]
    #[payable]
    pub fn new(owner_id: AccountId, collection_id: AccountId, payment_token: AccountId) -> Self {
        let market_id = env::current_account_id();
        let _ = ext_fungible_token::ext(payment_token.clone())
            .with_static_gas(GAS_FOR_STORAGE_DEPOSIT)
            .with_attached_deposit(env::attached_deposit())
            .storage_deposit(Some(market_id), Some(true));
        Self {
            owner_id,
            collection_id,
            payment_token,
            royalty_bps: ROYALTY_BPS,
            listings: LookupMap::new(b"l"),
            token_ids: UnorderedSet::new(b"t"),
            pending_listings: LookupMap::new(b"p"),
            pending_buys: LookupMap::new(b"b"),
        }
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    pub fn get_listing(&self, token_id: TokenId) -> Option<Listing> {
        self.listings.get(&token_id)
    }

    /// Listings in insertion order, paginated by `from_index` and `limit`.
    pub fn get_listings(&self, from_index: u64, limit: u64) -> Vec<(TokenId, Listing)> {
        self.token_ids
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .filter_map(|token_id| {
                let listing = self.listings.get(&token_id)?;
                Some((token_id, listing))
            })
            .collect()
    }
}

// ----------------------------------------------------------------------
// Internal helpers shared by the listing and sale modules
// ----------------------------------------------------------------------

pub(crate) fn now_secs() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

/// The 5% / 95% split. `royalty` is floored, so the seller never receives
/// less than the remainder and the two parts always sum to `amount`.
pub(crate) fn royalty_split(amount: u128, royalty_bps: u16) -> (u128, u128) {
    let royalty = amount
        .checked_mul(royalty_bps as u128)
        .expect("royalty overflow")
        / BPS_DENOMINATOR;
    (royalty, amount - royalty)
}

/// Turn the NEP-199 payout into `(creator, royalty, seller_amount)`.
///
/// The creator is the payout entry that is not the seller. When the creator
/// is the seller (single-entry payout), the whole amount goes to them.
pub(crate) fn split_payout(
    payout: &Payout,
    seller: &AccountId,
    amount: u128,
) -> Option<(Option<AccountId>, u128, u128)> {
    let mut total = 0u128;
    let mut seller_amount = 0u128;
    let mut creator: Option<AccountId> = None;
    for (account_id, value) in &payout.payout {
        total = total.checked_add(value.0)?;
        if account_id == seller {
            seller_amount = value.0;
        } else {
            creator = Some(account_id.clone());
        }
    }
    if total != amount || seller_amount == 0 {
        return None;
    }
    Some((creator, amount - seller_amount, seller_amount))
}

/// NEP-297 event emitter, same envelope as the core contracts.
pub(crate) fn emit_sonata(event: &str, data: serde_json::Value) {
    log!(
        "EVENT_JSON:{}",
        serde_json::to_string(&json!({
            "standard": SONATA_STANDARD,
            "version": SONATA_VERSION,
            "event": event,
            "data": data,
        }))
        .expect("event is serializable")
    );
}
