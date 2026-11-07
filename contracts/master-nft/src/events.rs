//! NEP-171 event logs plus Sonata NEP-297 events.
//!
//! Every state change emits a standard `nep171` event for wallet/indexer
//! compatibility and a `sonata` event that carries the fields the Sonata
//! indexer needs (`creator_id`, `sub_account`, ...).

use std::fmt;

use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, log, AccountId};
use serde_json::json;

use crate::{SONATA_STANDARD, SONATA_VERSION};

/// NEP-171 event payload.
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "event", content = "data")]
#[serde(rename_all = "snake_case")]
#[serde(crate = "near_sdk::serde")]
#[non_exhaustive]
pub enum EventLogVariant {
    NftMint(Vec<NftMintLog>),
    NftTransfer(Vec<NftTransferLog>),
}

/// NEP-297 event envelope.
#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct EventLog {
    pub standard: String,
    pub version: String,
    #[serde(flatten)]
    pub event: EventLogVariant,
}

impl fmt::Display for EventLog {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_fmt(format_args!(
            "EVENT_JSON:{}",
            serde_json::to_string(self).map_err(|_| fmt::Error)?
        ))
    }
}

/// NEP-171 mint payload.
#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct NftMintLog {
    pub owner_id: String,
    pub token_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memo: Option<String>,
}

/// NEP-171 transfer payload.
#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct NftTransferLog {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authorized_id: Option<String>,
    pub old_owner_id: String,
    pub new_owner_id: String,
    pub token_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memo: Option<String>,
}

/// Emit the standard NEP-171 mint event.
pub fn emit_nft_mint(owner_id: &AccountId, token_id: &str, memo: Option<String>) {
    let event = EventLog {
        standard: crate::NFT_STANDARD_NAME.to_string(),
        version: crate::NFT_METADATA_SPEC.to_string(),
        event: EventLogVariant::NftMint(vec![NftMintLog {
            owner_id: owner_id.to_string(),
            token_ids: vec![token_id.to_string()],
            memo,
        }]),
    };
    env::log_str(&event.to_string());
}

/// Emit the standard NEP-171 transfer event.
pub fn emit_nft_transfer(
    authorized_id: Option<String>,
    old_owner_id: &AccountId,
    new_owner_id: &AccountId,
    token_id: &str,
    memo: Option<String>,
) {
    let event = EventLog {
        standard: crate::NFT_STANDARD_NAME.to_string(),
        version: crate::NFT_METADATA_SPEC.to_string(),
        event: EventLogVariant::NftTransfer(vec![NftTransferLog {
            authorized_id,
            old_owner_id: old_owner_id.to_string(),
            new_owner_id: new_owner_id.to_string(),
            token_ids: vec![token_id.to_string()],
            memo,
        }]),
    };
    env::log_str(&event.to_string());
}

/// Emit a Sonata NEP-297 event.
pub fn emit_sonata(event: &str, data: serde_json::Value) {
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

/// Sonata: a master was minted and its song account created.
pub fn emit_master_minted(
    token_id: &str,
    owner_id: &AccountId,
    creator_id: &AccountId,
    sub_account: &AccountId,
) {
    emit_sonata(
        "master_minted",
        json!({
            "token_id": token_id,
            "owner_id": owner_id.to_string(),
            "creator_id": creator_id.to_string(),
            "sub_account": sub_account.to_string(),
        }),
    );
}

/// Sonata: a master changed hands.
pub fn emit_master_transferred(
    token_id: &str,
    old_owner_id: &AccountId,
    new_owner_id: &AccountId,
    authorized_id: Option<&str>,
) {
    emit_sonata(
        "master_transferred",
        json!({
            "token_id": token_id,
            "old_owner_id": old_owner_id.to_string(),
            "new_owner_id": new_owner_id.to_string(),
            "authorized_id": authorized_id,
        }),
    );
}

/// Sonata: the mint-time platform was changed by the owner.
pub fn emit_platform_set(platform_id: &AccountId) {
    emit_sonata(
        "platform_set",
        json!({ "platform_id": platform_id.to_string() }),
    );
}

/// Sonata: the song-wallet code hash was changed by the owner.
pub fn emit_song_wallet_code_hash_set(code_hash: &str) {
    emit_sonata(
        "song_wallet_code_hash_set",
        json!({ "song_wallet_code_hash": code_hash }),
    );
}

/// Sonata: the mint deposit was changed by the owner.
pub fn emit_mint_deposit_set(amount: near_sdk::json_types::U128) {
    emit_sonata(
        "mint_deposit_set",
        json!({ "mint_deposit": amount.0.to_string() }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nep_format_mint() {
        let expected = r#"EVENT_JSON:{"standard":"nep171","version":"nft-1.0.0","event":"nft_mint","data":[{"owner_id":"foundation.near","token_ids":["aurora","proximitylabs"]}]}"#;
        let log = EventLog {
            standard: "nep171".to_string(),
            version: "nft-1.0.0".to_string(),
            event: EventLogVariant::NftMint(vec![NftMintLog {
                owner_id: "foundation.near".to_owned(),
                token_ids: vec!["aurora".to_string(), "proximitylabs".to_string()],
                memo: None,
            }]),
        };
        assert_eq!(expected, log.to_string());
    }

    #[test]
    fn nep_format_transfer_all_fields() {
        let expected = r#"EVENT_JSON:{"standard":"nep171","version":"nft-1.0.0","event":"nft_transfer","data":[{"authorized_id":"market.near","old_owner_id":"user1.near","new_owner_id":"user2.near","token_ids":["token"],"memo":"Go Team!"}]}"#;
        let log = EventLog {
            standard: "nep171".to_string(),
            version: "nft-1.0.0".to_string(),
            event: EventLogVariant::NftTransfer(vec![NftTransferLog {
                authorized_id: Some("market.near".to_string()),
                old_owner_id: "user1.near".to_string(),
                new_owner_id: "user2.near".to_string(),
                token_ids: vec!["token".to_string()],
                memo: Some("Go Team!".to_owned()),
            }]),
        };
        assert_eq!(expected, log.to_string());
    }

    #[test]
    fn sonata_event_envelope() {
        let rendered = serde_json::to_value(json!({
            "standard": SONATA_STANDARD,
            "version": SONATA_VERSION,
            "event": "master_minted",
            "data": {"token_id": "midnight-drive"},
        }))
        .unwrap();
        assert_eq!(rendered["standard"], "sonata");
        assert_eq!(rendered["version"], "1.0.0");
        assert_eq!(rendered["event"], "master_minted");
        assert_eq!(rendered["data"]["token_id"], "midnight-drive");
    }
}
