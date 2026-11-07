//! Unit tests for the platform contract.
//!
//! Cross-contract promises cannot be executed in near-sdk unit tests, so the
//! settlement and withdrawal callbacks are driven directly with a mocked
//! `PromiseResult`. Everything before and after the async hop is real.

use std::collections::HashMap;

use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, get_logs, VMContextBuilder};
use near_sdk::testing_env;
use near_sdk::{test_vm_config, AccountId, NearToken, PromiseResult, RuntimeFeesConfig};

use crate::*;

const NOW: u64 = 1_700_000_000;
const PASS_PRICE: u128 = 5_000_000;
const PASS_DURATION: u64 = 2_592_000;
const RATE: u128 = 30_000;
const RESERVE_TARGET: u128 = 900_000_000;
const ONE_MONTH_RESERVE: u128 = 300_000_000;
const CONSTRUCTOR_DEPOSIT: u128 = 12_500_000_000_000_000_000_000;

fn platform_id() -> AccountId {
    "platform.sonata.testnet".parse().unwrap()
}

fn collection_id() -> AccountId {
    "masters.sonata.testnet".parse().unwrap()
}

fn usdc_id() -> AccountId {
    "usdc.sonata.testnet".parse().unwrap()
}

fn context(predecessor: AccountId, timestamp_secs: u64) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(platform_id())
        .predecessor_account_id(predecessor)
        .block_timestamp(timestamp_secs * 1_000_000_000);
    builder
}

fn new_contract() -> Contract {
    testing_env!(context(accounts(0), NOW)
        .attached_deposit(NearToken::from_yoctonear(CONSTRUCTOR_DEPOSIT))
        .build());
    Contract::new(
        accounts(0),
        accounts(1),
        collection_id(),
        usdc_id(),
        U128(PASS_PRICE),
        PASS_DURATION,
        U128(RATE),
        U128(RESERVE_TARGET),
        U128(ONE_MONTH_RESERVE),
    )
}

fn purchase(contract: &mut Contract, sender: AccountId, amount: u128, timestamp: u64) -> String {
    testing_env!(context(usdc_id(), timestamp).build());
    contract.ft_on_transfer(sender, U128(amount), "pass".to_string())
}

fn song_account(slug: &str) -> AccountId {
    format!("{slug}.{}", collection_id()).parse().unwrap()
}

fn register(contract: &mut Contract, token_id: &str, slug: &str) {
    testing_env!(context(collection_id(), NOW).build());
    contract.register_song(token_id.to_string(), song_account(slug));
}

fn entry(token_id: &str, seconds: u64) -> PayoutEntry {
    PayoutEntry {
        token_id: token_id.to_string(),
        seconds,
    }
}

fn mocked_balance(balance: u128) -> Vec<PromiseResult> {
    vec![PromiseResult::Successful(
        serde_json::to_vec(&U128(balance)).unwrap(),
    )]
}

/// Run the settlement callback with `balance` as the `ft_balance_of` result.
fn finish_settlement(contract: &mut Contract, balance: u128, timestamp: u64) {
    testing_env!(
        context(platform_id(), timestamp).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        HashMap::default(),
        mocked_balance(balance)
    );
    contract.on_epoch_balance();
}

/// Settle `entries` through the real `settle_epoch` entry point and callback,
/// with the default oracle.
fn settle(contract: &mut Contract, balance: u128, entries: Vec<PayoutEntry>, timestamp: u64) {
    settle_as(contract, accounts(1), balance, entries, timestamp);
}

/// Settle as a specific oracle.
fn settle_as(
    contract: &mut Contract,
    oracle: AccountId,
    balance: u128,
    entries: Vec<PayoutEntry>,
    timestamp: u64,
) {
    let epoch_id = contract.next_epoch_id;
    testing_env!(context(oracle, timestamp).build());
    contract.settle_epoch(epoch_id, entries, "ipfs://bafyroot".to_string());
    finish_settlement(contract, balance, timestamp);
}

