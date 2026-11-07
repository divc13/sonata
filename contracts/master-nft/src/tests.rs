//! master-nft unit tests: mint rules, transfers, approvals, and NEP-199
//! payout math. Cross-contract flows are covered by integration tests.

use near_sdk::json_types::U128;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{accounts, get_created_receipts, VMContextBuilder};
use near_sdk::{testing_env, NearToken, RuntimeFeesConfig};
use std::collections::HashMap;

use crate::*;

const COLLECTION: &str = "masters.sonata.testnet";
const PLATFORM: &str = "platform.sonata.testnet";
const USDC: &str = "usdc.sonata.testnet";
const WALLET_HASH: [u8; 32] = [7u8; 32];
const MINT_DEPOSIT: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR

const CREATOR: usize = 0;
const OWNER: usize = 1;
const MARKET: usize = 2;
const BUYER: usize = 3;
const STRANGER: usize = 4;

fn metadata() -> NFTContractMetadata {
    NFTContractMetadata {
        spec: NFT_METADATA_SPEC.into(),
        name: "Sonata Masters".into(),
        symbol: "SONG".into(),
        icon: None,
        base_uri: None,
        reference: None,
        reference_hash: None,
    }
}

fn token_metadata() -> TokenMetadata {
    TokenMetadata {
        title: Some("Midnight Drive".into()),
        description: Some("A song".into()),
        media: Some("ipfs://audio".into()),
        media_hash: None,
        copies: Some(1),
        issued_at: None,
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: None,
        reference: None,
        reference_hash: None,
    }
}

fn set_context(predecessor: usize, attached_yocto: u128) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(COLLECTION.parse().unwrap())
        .predecessor_account_id(accounts(predecessor))
        .attached_deposit(NearToken::from_yoctonear(attached_yocto))
        .block_timestamp(1_700_000_000_000_000_000)
        .build());
}

fn contract() -> Contract {
    set_context(CREATOR, MINT_DEPOSIT);
    Contract::new(
        accounts(CREATOR),
        metadata(),
        PLATFORM.parse().unwrap(),
        USDC.parse().unwrap(),
        bs58::encode(WALLET_HASH).into_string(),
        U128(MINT_DEPOSIT),
    )
}

/// Mint the standard `midnight-drive` master owned by `owner`.
fn mint(contract: &mut Contract, owner: usize) {
    set_context(CREATOR, MINT_DEPOSIT);
    contract.nft_mint("midnight-drive".into(), token_metadata(), accounts(owner));
}

fn approve_market(contract: &mut Contract) {
    set_context(OWNER, 10_000_000_000_000_000_000_000); // 0.01 NEAR
    contract.nft_approve("midnight-drive".into(), accounts(MARKET), None);
}

