//! Epoch settlement: oracle entry point, balance read, and the payout callback.

use near_sdk::json_types::U128;
use near_sdk::{env, log, near};

use crate::*;

#[near]
impl Contract {
    /// Start settling `epoch_id`. Validates the oracle payload synchronously,
    /// then reads the platform's USDC balance before paying anyone out. The
    /// callback `on_epoch_balance` consumes that result.
    pub fn settle_epoch(&mut self, epoch_id: u64, entries: Vec<PayoutEntry>, listen_root: String) {
        self.assert_oracle();
        assert!(!self.paused, "Paused");
        assert!(self.pending_settlement.is_none(), "Settlement in progress");
        assert_eq!(epoch_id, self.next_epoch_id, "Epoch id mismatch");
        assert!(!entries.is_empty(), "Empty epoch");
        assert!(is_strictly_sorted(&entries), "Unsorted entries");

        // Fail before scheduling the balance read: every song must be
        // registered so the callback cannot fail halfway through the epoch.
        for entry in &entries {
            assert!(
                self.song_accounts.contains_key(&entry.token_id),
                "Song not registered"
            );
        }

        let now = now_secs();
        let started_at = epoch_id
            .checked_sub(1)
            .and_then(|previous| self.epochs.get(&previous))
            .map(|epoch| epoch.closed_at)
            .unwrap_or(now);

        self.pending_settlement = Some(PendingSettlement {
            epoch_id,
            started_at,
            closed_at: now,
            entries,
            listen_root,
        });

        let _ = ext_fungible_token::ext(self.payment_token.clone())
            .with_static_gas(GAS_FOR_BALANCE_CHECK)
            .ft_balance_of(env::current_account_id())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_SETTLE_CALLBACK)
                    .on_epoch_balance(),
            );
    }

    /// Settlement callback: the private callback cannot be called externally.
    /// Re-validates registered songs, computes the effective rate and floor
    /// payouts, stores the closed epoch, then issues the USDC transfers.
    #[private]
    pub fn on_epoch_balance(&mut self) {
        let pending = self
            .pending_settlement
            .take()
            .unwrap_or_else(|| env::panic_str("Settlement invariant broken"));

        // `promise_result_checked` reads at most 1 KiB from the result
        // register; a U128 is a short JSON string.
        let balance = match env::promise_result_checked(0, 1024) {
            Ok(bytes) => match serde_json::from_slice::<U128>(&bytes) {
                Ok(balance) => balance,
                Err(_) => env::panic_str("Balance check failed"),
            },
            Err(_) => env::panic_str("Balance check failed"),
        };

        // Re-check every account in the callback receipt: the registry is the
        // source of truth at payout time.
        let mut accounts = Vec::with_capacity(pending.entries.len());
        for entry in &pending.entries {
            let account = self
                .song_accounts
                .get(&entry.token_id)
                .unwrap_or_else(|| env::panic_str("Song not registered"));
            accounts.push(account);
        }

        let total_seconds: u128 = pending
            .entries
            .iter()
            .map(|entry| entry.seconds as u128)
            .sum();
        assert!(total_seconds <= u64::MAX as u128, "Epoch too long");
        let total_seconds = total_seconds as u64;

        let effective = compute_effective_rate(self.rate_per_hour.0, balance.0, total_seconds);

        let mut epoch_paid = 0u128;
        let mut payouts: Vec<(PayoutEntry, AccountId, u128)> = Vec::new();
        for (entry, account) in pending.entries.iter().zip(accounts) {
            let amount = payout_for_seconds(effective, entry.seconds);
            if amount > 0 {
                epoch_paid = epoch_paid.saturating_add(amount);
                payouts.push((entry.clone(), account, amount));
            }
        }

        let epoch = Epoch {
            id: pending.epoch_id,
            started_at: pending.started_at,
            closed_at: pending.closed_at,
            balance_before: balance,
            total_seconds,
            effective_rate_per_hour: U128(effective),
            total_paid: U128(epoch_paid),
            listen_root: pending.listen_root,
            entries_count: pending.entries.len() as u32,
            mode: settlement_mode(self.rate_per_hour.0, effective).to_string(),
        };

        // All payouts are computed and validated before any transfer is
        // scheduled. Promise calls run after this receipt commits, so the
        // epoch is stored and `next_epoch_id` advances in the same receipt.
        for (entry, account, amount) in payouts {
            events::emit_payout_sent(
                epoch.id,
                &entry.token_id,
                &account,
                U128(amount),
                entry.seconds,
            );
            let _ = ext_fungible_token::ext(self.payment_token.clone())
                .with_static_gas(GAS_FOR_FT_TRANSFER)
                .with_attached_deposit(ONE_YOCTONEAR)
                .ft_transfer(account, U128(amount), Some(format!("epoch:{}", epoch.id)));
        }

        self.epochs.insert(&epoch.id, &epoch);
        self.next_epoch_id = epoch.id + 1;
        self.total_paid.0 = self.total_paid.0.saturating_add(epoch_paid);
        self.total_hours_seconds = self
            .total_hours_seconds
            .saturating_add(total_seconds as u128);
        self.cached_balance = U128(balance.0.saturating_sub(epoch_paid));
        events::emit_epoch_settled(&epoch);
    }

    /// Owner escape hatch for a settlement (or withdrawal) whose balance-read
    /// receipt failed and left the guard set. Never moves funds.
    pub fn abort_settlement(&mut self) {
        self.assert_owner();
        if let Some(pending) = self.pending_settlement.take() {
            log!("Aborted settlement for epoch {}", pending.epoch_id);
        }
        if self.pending_withdrawal.take().is_some() {
            log!("Aborted revenue withdrawal");
        }
    }
}