fn events() -> Vec<String> {
    get_logs()
        .into_iter()
        .filter(|line| line.contains("EVENT_JSON:"))
        .collect()
}

fn has_event(name: &str) -> bool {
    events()
        .iter()
        .any(|line| line.contains(&format!("\"event\":\"{name}\"")))
}

fn two_songs(contract: &mut Contract) {
    register(contract, "alpha", "alpha");
    register(contract, "beta", "beta");
}

// ----------------------------------------------------------------------
// Constructor and metadata
// ----------------------------------------------------------------------

#[test]
fn new_stores_configuration_and_starts_epochs_at_one() {
    let contract = new_contract();
    let stats = contract.get_stats();
    assert_eq!(stats.balance, U128(0));
    assert_eq!(stats.reserve_target, U128(RESERVE_TARGET));
    assert_eq!(stats.one_month_reserve, U128(ONE_MONTH_RESERVE));
    assert_eq!(stats.rate_per_hour, U128(RATE));
    assert_eq!(stats.total_paid, U128(0));
    assert_eq!(stats.next_epoch_id, 1);
    assert_eq!(stats.subscription_price, U128(PASS_PRICE));
    assert!(!stats.paused);
    assert_eq!(stats.oracle_id, accounts(1));
    assert_eq!(contract.owner_id, accounts(0));
    assert_eq!(contract.collection_id, collection_id());
    assert_eq!(contract.payment_token, usdc_id());
    assert_eq!(contract.pass_duration_sec, PASS_DURATION);
    assert!(contract.get_epoch(1).is_none());
    assert!(contract.get_epochs(0, 10).is_empty());
}

#[test]
#[should_panic(expected = "Deposit too small")]
fn new_requires_storage_deposit() {
    testing_env!(context(accounts(0), NOW).build());
    Contract::new(
        accounts(0),
        accounts(1),
        collection_id(),
        usdc_id(),
        U128(PASS_PRICE),
        PASS_DURATION,
        U128(RATE),
        U128(RESERVE_TARGET),
        U128(ONE_MONTH_RESERVE),
    );
}

#[test]
fn nft_metadata_is_sonata_pass() {
    let contract = new_contract();
    let metadata = contract.nft_metadata();
    assert_eq!(metadata.spec, "nft-1.0.0");
    assert_eq!(metadata.name, "Sonata Pass");
    assert_eq!(metadata.symbol, "PASS");
}

#[test]
fn get_epochs_is_paginated() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    settle(
        &mut contract,
        1_000_000,
        vec![entry("alpha", 3600), entry("beta", 3600)],
        NOW,
    );
    settle(
        &mut contract,
        1_000_000,
        vec![entry("alpha", 1800), entry("beta", 1800)],
        NOW + 3600,
    );
    assert_eq!(contract.get_epochs(0, 10).len(), 2);
    assert_eq!(contract.get_epochs(1, 10).len(), 1);
    assert_eq!(contract.get_epochs(1, 10)[0].id, 2);
    assert_eq!(contract.get_epochs(5, 10).len(), 0);
}

// ----------------------------------------------------------------------
// Pass NFT
// ----------------------------------------------------------------------

#[test]
fn purchase_mints_a_pass() {
    let mut contract = new_contract();
    let result = purchase(&mut contract, accounts(2), PASS_PRICE, NOW);
    assert_eq!(result, "0");
    assert_eq!(contract.pass_expiry(accounts(2)), NOW + PASS_DURATION);
    assert!(contract.is_pass_active(accounts(2)));

    let pass = contract.nft_token("pass-1".to_string()).unwrap();
    assert_eq!(pass.token_id, "pass-1");
    assert_eq!(pass.owner_id, accounts(2));
    assert_eq!(pass.expires_at, NOW + PASS_DURATION);
    assert_eq!(pass.minted_at, NOW);
    assert_eq!(pass.renewed_count, 0);

    let owned = contract.nft_tokens_for_owner(accounts(2), None, None);
    assert_eq!(owned.len(), 1);
    assert_eq!(owned[0].token_id, "pass-1");

    assert!(has_event("pass_minted"));
    assert!(contract.get_stats().balance.0 >= PASS_PRICE);
}

