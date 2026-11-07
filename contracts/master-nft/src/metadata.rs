//! Token and contract metadata for the Sonata master collection, plus the
//! on-chain `Master` state and its JSON transport `JsonMaster`.

use std::collections::HashMap;

use near_sdk::json_types::Base64VecU8;
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

pub type TokenId = String;

/// NEP-171 contract metadata.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct NFTContractMetadata {
    /// Required, e.g. "nft-1.0.0".
    pub spec: String,
    /// Required, ex. "Sonata Masters".
    pub name: String,
    /// Required, ex. "SONG".
    pub symbol: String,
    /// Data URL.
    pub icon: Option<String>,
    /// Centralized gateway for `reference`/`media` URLs.
    pub base_uri: Option<String>,
    /// URL to a JSON file with more info.
    pub reference: Option<String>,
    /// Base64-encoded sha256 of the JSON at `reference`.
    pub reference_hash: Option<Base64VecU8>,
}

/// NEP-171 token metadata.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct TokenMetadata {
    /// Ex. "Midnight Drive".
    pub title: Option<String>,
    /// Free-form description.
    pub description: Option<String>,
    /// URL to the associated media.
    pub media: Option<String>,
    /// Base64-encoded sha256 of `media`.
    pub media_hash: Option<Base64VecU8>,
    /// Number of copies of this set in existence at mint time.
    pub copies: Option<u64>,
    /// Unix epoch milliseconds.
    pub issued_at: Option<u64>,
    pub expires_at: Option<u64>,
    pub starts_at: Option<u64>,
    pub updated_at: Option<u64>,
    /// Anything extra, e.g. stringified JSON.
    pub extra: Option<String>,
    /// URL to an off-chain JSON file with more info.
    pub reference: Option<String>,
    /// Base64-encoded sha256 of the JSON at `reference`.
    pub reference_hash: Option<Base64VecU8>,
}

/// Full on-chain state of one master.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Master {
    pub owner_id: AccountId,
    /// Account that minted the master; receives the 5% royalty forever.
    pub creator_id: AccountId,
    /// Keyless song-wallet account that holds the song's USDC.
    pub sub_account: AccountId,
    pub metadata: TokenMetadata,
    /// NEP-178 approvals: account -> approval id.
    pub approved_account_ids: HashMap<AccountId, u64>,
    /// Next approval id to hand out.
    pub next_approval_id: u64,
    /// Unix seconds.
    pub minted_at: u64,
    /// Unix seconds of the last transfer.
    pub last_transfer_at: u64,
    pub transfer_count: u32,
    /// Creator royalty in basis points (fixed at 500).
    pub royalty_bps: u16,
}

/// JSON transport returned by `nft_token` and friends.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct JsonMaster {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub creator_id: AccountId,
    pub sub_account: AccountId,
    pub metadata: TokenMetadata,
    pub approved_account_ids: HashMap<AccountId, u64>,
    pub royalty_bps: u16,
}

/// NEP-199 payout split for a sale.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

/// A fresh master with its identity fields filled in.
impl Master {
    pub fn new(
        owner_id: AccountId,
        creator_id: AccountId,
        sub_account: AccountId,
        metadata: TokenMetadata,
        now: u64,
        royalty_bps: u16,
    ) -> Self {
        Self {
            owner_id,
            creator_id,
            sub_account,
            metadata,
            approved_account_ids: HashMap::new(),
            next_approval_id: 0,
            minted_at: now,
            last_transfer_at: now,
            transfer_count: 0,
            royalty_bps,
        }
    }

    pub fn into_json(self, token_id: TokenId) -> JsonMaster {
        JsonMaster {
            token_id,
            owner_id: self.owner_id,
            creator_id: self.creator_id,
            sub_account: self.sub_account,
            metadata: self.metadata,
            approved_account_ids: self.approved_account_ids,
            royalty_bps: self.royalty_bps,
        }
    }
}
