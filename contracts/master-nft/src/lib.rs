//! master-nft: the Sonata NEP-171 master collection.
//!
//! Each master is a song. Minting a master creates a keyless `song-wallet`
//! sub-account (global immutable code) that receives the song's USDC
//! earnings and pays only the current NFT owner. The collection exposes
//! NEP-171 transfers, NEP-178 approvals, and a fixed 5% creator royalty via
//! NEP-199 payouts.
//!
//! Money never moves through this contract: transfers only change ownership.

mod approval;
mod enumeration;
mod events;
mod internal;
mod metadata;
mod mint;
mod nft_core;
mod payout;

#[cfg(test)]
mod tests;

pub use crate::events::{EventLog, EventLogVariant, NftMintLog, NftTransferLog};
pub use crate::metadata::*;

use near_sdk::collections::{LazyOption, LookupMap, UnorderedMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::{
    env, ext_contract, log, near, AccountId, CryptoHash, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};

use crate::internal::*;

/// NEP-171 metadata schema version.
pub const NFT_METADATA_SPEC: &str = "nft-1.0.0";
/// NEP-171 standard name used in event logs.
pub const NFT_STANDARD_NAME: &str = "nep171";
/// Sonata event standard and version.
pub const SONATA_STANDARD: &str = "sonata";
pub const SONATA_VERSION: &str = "1.0.0";

/// Fixed creator royalty: 500 bps = 5%.
pub const DEFAULT_ROYALTY_BPS: u16 = 500;
/// Basis-point denominator.
pub const BPS_DENOMINATOR: u128 = 10_000;

/// Gas for the `song-wallet.new` call inside the account-creation batch.
pub const GAS_FOR_WALLET_INIT: Gas = Gas::from_tgas(30);
/// Gas for `platform.register_song`.
pub const GAS_FOR_PLATFORM_REGISTER: Gas = Gas::from_tgas(20);
/// NEAR transferred to the new song account (0.05 NEAR storage).
pub const STORAGE_FOR_SONG_ACCOUNT: NearToken =
    NearToken::from_yoctonear(50_000_000_000_000_000_000_000);

/// Slugs that would collide with infrastructure account names.
pub const RESERVED_SLUGS: [&str; 6] = ["platform", "market", "usdc", "oracle", "masters", "admin"];

/// The mint-time slice of the platform contract that the collection uses.
#[ext_contract(ext_platform)]
#[allow(dead_code)]
trait Platform {
    /// Register `song_account` as the payout account for `token_id` on the
    /// payment token. The platform also registers it on USDC.
    fn register_song(&mut self, token_id: TokenId, song_account: AccountId);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// Admin of this collection.
    pub owner_id: AccountId,
    /// This contract's own account (`env::current_account_id()` at init).
    pub collection_id: AccountId,
    /// Platform contract that registers song accounts for payouts.
    pub platform_id: AccountId,
    /// USDC-like payment token account (stored for the song wallets).
    pub payment_token: AccountId,
    /// sha256 of the immutable `song-wallet` wasm, deployed globally.
    pub song_wallet_code_hash: CryptoHash,
    /// Minimum attached deposit for `nft_mint`, in yoctoNEAR.
    pub mint_deposit: U128,
    /// Collection metadata.
    pub metadata: LazyOption<NFTContractMetadata>,
    /// Master state by token id.
    pub tokens_by_id: UnorderedMap<TokenId, Master>,
    /// Number of minted masters.
    pub token_supply: u64,
    /// Token ids per owner, for enumeration.
    pub tokens_per_owner: LookupMap<AccountId, UnorderedSet<TokenId>>,
}

/// Storage prefixes for the persistent collections.
#[derive(near_sdk::borsh::BorshSerialize, near_sdk::BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    Metadata,
    TokensById,
    TokensPerOwner,
    TokensPerOwnerInner { account_id_hash: CryptoHash },
}

/// Contract configuration view.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Config {
    pub owner_id: AccountId,
    pub collection_id: AccountId,
    pub platform_id: AccountId,
    pub payment_token: AccountId,
    /// Base58-encoded sha256 of the song-wallet wasm.
    pub song_wallet_code_hash: String,
    pub mint_deposit: U128,
    pub token_supply: u64,
    pub royalty_bps: u16,
}

#[near]
impl Contract {
    /// Create the collection.
    ///
    /// `song_wallet_code_hash` is the base58-encoded sha256 of the
    /// `song-wallet` wasm deployed as a global contract. The deploy script
    /// captures it after `near contract deploy-as-global`.
    #[init]
    pub fn new(
        owner_id: AccountId,
        metadata: NFTContractMetadata,
        platform_id: AccountId,
        payment_token: AccountId,
        song_wallet_code_hash: String,
        mint_deposit: U128,
    ) -> Self {
        assert!(mint_deposit.0 > 0, "Deposit too small");
        let code_hash = parse_code_hash(&song_wallet_code_hash);
        Self {
            owner_id,
            collection_id: env::current_account_id(),
            platform_id,
            payment_token,
            song_wallet_code_hash: code_hash,
            mint_deposit,
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            tokens_by_id: UnorderedMap::new(StorageKey::TokensById),
            token_supply: 0,
            tokens_per_owner: LookupMap::new(StorageKey::TokensPerOwner),
        }
    }