#[test]
fn renewal_extends_from_the_current_expiry() {
    let mut contract = new_contract();
    purchase(&mut contract, accounts(2), PASS_PRICE, NOW);
    // Renew before expiry: the unused time is not lost.
    purchase(&mut contract, accounts(2), PASS_PRICE, NOW + 1_000);

    let pass = contract.nft_token("pass-1".to_string()).unwrap();
    assert_eq!(pass.expires_at, NOW + 2 * PASS_DURATION);
    assert_eq!(pass.renewed_count, 1);
    assert_eq!(pass.minted_at, NOW);
    assert_eq!(contract.next_pass_id, 2);
    assert!(has_event("pass_renewed"));
}

#[test]
fn renewal_after_expiry_starts_from_now() {
    let mut contract = new_contract();
    purchase(&mut contract, accounts(2), PASS_PRICE, NOW);
    let after = NOW + PASS_DURATION + 500;
    purchase(&mut contract, accounts(2), PASS_PRICE, after);

    let pass = contract.nft_token("pass-1".to_string()).unwrap();
    assert_eq!(pass.expires_at, after + PASS_DURATION);
    assert_eq!(pass.renewed_count, 1);
}

#[test]
fn insufficient_payment_is_refunded_and_mints_nothing() {
    let mut contract = new_contract();
    let result = purchase(&mut contract, accounts(2), PASS_PRICE - 1, NOW);
    assert_eq!(result, (PASS_PRICE - 1).to_string());
    assert_eq!(contract.pass_expiry(accounts(2)), 0);
    assert!(!contract.is_pass_active(accounts(2)));
    assert!(contract.nft_token("pass-1".to_string()).is_none());
}

#[test]
fn overpayment_is_also_refunded() {
    let mut contract = new_contract();
    let result = purchase(&mut contract, accounts(2), PASS_PRICE + 1, NOW);
    assert_eq!(result, (PASS_PRICE + 1).to_string());
    assert!(contract.nft_token("pass-1".to_string()).is_none());
}

#[test]
fn passes_are_per_account() {
    let mut contract = new_contract();
    purchase(&mut contract, accounts(2), PASS_PRICE, NOW);
    purchase(&mut contract, accounts(3), PASS_PRICE, NOW);
    assert_eq!(
        contract.nft_token("pass-1".to_string()).unwrap().owner_id,
        accounts(2)
    );
    assert_eq!(
        contract.nft_token("pass-2".to_string()).unwrap().owner_id,
        accounts(3)
    );
    assert_eq!(
        contract.nft_tokens_for_owner(accounts(2), None, None).len(),
        1
    );
    assert_eq!(
        contract.nft_tokens_for_owner(accounts(3), None, None).len(),
        1
    );
    assert!(contract
        .nft_tokens_for_owner(accounts(4), None, None)
        .is_empty());
}

#[test]
#[should_panic(expected = "Wrong payment token")]
fn purchase_from_a_non_token_account_panics() {
    let mut contract = new_contract();
    testing_env!(context(accounts(2), NOW).build());
    contract.ft_on_transfer(accounts(2), U128(PASS_PRICE), "pass".to_string());
}

#[test]
#[should_panic(expected = "Unsupported message")]
fn unsupported_message_panics() {
    let mut contract = new_contract();
    testing_env!(context(usdc_id(), NOW).build());
    contract.ft_on_transfer(accounts(2), U128(PASS_PRICE), "not-pass".to_string());
}

#[test]
#[should_panic(expected = "Paused")]
fn paused_blocks_purchase() {
    let mut contract = new_contract();
    testing_env!(context(accounts(0), NOW).build());
    contract.pause();
    purchase(&mut contract, accounts(2), PASS_PRICE, NOW);
}

