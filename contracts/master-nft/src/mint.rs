//! Minting: creates the master, the keyless song wallet sub-account, and
//! registers the song with the platform.

use near_sdk::{env, near, AccountId, NearToken, Promise};
use serde_json::json;

use crate::*;

#[near]
impl Contract {
    /// Mint a master. `creator_id` is the caller; the token is owned by
    /// `receiver_id`.
    ///
    /// The attached deposit must be at least `mint_deposit`. v1 keeps the
    /// deposit (it funds the song account and platform registration) and
    /// does not refund the excess.
    #[payable]
    pub fn nft_mint(
        &mut self,
        token_id: TokenId,
        metadata: TokenMetadata,
        receiver_id: AccountId,
    ) -> JsonMaster {
        assert!(
            env::attached_deposit().as_yoctonear() >= self.mint_deposit.0,
            "Deposit too small"
        );
        assert!(is_valid_slug(&token_id), "Invalid token id");
        assert!(
            self.tokens_by_id.get(&token_id).is_none(),
            "Token already exists"
        );

        let creator_id = env::predecessor_account_id();
        let sub_account: AccountId = format!("{}.{}", token_id, self.collection_id)
            .parse()
            .unwrap_or_else(|_| env::panic_str("Invalid token id"));
        let now = now_secs();
        let master = Master::new(
            receiver_id.clone(),
            creator_id.clone(),
            sub_account.clone(),
            metadata,
            now,
            DEFAULT_ROYALTY_BPS,
        );
        self.tokens_by_id.insert(&token_id, &master);
        self.internal_add_token_to_owner(&receiver_id, &token_id);
        self.token_supply = self.token_supply.saturating_add(1);

        events::emit_nft_mint(&receiver_id, &token_id, None);
        events::emit_master_minted(&token_id, &receiver_id, &creator_id, &sub_account);

        // Create the song account with no access keys and install the
        // immutable global song-wallet code, then initialize it and ask the
        // platform to register it for payouts. The whole chain is one
        // promise so the wallet exists before the platform sees it.
        let wallet_init_args = json!({
            "collection_id": self.collection_id,
            "token_id": token_id,
            "payment_token": self.payment_token,
        })
        .to_string()
        .into_bytes();
        Promise::new(sub_account.clone())
            .create_account()
            .transfer(STORAGE_FOR_SONG_ACCOUNT)
            .use_global_contract(self.song_wallet_code_hash)
            .function_call(
                "new",
                wallet_init_args,
                NearToken::from_yoctonear(0),
                GAS_FOR_WALLET_INIT,
            )
            .then(
                ext_platform::ext(self.platform_id.clone())
                    .with_static_gas(GAS_FOR_PLATFORM_REGISTER)
                    .register_song(token_id.clone(), sub_account),
            );

        self.to_json_master(&token_id, &master)
    }
}
