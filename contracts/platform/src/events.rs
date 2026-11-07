//! Sonata NEP-297 event logs for the platform contract.

use near_sdk::json_types::U128;
use near_sdk::{log, AccountId};
use serde_json::json;

use crate::{Epoch, SONATA_STANDARD, SONATA_VERSION};

/// Emit one NEP-297 event in the exact Sonata envelope.
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

pub fn emit_pass_minted(account_id: &AccountId, token_id: &str, expires_at: u64, amount: U128) {
    emit_sonata(
        "pass_minted",
        json!({
            "account_id": account_id.to_string(),
            "token_id": token_id,
            "expires_at": expires_at,
            "amount": amount.0.to_string(),
        }),
    );
}

pub fn emit_pass_renewed(account_id: &AccountId, token_id: &str, expires_at: u64, amount: U128) {
    emit_sonata(
        "pass_renewed",
        json!({
            "account_id": account_id.to_string(),
            "token_id": token_id,
            "expires_at": expires_at,
            "amount": amount.0.to_string(),
        }),
    );
}

pub fn emit_epoch_settled(epoch: &Epoch) {
    emit_sonata(
        "epoch_settled",
        json!({
            "epoch_id": epoch.id,
            "total_seconds": epoch.total_seconds,
            "effective_rate_per_hour": epoch.effective_rate_per_hour.0.to_string(),
            "total_paid": epoch.total_paid.0.to_string(),
            "listen_root": &epoch.listen_root,
            "entries_count": epoch.entries_count,
            "mode": &epoch.mode,
        }),
    );
}

pub fn emit_payout_sent(
    epoch_id: u64,
    token_id: &str,
    song_account: &AccountId,
    amount: U128,
    seconds: u64,
) {
    emit_sonata(
        "payout_sent",
        json!({
            "epoch_id": epoch_id,
            "token_id": token_id,
            "song_account": song_account.to_string(),
            "amount": amount.0.to_string(),
            "seconds": seconds,
        }),
    );
}

pub fn emit_song_account_changed(
    token_id: &str,
    previous: Option<&AccountId>,
    account_id: &AccountId,
) {
    emit_sonata(
        "song_account_changed",
        json!({
            "token_id": token_id,
            "previous_account_id": previous.map(|id| id.to_string()),
            "account_id": account_id.to_string(),
        }),
    );
}

pub fn emit_reserve_targets_changed(reserve_target: U128, one_month_reserve: U128) {
    emit_sonata(
        "reserve_targets_changed",
        json!({
            "reserve_target": reserve_target.0.to_string(),
            "one_month_reserve": one_month_reserve.0.to_string(),
        }),
    );
}

pub fn emit_revenue_withdrawn(receiver_id: &AccountId, amount: U128) {
    emit_sonata(
        "revenue_withdrawn",
        json!({
            "receiver_id": receiver_id.to_string(),
            "amount": amount.0.to_string(),
        }),
    );
}