#[test]
fn unpause_restores_purchase() {
    let mut contract = new_contract();
    testing_env!(context(accounts(0), NOW).build());
    contract.pause();
    contract.unpause();
    assert_eq!(purchase(&mut contract, accounts(2), PASS_PRICE, NOW), "0");
}

#[test]
#[should_panic(expected = "Pass is non-transferable")]
fn nft_transfer_always_panics() {
    let mut contract = new_contract();
    contract.nft_transfer(accounts(3), "pass-1".to_string(), None, None);
}

#[test]
#[should_panic(expected = "Pass is non-transferable")]
fn nft_transfer_call_always_panics() {
    let mut contract = new_contract();
    let _ = contract.nft_transfer_call(
        accounts(3),
        "pass-1".to_string(),
        None,
        None,
        "".to_string(),
    );
}

#[test]
#[should_panic(expected = "Pass is non-transferable")]
fn nft_approve_always_panics() {
    let mut contract = new_contract();
    contract.nft_approve("pass-1".to_string(), accounts(3), None);
}

// ----------------------------------------------------------------------
// Song registry
// ----------------------------------------------------------------------

#[test]
fn register_song_stores_the_account_and_is_idempotent() {
    let mut contract = new_contract();
    register(&mut contract, "midnight-drive", "midnight-drive");
    assert_eq!(
        contract.get_song_account("midnight-drive".to_string()),
        Some(song_account("midnight-drive"))
    );
    // Re-registering the same pair is fine (the mint may be retried).
    register(&mut contract, "midnight-drive", "midnight-drive");
    assert_eq!(
        contract.get_song_account("midnight-drive".to_string()),
        Some(song_account("midnight-drive"))
    );
}

#[test]
#[should_panic(expected = "Only collection")]
fn register_song_rejects_non_collection() {
    let mut contract = new_contract();
    testing_env!(context(accounts(3), NOW).build());
    contract.register_song("alpha".to_string(), song_account("alpha"));
}

#[test]
#[should_panic(expected = "Invalid song account")]
fn register_song_requires_the_collection_suffix() {
    let mut contract = new_contract();
    testing_env!(context(collection_id(), NOW).build());
    contract.register_song("alpha".to_string(), "alpha.other.testnet".parse().unwrap());
}

#[test]
#[should_panic(expected = "Song already registered")]
fn register_song_rejects_a_different_account_for_a_token() {
    let mut contract = new_contract();
    register(&mut contract, "alpha", "alpha");
    testing_env!(context(collection_id(), NOW).build());
    contract.register_song("alpha".to_string(), song_account("other-alpha"));
}

#[test]
#[should_panic(expected = "Cannot register song account")]
fn register_song_needs_near_for_storage() {
    let mut contract = new_contract();
    testing_env!(context(collection_id(), NOW)
        .account_balance(NearToken::from_yoctonear(1))
        .build());
    contract.register_song("alpha".to_string(), song_account("alpha"));
}

// ----------------------------------------------------------------------
// Pure payout math
// ----------------------------------------------------------------------

#[test]
fn effective_rate_is_the_minimum_of_rate_and_pro_rata_share() {
    // Plenty of money: pay the configured rate.
    assert_eq!(compute_effective_rate(RATE, 1_000_000, 3600), RATE);
    // Short balance: cap at balance * 3600 / total_seconds.
    assert_eq!(compute_effective_rate(RATE, 10_000, 7200), 5_000);
    assert_eq!(compute_effective_rate(RATE, 0, 3600), 0);
    // A zero-length epoch pays nothing.
    assert_eq!(compute_effective_rate(RATE, 1_000_000, 0), 0);
}

#[test]
fn payout_rounds_down() {
    assert_eq!(payout_for_seconds(RATE, 3600), RATE);
    assert_eq!(payout_for_seconds(RATE, 1800), RATE / 2);
    assert_eq!(payout_for_seconds(RATE, 1), 8);
    assert_eq!(payout_for_seconds(0, 3600), 0);
}

