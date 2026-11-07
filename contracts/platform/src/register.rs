//! Song registry: the collection registers each master's keyless payout account.

use near_sdk::{env, near, AccountId};

use crate::*;

#[near]
impl Contract {
    /// Called by `master-nft.nft_mint` after it creates the song account.
    ///
    /// Idempotent for the same `(token_id, song_account)` pair; a different
    /// account for an already-registered token is rejected. The song account
    /// is registered on USDC with a fixed NEAR deposit from the platform's own
    /// balance, because an unregistered account cannot receive payouts.
    pub fn register_song(&mut self, token_id: TokenId, song_account: AccountId) {
        assert_eq!(
            env::predecessor_account_id(),
            self.collection_id,
            "Only collection"
        );
        let suffix = format!(".{}", self.collection_id);
        assert!(
            song_account.as_str().ends_with(&suffix),
            "Invalid song account"
        );

        if let Some(existing) = self.song_accounts.get(&token_id) {
            assert_eq!(existing, song_account, "Song already registered");
            return;
        }

        // The deposit is sent from this contract's free balance. Keep the
        // storage stake untouched so the outgoing transfer cannot fail.
        let storage_stake = env::storage_byte_cost()
            .as_yoctonear()
            .saturating_mul(env::storage_usage() as u128);
        let available = env::account_balance()
            .as_yoctonear()
            .saturating_sub(storage_stake);
        assert!(
            available >= SONG_REGISTRATION_DEPOSIT.as_yoctonear(),
            "Cannot register song account"
        );

        self.song_accounts.insert(&token_id, &song_account);
        let _ = ext_fungible_token::ext(self.payment_token.clone())
            .with_static_gas(GAS_FOR_STORAGE_DEPOSIT)
            .with_attached_deposit(SONG_REGISTRATION_DEPOSIT)
            .storage_deposit(Some(song_account), Some(true));
    }

    /// The payout account registered for a master, if any.
    pub fn get_song_account(&self, token_id: TokenId) -> Option<AccountId> {
        self.song_accounts.get(&token_id)
    }
}
