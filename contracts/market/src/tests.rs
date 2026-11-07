//! Unit tests. Cross-contract calls are exercised through their pure helpers
//! and by invoking the private callbacks directly; no sandbox involved.

use std::collections::HashMap;

use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken, PromiseError, PromiseOrValue};

use crate::{
    royalty_split, split_payout, Contract, JsonToken, Listing, Payout, PendingBuy, PendingListing,
    LISTING_STORAGE, ROYALTY_BPS,
};

const OWNER: usize = 0;
const COLLECTION: usize = 1;
const USDC: usize = 2;
const SELLER: usize = 3;
const BUYER: usize = 4;
const CREATOR: usize = 5;
// `accounts()` only exposes indices 0..=5; reuse the owner account as the
// market's own id in unit tests.
const MARKET: usize = 0;

fn context(predecessor: usize, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(accounts(MARKET))
        .predecessor_account_id(accounts(predecessor))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(1_700_000_000_000_000_000)
        .build());
}

fn market() -> Contract {
    context(OWNER, 10 * LISTING_STORAGE.as_yoctonear());
    Contract::new(accounts(OWNER), accounts(COLLECTION), accounts(USDC))
}

fn set_listing(market: &mut Contract, token_id: &str, seller: usize, price: u128, active: bool) {
    let listing = Listing {
        seller: accounts(seller),
        price: U128(price),
        created_at: 1_700_000_000,
        active,
    };
    market.listings.insert(&token_id.to_string(), &listing);
    market.token_ids.insert(&token_id.to_string());
}

fn set_pending_buy(market: &mut Contract, token_id: &str, buyer: usize, amount: u128) {
    market.pending_buys.insert(
        &token_id.to_string(),
        &PendingBuy {
            buyer: accounts(buyer),
            amount: U128(amount),
        },
    );
}

fn payout(entries: &[(usize, u128)]) -> Payout {
    Payout {
        payout: entries
            .iter()
            .map(|(account, amount)| (accounts(*account), U128(*amount)))
            .collect::<HashMap<_, _>>(),
    }
}

// ----------------------------------------------------------------------
// Constructor
// ----------------------------------------------------------------------

#[test]
fn constructor_stores_configuration_and_fixed_royalty() {
    let market = market();
    assert_eq!(market.owner_id, accounts(OWNER));
    assert_eq!(market.collection_id, accounts(COLLECTION));
    assert_eq!(market.payment_token, accounts(USDC));
    assert_eq!(market.royalty_bps, 500);
    assert_eq!(market.royalty_bps, ROYALTY_BPS);
    assert!(market.get_listing("t".into()).is_none());
    assert!(market.get_listings(0, 10).is_empty());
}

// ----------------------------------------------------------------------
// list
// ----------------------------------------------------------------------

#[test]
#[should_panic(expected = "Price must be positive")]
fn list_rejects_zero_price() {
    let mut market = market();
    context(SELLER, LISTING_STORAGE.as_yoctonear());
    market.list("t".into(), U128(0));
}

#[test]
#[should_panic(expected = "Requires at least 0.01 NEAR")]
fn list_requires_listing_storage() {
    let mut market = market();
    context(SELLER, LISTING_STORAGE.as_yoctonear() - 1);
    market.list("t".into(), U128(100));
}

#[test]
#[should_panic(expected = "Already listed")]
fn list_rejects_duplicate_active_listing() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, true);
    context(SELLER, LISTING_STORAGE.as_yoctonear());
    market.list("t".into(), U128(100));
}

#[test]
fn list_records_pending_seller_and_price() {
    let mut market = market();
    context(SELLER, LISTING_STORAGE.as_yoctonear());
    market.list("t".into(), U128(100));
    let pending = market.pending_listings.get(&"t".to_string()).unwrap();
    assert_eq!(pending.seller, accounts(SELLER));
    assert_eq!(pending.price, U128(100));
    // Not visible until the ownership callback runs.
    assert!(market.get_listing("t".into()).is_none());
}

#[test]
fn list_can_replace_an_inactive_listing() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, false);
    context(SELLER, LISTING_STORAGE.as_yoctonear());
    market.list("t".into(), U128(200));
    assert!(market.pending_listings.contains_key(&"t".to_string()));
}