#[test]
fn settlement_mode_names_the_regime() {
    assert_eq!(settlement_mode(RATE, RATE), "constant");
    assert_eq!(settlement_mode(RATE, RATE - 1), "pro-rata");
}

#[test]
fn reserve_floor_is_the_larger_target() {
    assert!(reserve_ok(1_000, 100, 900, 300));
    assert!(reserve_ok(1_000, 100, 300, 900));
    // Leaves exactly the reserve: allowed.
    assert!(reserve_ok(1_000, 100, 900, 0));
    // Leaves one unit less than the reserve: rejected.
    assert!(!reserve_ok(1_000, 101, 900, 0));
    // Overdraft is never allowed, even with a zero reserve.
    assert!(!reserve_ok(100, 101, 0, 0));
}

#[test]
fn entries_must_be_strictly_sorted() {
    assert!(is_strictly_sorted(&[]));
    assert!(is_strictly_sorted(&[entry("a", 1)]));
    assert!(is_strictly_sorted(&[entry("a", 1), entry("b", 2)]));
    assert!(!is_strictly_sorted(&[entry("b", 1), entry("a", 2)]));
    assert!(!is_strictly_sorted(&[entry("a", 1), entry("a", 2)]));
}

// ----------------------------------------------------------------------
// Settlement
// ----------------------------------------------------------------------

#[test]
fn settle_epoch_pays_the_constant_rate() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    settle(
        &mut contract,
        100_000,
        vec![entry("alpha", 3600), entry("beta", 3600)],
        NOW,
    );

    let epoch = contract.get_epoch(1).unwrap();
    assert_eq!(epoch.id, 1);
    assert_eq!(epoch.balance_before, U128(100_000));
    assert_eq!(epoch.total_seconds, 7200);
    assert_eq!(epoch.effective_rate_per_hour, U128(RATE));
    assert_eq!(epoch.total_paid, U128(2 * RATE));
    assert_eq!(epoch.entries_count, 2);
    assert_eq!(epoch.mode, "constant");
    assert_eq!(epoch.listen_root, "ipfs://bafyroot");
    assert_eq!(epoch.started_at, NOW);
    assert_eq!(epoch.closed_at, NOW);

    let stats = contract.get_stats();
    assert_eq!(stats.next_epoch_id, 2);
    assert_eq!(stats.total_paid, U128(2 * RATE));
    assert_eq!(contract.next_epoch_id, 2);
    assert!(has_event("epoch_settled"));
    assert!(has_event("payout_sent"));
}

#[test]
fn settle_epoch_goes_pro_rata_when_short() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    // 10_000 across 7200 seconds caps the hourly rate at 5_000.
    settle(
        &mut contract,
        10_000,
        vec![entry("alpha", 3600), entry("beta", 3600)],
        NOW,
    );

    let epoch = contract.get_epoch(1).unwrap();
    assert_eq!(epoch.effective_rate_per_hour, U128(5_000));
    assert_eq!(epoch.total_paid, U128(10_000));
    assert_eq!(epoch.mode, "pro-rata");
    assert!(has_event("epoch_settled"));
}

#[test]
fn settle_epoch_with_zero_seconds_pays_nothing() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    settle(
        &mut contract,
        100_000,
        vec![entry("alpha", 0), entry("beta", 0)],
        NOW,
    );

    let epoch = contract.get_epoch(1).unwrap();
    assert_eq!(epoch.total_seconds, 0);
    assert_eq!(epoch.effective_rate_per_hour, U128(0));
    assert_eq!(epoch.total_paid, U128(0));
    assert_eq!(contract.get_stats().total_paid, U128(0));
}

#[test]
fn settle_epoch_with_empty_balance_pays_nothing() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    settle(
        &mut contract,
        0,
        vec![entry("alpha", 3600), entry("beta", 1800)],
        NOW,
    );
    let epoch = contract.get_epoch(1).unwrap();
    assert_eq!(epoch.effective_rate_per_hour, U128(0));
    assert_eq!(epoch.total_paid, U128(0));
    assert_eq!(epoch.mode, "pro-rata");
}