#[test]
fn mint_stores_master_and_emits_events() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    let token = contract.nft_token("midnight-drive".into()).unwrap();
    assert_eq!(token.token_id, "midnight-drive");
    assert_eq!(token.owner_id, accounts(OWNER));
    assert_eq!(token.creator_id, accounts(CREATOR));
    assert_eq!(
        token.sub_account,
        "midnight-drive.masters.sonata.testnet"
            .parse::<AccountId>()
            .unwrap()
    );
    assert_eq!(token.royalty_bps, 500);
    assert!(token.approved_account_ids.is_empty());
    assert_eq!(contract.nft_total_supply(), U128(1));
    assert_eq!(contract.nft_supply_for_owner(accounts(OWNER)), U128(1));

    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|log| log.contains(r#""event":"nft_mint""#)
                && log.contains(r#""standard":"nep171""#))
    );
    assert!(logs
        .iter()
        .any(|log| log.contains(r#""event":"master_minted""#)
            && log.contains(r#""standard":"sonata""#)));
}

#[test]
fn mint_creates_keyless_sub_account_with_global_code() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    let sub: AccountId = "midnight-drive.masters.sonata.testnet".parse().unwrap();
    let receipts = get_created_receipts();
    let wallet_receipt = receipts
        .iter()
        .find(|receipt| receipt.receiver_id == sub)
        .expect("mint must create a receipt for the song account");
    assert!(wallet_receipt
        .actions
        .iter()
        .any(|action| matches!(action, MockAction::CreateAccount { .. })));
    assert!(wallet_receipt
        .actions
        .iter()
        .any(|action| matches!(action, MockAction::Transfer { .. })));
    assert!(wallet_receipt
        .actions
        .iter()
        .any(|action| matches!(action, MockAction::UseGlobalContract { .. })));
    assert!(wallet_receipt.actions.iter().any(|action| matches!(
        action,
        MockAction::FunctionCallWeight { method_name, .. } if method_name == b"new"
    )));
    // No access keys are ever added to a song account.
    assert!(!receipts
        .iter()
        .any(|receipt| receipt.actions.iter().any(|action| matches!(
            action,
            MockAction::AddKeyWithFullAccess { .. } | MockAction::AddKeyWithFunctionCall { .. }
        ))));
    // The platform registration is chained after the wallet init.
    let platform: AccountId = PLATFORM.parse().unwrap();
    let platform_receipt = receipts
        .iter()
        .find(|receipt| {
            receipt.receiver_id == platform
                && receipt.actions.iter().any(|action| matches!(
                    action,
                    MockAction::FunctionCallWeight { method_name, .. } if method_name == b"register_song"
                ))
        })
        .expect("mint must call platform.register_song");
    assert!(!platform_receipt.receipt_indices.is_empty());
}

#[test]
#[should_panic(expected = "Token already exists")]
fn mint_rejects_duplicate_token() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    mint(&mut contract, OWNER);
}

#[test]
#[should_panic(expected = "Invalid token id")]
fn mint_rejects_uppercase_slug() {
    let mut contract = contract();
    set_context(CREATOR, MINT_DEPOSIT);
    contract.nft_mint("Midnight-Drive".into(), token_metadata(), accounts(OWNER));
}

#[test]
#[should_panic(expected = "Invalid token id")]
fn mint_rejects_short_slug() {
    let mut contract = contract();
    set_context(CREATOR, MINT_DEPOSIT);
    contract.nft_mint("ab".into(), token_metadata(), accounts(OWNER));
}

#[test]
#[should_panic(expected = "Invalid token id")]
fn mint_rejects_reserved_slug() {
    let mut contract = contract();
    set_context(CREATOR, MINT_DEPOSIT);
    contract.nft_mint("platform".into(), token_metadata(), accounts(OWNER));
}

#[test]
#[should_panic(expected = "Invalid token id")]
fn mint_rejects_slug_with_underscore() {
    let mut contract = contract();
    set_context(CREATOR, MINT_DEPOSIT);
    contract.nft_mint("midnight_drive".into(), token_metadata(), accounts(OWNER));
}

#[test]
#[should_panic(expected = "Invalid token id")]
fn mint_rejects_leading_hyphen() {
    let mut contract = contract();
    set_context(CREATOR, MINT_DEPOSIT);
    contract.nft_mint("-midnight".into(), token_metadata(), accounts(OWNER));
}

#[test]
#[should_panic(expected = "Deposit too small")]
fn mint_rejects_small_deposit() {
    let mut contract = contract();
    set_context(CREATOR, 1);
    contract.nft_mint("midnight-drive".into(), token_metadata(), accounts(OWNER));
}

#[test]
fn transfer_updates_owner_and_clears_approvals() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    approve_market(&mut contract);
    assert!(contract.nft_is_approved("midnight-drive".into(), accounts(MARKET), Some(0)));

    set_context(OWNER, 1);
    contract.nft_transfer(
        accounts(BUYER),
        "midnight-drive".into(),
        Some(0),
        Some("sale".into()),
    );

    let token = contract.nft_token("midnight-drive".into()).unwrap();
    assert_eq!(token.owner_id, accounts(BUYER));
    assert!(token.approved_account_ids.is_empty());
    assert_eq!(contract.nft_supply_for_owner(accounts(OWNER)), U128(0));
    assert_eq!(contract.nft_supply_for_owner(accounts(BUYER)), U128(1));
    // Counters move on transfer.
    let master = contract
        .tokens_by_id
        .get(&"midnight-drive".to_string())
        .unwrap();
    assert_eq!(master.transfer_count, 1);
    assert_eq!(master.last_transfer_at, 1_700_000_000);
}

#[test]
#[should_panic(expected = "Not approved")]
fn transfer_by_stranger_fails() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    set_context(STRANGER, 1);
    contract.nft_transfer(accounts(STRANGER), "midnight-drive".into(), None, None);
}

#[test]
#[should_panic(expected = "The actual approval_id is different")]
fn transfer_with_wrong_approval_id_fails() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    approve_market(&mut contract);
    set_context(MARKET, 1);
    contract.nft_transfer(accounts(BUYER), "midnight-drive".into(), Some(99), None);
}

#[test]
fn payout_splits_five_percent_to_creator() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    let payout = contract.nft_payout("midnight-drive".into(), U128(50_000_000), 2);
    assert_eq!(payout.payout.len(), 2);
    assert_eq!(
        payout.payout.get(&accounts(CREATOR)),
        Some(&U128(2_500_000))
    );
    assert_eq!(payout.payout.get(&accounts(OWNER)), Some(&U128(47_500_000)));
    // Royalty + seller proceeds equal the sale price.
    let total: u128 = payout.payout.values().map(|amount| amount.0).sum();
    assert_eq!(total, 50_000_000);
}

#[test]
fn payout_collapses_when_creator_is_owner() {
    let mut contract = contract();
    mint(&mut contract, CREATOR);
    let payout = contract.nft_payout("midnight-drive".into(), U128(50_000_000), 1);
    assert_eq!(payout.payout.len(), 1);
    assert_eq!(
        payout.payout.get(&accounts(CREATOR)),
        Some(&U128(50_000_000))
    );
}