#[test]
fn on_listing_check_activates_listing_for_the_owner() {
    let mut market = market();
    market.pending_listings.insert(
        &"t".to_string(),
        &PendingListing {
            seller: accounts(SELLER),
            price: U128(500),
        },
    );
    context(MARKET, 0);
    market.on_listing_check(
        "t".into(),
        Ok(Some(JsonToken {
            owner_id: accounts(SELLER),
            creator_id: accounts(CREATOR),
        })),
    );
    let listing = market.get_listing("t".into()).unwrap();
    assert_eq!(listing.seller, accounts(SELLER));
    assert_eq!(listing.price, U128(500));
    assert!(listing.active);
    assert_eq!(listing.created_at, 1_700_000_000);
    assert!(!market.pending_listings.contains_key(&"t".to_string()));
}

#[test]
#[should_panic(expected = "Not the owner")]
fn on_listing_check_rejects_non_owner() {
    let mut market = market();
    market.pending_listings.insert(
        &"t".to_string(),
        &PendingListing {
            seller: accounts(SELLER),
            price: U128(500),
        },
    );
    market.on_listing_check(
        "t".into(),
        Ok(Some(JsonToken {
            owner_id: accounts(BUYER),
            creator_id: accounts(CREATOR),
        })),
    );
}

// ----------------------------------------------------------------------
// cancel
// ----------------------------------------------------------------------

#[test]
#[should_panic(expected = "Not the seller")]
fn cancel_rejects_non_seller() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, true);
    context(BUYER, 0);
    market.cancel("t".into());
}

#[test]
#[should_panic(expected = "Listing not active")]
fn cancel_rejects_already_cancelled_listing() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, false);
    context(SELLER, 0);
    market.cancel("t".into());
}

#[test]
fn cancel_deactivates_listing_for_seller() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, true);
    context(SELLER, 0);
    market.cancel("t".into());
    assert!(!market.get_listing("t".into()).unwrap().active);
    assert!(near_sdk::test_utils::get_logs()
        .iter()
        .any(|line| line.contains("listing_cancelled")));
}

// ----------------------------------------------------------------------
// get_listings
// ----------------------------------------------------------------------

#[test]
fn get_listings_paginates_in_insertion_order() {
    let mut market = market();
    for (index, token) in ["a", "b", "c"].iter().enumerate() {
        set_listing(&mut market, token, SELLER, 100 + index as u128, true);
    }
    let all = market.get_listings(0, 10);
    assert_eq!(
        all.iter()
            .map(|(token, _)| token.as_str())
            .collect::<Vec<_>>(),
        vec!["a", "b", "c"]
    );
    let page = market.get_listings(1, 1);
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].0, "b");
    assert_eq!(page[0].1.price, U128(101));
}

// ----------------------------------------------------------------------
// buy validation
// ----------------------------------------------------------------------

#[test]
#[should_panic(expected = "Only the payment token")]
fn ft_on_transfer_rejects_other_callers() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, true);
    context(BUYER, 0);
    let _ = market.ft_on_transfer(accounts(BUYER), U128(100), "buy:t".into());
}

#[test]
#[should_panic(expected = "Listing not active")]
fn ft_on_transfer_rejects_missing_listing() {
    let mut market = market();
    context(USDC, 0);
    let _ = market.ft_on_transfer(accounts(BUYER), U128(100), "buy:t".into());
}

#[test]
#[should_panic(expected = "Listing not active")]
fn ft_on_transfer_rejects_cancelled_listing() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, false);
    context(USDC, 0);
    let _ = market.ft_on_transfer(accounts(BUYER), U128(100), "buy:t".into());
}

#[test]
fn ft_on_transfer_refunds_wrong_amount() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, true);
    context(USDC, 0);
    let result = market.ft_on_transfer(accounts(BUYER), U128(99), "buy:t".into());
    assert!(matches!(result, PromiseOrValue::Value(value) if value == "99"));
    assert!(!market.pending_buys.contains_key(&"t".to_string()));
}

#[test]
fn ft_on_transfer_refunds_unknown_message() {
    let mut market = market();
    context(USDC, 0);
    let result = market.ft_on_transfer(accounts(BUYER), U128(7), "hello".into());
    assert!(matches!(result, PromiseOrValue::Value(value) if value == "7"));
}

#[test]
fn ft_on_transfer_holds_buyer_funds_for_a_valid_buy() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, true);
    context(USDC, 0);
    let result = market.ft_on_transfer(accounts(BUYER), U128(100), "buy:t".into());
    assert!(matches!(result, PromiseOrValue::Promise(_)));
    let pending = market.pending_buys.get(&"t".to_string()).unwrap();
    assert_eq!(pending.buyer, accounts(BUYER));
    assert_eq!(pending.amount, U128(100));
    // Still active until the payout callback succeeds.
    assert!(market.get_listing("t".into()).unwrap().active);
}