#[test]
fn settle_epoch_links_epochs_by_close_time() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    settle(
        &mut contract,
        100_000,
        vec![entry("alpha", 3600), entry("beta", 3600)],
        NOW,
    );
    settle(
        &mut contract,
        100_000,
        vec![entry("alpha", 1800), entry("beta", 1800)],
        NOW + 7200,
    );
    assert_eq!(contract.get_epoch(2).unwrap().started_at, NOW);
    assert_eq!(contract.get_epoch(2).unwrap().closed_at, NOW + 7200);
}

#[test]
#[should_panic(expected = "Only oracle")]
fn settle_epoch_is_oracle_only() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(3), NOW).build());
    contract.settle_epoch(1, vec![entry("alpha", 3600)], "root".to_string());
}

#[test]
#[should_panic(expected = "Epoch id mismatch")]
fn settle_epoch_rejects_a_stale_id() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(2, vec![entry("alpha", 3600)], "root".to_string());
}

#[test]
#[should_panic(expected = "Empty epoch")]
fn settle_epoch_rejects_empty_entries() {
    let mut contract = new_contract();
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(1, vec![], "root".to_string());
}

#[test]
#[should_panic(expected = "Unsorted entries")]
fn settle_epoch_rejects_unsorted_entries() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(
        1,
        vec![entry("beta", 3600), entry("alpha", 3600)],
        "root".to_string(),
    );
}

#[test]
#[should_panic(expected = "Unsorted entries")]
fn settle_epoch_rejects_duplicate_entries() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(
        1,
        vec![entry("alpha", 3600), entry("alpha", 3600)],
        "root".to_string(),
    );
}

#[test]
#[should_panic(expected = "Song not registered")]
fn settle_epoch_rejects_an_unregistered_song() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(1, vec![entry("gamma", 3600)], "root".to_string());
}

#[test]
#[should_panic(expected = "Paused")]
fn settle_epoch_is_blocked_while_paused() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(0), NOW).build());
    contract.pause();
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(1, vec![entry("alpha", 3600)], "root".to_string());
}

#[test]
#[should_panic(expected = "Settlement in progress")]
fn settle_epoch_refuses_a_second_pending_settlement() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(1, vec![entry("alpha", 3600)], "root".to_string());
    // The balance callback has not run yet: the guard must hold.
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(2, vec![entry("alpha", 3600)], "root".to_string());
}

#[test]
fn abort_settlement_clears_the_pending_guard() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(1, vec![entry("alpha", 3600)], "root".to_string());
    assert!(contract.pending_settlement.is_some());

    testing_env!(context(accounts(0), NOW).build());
    contract.abort_settlement();
    assert!(contract.pending_settlement.is_none());

    // The same epoch can now be settled again.
    settle(&mut contract, 100_000, vec![entry("alpha", 3600)], NOW);
    assert_eq!(contract.get_epoch(1).unwrap().total_paid, U128(RATE));
}

#[test]
#[should_panic(expected = "Only owner")]
fn abort_settlement_is_owner_only() {
    let mut contract = new_contract();
    testing_env!(context(accounts(3), NOW).build());
    contract.abort_settlement();
}

#[test]
#[should_panic(expected = "Balance check failed")]
fn settle_callback_panics_when_the_balance_read_fails() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(1), NOW).build());
    contract.settle_epoch(1, vec![entry("alpha", 3600)], "root".to_string());
    testing_env!(
        context(platform_id(), NOW).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        HashMap::default(),
        vec![PromiseResult::Failed]
    );
    contract.on_epoch_balance();
}

// ----------------------------------------------------------------------
// Treasury
// ----------------------------------------------------------------------

fn start_withdrawal(contract: &mut Contract, receiver: AccountId, amount: u128) {
    testing_env!(context(accounts(0), NOW).build());
    contract.withdraw_revenue(receiver, U128(amount));
}