    // ------------------------------------------------------------------
    // Admin (owner only)
    // ------------------------------------------------------------------

    /// Point mint-time song registration at a different platform. Needed
    /// when the collection is deployed before the platform contract.
    pub fn set_platform(&mut self, platform_id: AccountId) {
        self.assert_owner();
        self.platform_id = platform_id.clone();
        events::emit_platform_set(&platform_id);
    }

    /// Change the global song-wallet code hash for future mints.
    pub fn set_song_wallet_code_hash(&mut self, hash: CryptoHash) {
        self.assert_owner();
        self.song_wallet_code_hash = hash;
        events::emit_song_wallet_code_hash_set(&bs58::encode(hash).into_string());
    }

    /// Change the mint deposit for future mints.
    pub fn set_mint_deposit(&mut self, amount: U128) {
        self.assert_owner();
        assert!(amount.0 > 0, "Deposit too small");
        self.mint_deposit = amount;
        events::emit_mint_deposit_set(amount);
    }

    pub fn get_config(&self) -> Config {
        Config {
            owner_id: self.owner_id.clone(),
            collection_id: self.collection_id.clone(),
            platform_id: self.platform_id.clone(),
            payment_token: self.payment_token.clone(),
            song_wallet_code_hash: bs58::encode(self.song_wallet_code_hash).into_string(),
            mint_deposit: self.mint_deposit,
            token_supply: self.token_supply,
            royalty_bps: DEFAULT_ROYALTY_BPS,
        }
    }

    fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "Only owner");
    }
}

/// Decode the base58 code hash accepted by `new` and the deploy script.
pub fn parse_code_hash(value: &str) -> CryptoHash {
    let bytes = bs58::decode(value)
        .into_vec()
        .unwrap_or_else(|_| env::panic_str("Invalid song wallet code hash"));
    let hash: CryptoHash = bytes
        .try_into()
        .unwrap_or_else(|_| env::panic_str("Invalid song wallet code hash"));
    hash
}

#[cfg(test)]
mod config_tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

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

    fn contract() -> Contract {
        testing_env!(VMContextBuilder::new()
            .current_account_id("masters.sonata.testnet".parse::<AccountId>().unwrap())
            .predecessor_account_id(accounts(0))
            .build());
        Contract::new(
            accounts(0),
            metadata(),
            "platform.sonata.testnet".parse::<AccountId>().unwrap(),
            "usdc.sonata.testnet".parse::<AccountId>().unwrap(),
            bs58::encode([7u8; 32]).into_string(),
            U128(100_000_000_000_000_000_000_000),
        )
    }

    #[test]
    fn new_reads_config_and_parses_hash() {
        let contract = contract();
        let config = contract.get_config();
        assert_eq!(
            config.collection_id,
            "masters.sonata.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(
            config.platform_id,
            "platform.sonata.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(
            config.payment_token,
            "usdc.sonata.testnet".parse::<AccountId>().unwrap()
        );
        assert_eq!(
            config.song_wallet_code_hash,
            bs58::encode([7u8; 32]).into_string()
        );
        assert_eq!(config.royalty_bps, 500);
        assert_eq!(config.token_supply, 0);
    }

    #[test]
    #[should_panic(expected = "Invalid song wallet code hash")]
    fn new_rejects_bad_code_hash() {
        testing_env!(VMContextBuilder::new().build());
        Contract::new(
            accounts(0),
            metadata(),
            accounts(1),
            accounts(2),
            "not-a-hash".to_string(),
            U128(1),
        );
    }

    #[test]
    fn set_platform_is_owner_only_and_emits_event() {
        let mut contract = contract();
        testing_env!(VMContextBuilder::new()
            .current_account_id("masters.sonata.testnet".parse::<AccountId>().unwrap())
            .predecessor_account_id(accounts(0))
            .build());
        contract.set_platform("new-platform.sonata.testnet".parse::<AccountId>().unwrap());
        assert_eq!(
            contract.get_config().platform_id,
            "new-platform.sonata.testnet".parse::<AccountId>().unwrap()
        );
        assert!(near_sdk::test_utils::get_logs()
            .iter()
            .any(|log| log.contains("platform_set")));
    }

    #[test]
    #[should_panic(expected = "Only owner")]
    fn set_platform_rejects_non_owner() {
        let mut contract = contract();
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(3))
            .build());
        contract.set_platform(accounts(1));
    }
}