// ----------------------------------------------------------------------
// royalty math + payout parsing
// ----------------------------------------------------------------------

#[test]
fn royalty_split_is_five_percent_floor() {
    let (royalty, seller) = royalty_split(50_000_000, ROYALTY_BPS);
    assert_eq!(royalty, 2_500_000);
    assert_eq!(seller, 47_500_000);
    assert_eq!(royalty + seller, 50_000_000);

    // Floors the royalty, never mints money.
    let (royalty, seller) = royalty_split(101, ROYALTY_BPS);
    assert_eq!(royalty, 5);
    assert_eq!(seller, 96);
    assert_eq!(royalty + seller, 101);
}

#[test]
fn split_payout_finds_creator_and_seller() {
    let payout = payout(&[(CREATOR, 5), (SELLER, 95)]);
    let (creator, royalty, seller_amount) = split_payout(&payout, &accounts(SELLER), 100).unwrap();
    assert_eq!(creator, Some(accounts(CREATOR)));
    assert_eq!(royalty, 5);
    assert_eq!(seller_amount, 95);
}

#[test]
fn split_payout_handles_creator_is_seller() {
    let payout = payout(&[(SELLER, 100)]);
    let (creator, royalty, seller_amount) = split_payout(&payout, &accounts(SELLER), 100).unwrap();
    assert_eq!(creator, None);
    assert_eq!(royalty, 0);
    assert_eq!(seller_amount, 100);
}

#[test]
fn split_payout_rejects_a_total_mismatch() {
    let payout = payout(&[(CREATOR, 5), (SELLER, 94)]);
    assert!(split_payout(&payout, &accounts(SELLER), 100).is_none());
}

// ----------------------------------------------------------------------
// payout callback
// ----------------------------------------------------------------------

#[test]
fn on_transfer_payout_completes_sale_and_clears_pending() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, true);
    set_pending_buy(&mut market, "t", BUYER, 100);
    context(MARKET, 0);
    let result = market.on_transfer_payout(
        accounts(BUYER),
        "t".into(),
        U128(100),
        Ok(payout(&[(CREATOR, 5), (SELLER, 95)])),
    );
    assert_eq!(result, "0");
    assert!(!market.get_listing("t".into()).unwrap().active);
    assert!(!market.pending_buys.contains_key(&"t".to_string()));
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs.iter().any(|line| line.contains("\"event\":\"sale\"")));
    assert!(logs.iter().any(|line| line.contains("\"royalty\":\"5\"")));
}

#[test]
fn on_transfer_payout_failure_keeps_pending_buy_for_recover() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, true);
    set_pending_buy(&mut market, "t", BUYER, 100);
    context(MARKET, 0);
    let result = market.on_transfer_payout(
        accounts(BUYER),
        "t".into(),
        U128(100),
        Err(PromiseError::Failed),
    );
    assert_eq!(result, "0");
    assert!(market.get_listing("t".into()).unwrap().active);
    assert!(market.pending_buys.contains_key(&"t".to_string()));
    assert!(near_sdk::test_utils::get_logs()
        .iter()
        .any(|line| line.contains("buy_failed")));
}

#[test]
#[should_panic(expected = "Wrong amount")]
fn on_transfer_payout_checks_the_recorded_amount() {
    let mut market = market();
    set_listing(&mut market, "t", SELLER, 100, true);
    set_pending_buy(&mut market, "t", BUYER, 100);
    market.on_transfer_payout(
        accounts(BUYER),
        "t".into(),
        U128(99),
        Ok(payout(&[(SELLER, 99)])),
    );
}

// ----------------------------------------------------------------------
// recover
// ----------------------------------------------------------------------

#[test]
fn recover_refunds_pending_buyer_and_clears_state() {
    let mut market = market();
    set_pending_buy(&mut market, "t", BUYER, 100);
    context(OWNER, 0);
    market.recover("t".into());
    assert!(!market.pending_buys.contains_key(&"t".to_string()));
    assert!(near_sdk::test_utils::get_logs()
        .iter()
        .any(|line| line.contains("buy_recovered")));
}

#[test]
#[should_panic(expected = "Not the owner")]
fn recover_rejects_non_owner() {
    let mut market = market();
    set_pending_buy(&mut market, "t", BUYER, 100);
    context(SELLER, 0);
    market.recover("t".into());
}

#[test]
#[should_panic(expected = "No pending buy")]
fn recover_rejects_missing_pending_buy() {
    let mut market = market();
    context(OWNER, 0);
    market.recover("t".into());
}