fn finish_withdrawal(contract: &mut Contract, balance: u128) {
    testing_env!(
        context(platform_id(), NOW).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        HashMap::default(),
        mocked_balance(balance)
    );
    contract.on_withdraw_balance();
}

#[test]
fn withdraw_revenue_allows_the_exact_reserve_floor() {
    let mut contract = new_contract();
    start_withdrawal(&mut contract, accounts(4), 100_000_000);
    finish_withdrawal(&mut contract, 1_000_000_000);
    assert!(contract.pending_withdrawal.is_none());
    assert!(has_event("revenue_withdrawn"));
}

#[test]
#[should_panic(expected = "Reserve floor")]
fn withdraw_revenue_below_the_reserve_panics() {
    let mut contract = new_contract();
    start_withdrawal(&mut contract, accounts(4), 100_000_001);
    finish_withdrawal(&mut contract, 1_000_000_000);
}

#[test]
#[should_panic(expected = "Reserve floor")]
fn withdraw_revenue_above_the_balance_panics() {
    let mut contract = new_contract();
    start_withdrawal(&mut contract, accounts(4), 1_000);
    finish_withdrawal(&mut contract, 999);
}

#[test]
#[should_panic(expected = "Only owner")]
fn withdraw_revenue_is_owner_only() {
    let mut contract = new_contract();
    testing_env!(context(accounts(3), NOW).build());
    contract.withdraw_revenue(accounts(4), U128(1));
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn withdraw_revenue_requires_a_positive_amount() {
    let mut contract = new_contract();
    start_withdrawal(&mut contract, accounts(4), 0);
}

#[test]
#[should_panic(expected = "Withdrawal in progress")]
fn withdraw_revenue_refuses_a_second_pending_withdrawal() {
    let mut contract = new_contract();
    start_withdrawal(&mut contract, accounts(4), 1_000);
    start_withdrawal(&mut contract, accounts(4), 1_000);
}

#[test]
fn set_reserve_targets_updates_and_emits() {
    let mut contract = new_contract();
    testing_env!(context(accounts(0), NOW).build());
    contract.set_reserve_targets(U128(1), U128(2));
    let stats = contract.get_stats();
    assert_eq!(stats.reserve_target, U128(1));
    assert_eq!(stats.one_month_reserve, U128(2));
    assert!(has_event("reserve_targets_changed"));
}

#[test]
#[should_panic(expected = "Only owner")]
fn set_reserve_targets_is_owner_only() {
    let mut contract = new_contract();
    testing_env!(context(accounts(3), NOW).build());
    contract.set_reserve_targets(U128(1), U128(2));
}

#[test]
fn set_oracle_changes_who_may_settle() {
    let mut contract = new_contract();
    two_songs(&mut contract);
    testing_env!(context(accounts(0), NOW).build());
    contract.set_oracle(accounts(3));
    assert_eq!(contract.get_stats().oracle_id, accounts(3));

    // The new oracle succeeds.
    settle_as(
        &mut contract,
        accounts(3),
        100_000,
        vec![entry("alpha", 3600)],
        NOW,
    );
    assert_eq!(contract.get_epoch(1).unwrap().total_paid, U128(RATE));
}

#[test]
#[should_panic(expected = "Only owner")]
fn set_oracle_is_owner_only() {
    let mut contract = new_contract();
    testing_env!(context(accounts(3), NOW).build());
    contract.set_oracle(accounts(3));
}

#[test]
fn pause_and_unpause_toggle_the_flag() {
    let mut contract = new_contract();
    testing_env!(context(accounts(0), NOW).build());
    contract.pause();
    assert!(contract.get_stats().paused);
    contract.unpause();
    assert!(!contract.get_stats().paused);
}

#[test]
#[should_panic(expected = "Only owner")]
fn pause_is_owner_only() {
    let mut contract = new_contract();
    testing_env!(context(accounts(3), NOW).build());
    contract.pause();
}