#[test]
fn payout_rounds_royalty_down() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    // 1 micro-USDC: 5% floors to zero, the owner gets everything.
    let payout = contract.nft_payout("midnight-drive".into(), U128(1), 2);
    assert_eq!(payout.payout.len(), 1);
    assert_eq!(payout.payout.get(&accounts(OWNER)), Some(&U128(1)));
    // 19 micro-USDC: 5% = 0.95 -> 0.
    let payout = contract.nft_payout("midnight-drive".into(), U128(19), 2);
    assert_eq!(payout.payout.get(&accounts(OWNER)), Some(&U128(19)));
    // 20 micro-USDC: 5% = 1.
    let payout = contract.nft_payout("midnight-drive".into(), U128(20), 2);
    assert_eq!(payout.payout.get(&accounts(CREATOR)), Some(&U128(1)));
    assert_eq!(payout.payout.get(&accounts(OWNER)), Some(&U128(19)));
}

#[test]
#[should_panic(expected = "Max len payout too small")]
fn payout_respects_max_len() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    contract.nft_payout("midnight-drive".into(), U128(50_000_000), 1);
}

#[test]
fn transfer_payout_moves_token_and_returns_split() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    approve_market(&mut contract);

    set_context(MARKET, 1);
    let payout = contract.nft_transfer_payout(
        accounts(BUYER),
        "midnight-drive".into(),
        Some(0),
        Some("sale".into()),
        U128(50_000_000),
        2,
    );
    assert_eq!(
        payout.payout.get(&accounts(CREATOR)),
        Some(&U128(2_500_000))
    );
    // The seller is the previous owner, not the buyer.
    assert_eq!(payout.payout.get(&accounts(OWNER)), Some(&U128(47_500_000)));
    let token = contract.nft_token("midnight-drive".into()).unwrap();
    assert_eq!(token.owner_id, accounts(BUYER));
    assert!(token.approved_account_ids.is_empty());
}

#[test]
fn transfer_call_returns_token_when_receiver_asks() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    set_context(OWNER, 1);
    contract.nft_transfer_call(
        accounts(MARKET),
        "midnight-drive".into(),
        None,
        None,
        "escrow".into(),
    );
    assert_eq!(
        contract
            .nft_token("midnight-drive".into())
            .unwrap()
            .owner_id,
        accounts(MARKET)
    );

    // Receiver returned `true`: return the token to the previous owner.
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(COLLECTION.parse().unwrap())
            .predecessor_account_id(COLLECTION.parse().unwrap())
            .build(),
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        HashMap::default(),
        vec![near_sdk::PromiseResult::Successful(
            serde_json::to_vec(&true).unwrap()
        )]
    );
    let kept = contract.nft_resolve_transfer(
        None,
        accounts(OWNER),
        accounts(MARKET),
        "midnight-drive".into(),
        HashMap::new(),
        None,
    );
    assert!(!kept);
    assert_eq!(
        contract
            .nft_token("midnight-drive".into())
            .unwrap()
            .owner_id,
        accounts(OWNER)
    );
}

#[test]
fn transfer_call_keeps_token_when_receiver_accepts() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    set_context(OWNER, 1);
    contract.nft_transfer_call(
        accounts(MARKET),
        "midnight-drive".into(),
        None,
        None,
        "escrow".into(),
    );
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(COLLECTION.parse().unwrap())
            .predecessor_account_id(COLLECTION.parse().unwrap())
            .build(),
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        HashMap::default(),
        vec![near_sdk::PromiseResult::Successful(
            serde_json::to_vec(&false).unwrap()
        )]
    );
    let kept = contract.nft_resolve_transfer(
        None,
        accounts(OWNER),
        accounts(MARKET),
        "midnight-drive".into(),
        HashMap::new(),
        None,
    );
    assert!(kept);
    assert_eq!(
        contract
            .nft_token("midnight-drive".into())
            .unwrap()
            .owner_id,
        accounts(MARKET)
    );
}

#[test]
fn enumeration_views_paginate() {
    let mut contract = contract();
    mint(&mut contract, OWNER);
    set_context(CREATOR, MINT_DEPOSIT);
    contract.nft_mint("paper-moons".into(), token_metadata(), accounts(OWNER));
    set_context(CREATOR, MINT_DEPOSIT);
    contract.nft_mint("third-song".into(), token_metadata(), accounts(BUYER));

    assert_eq!(contract.nft_total_supply(), U128(3));
    assert_eq!(contract.nft_tokens(None, None).len(), 3);
    assert_eq!(contract.nft_tokens(Some(U128(1)), Some(1)).len(), 1);
    assert_eq!(contract.nft_supply_for_owner(accounts(OWNER)), U128(2));
    assert_eq!(
        contract
            .nft_tokens_for_owner(accounts(OWNER), None, None)
            .len(),
        2
    );
    assert_eq!(
        contract
            .nft_tokens_for_owner(accounts(STRANGER), None, None)
            .len(),
        0
    );
}
