//! Revenue withdrawal: owner-only, async balance check, reserve floor.

use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId};

use crate::*;

const REVENUE_MEMO: &str = "platform revenue";

#[near]
impl Contract {
    /// Withdraw platform revenue to `receiver_id`. The balance is read from
    /// the payment token in a callback; the reserve is checked against that
    /// live balance before the transfer is issued.
    pub fn withdraw_revenue(&mut self, receiver_id: AccountId, amount: U128) {
        self.assert_owner();
        assert!(amount.0 > 0, "Amount must be positive");
        assert!(self.pending_withdrawal.is_none(), "Withdrawal in progress");

        self.pending_withdrawal = Some(PendingWithdrawal {
            receiver_id,
            amount,
        });

        let _ = ext_fungible_token::ext(self.payment_token.clone())
            .with_static_gas(GAS_FOR_BALANCE_CHECK)
            .ft_balance_of(env::current_account_id())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_WITHDRAW_CALLBACK)
                    .on_withdraw_balance(),
            );
    }

    /// Revenue withdrawal callback. Panics `"Reserve floor"` when the payout
    /// would leave less than `max(reserve_target, one_month_reserve)`.
    #[private]
    pub fn on_withdraw_balance(&mut self) {
        let pending = self
            .pending_withdrawal
            .take()
            .unwrap_or_else(|| env::panic_str("Withdrawal invariant broken"));

        let balance = match env::promise_result_checked(0, 1024) {
            Ok(bytes) => match serde_json::from_slice::<U128>(&bytes) {
                Ok(balance) => balance,
                Err(_) => env::panic_str("Balance check failed"),
            },
            Err(_) => env::panic_str("Balance check failed"),
        };

        assert!(
            reserve_ok(
                balance.0,
                pending.amount.0,
                self.reserve_target.0,
                self.one_month_reserve.0,
            ),
            "Reserve floor"
        );

        self.cached_balance = U128(balance.0 - pending.amount.0);
        events::emit_revenue_withdrawn(&pending.receiver_id, pending.amount);

        let _ = ext_fungible_token::ext(self.payment_token.clone())
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .with_attached_deposit(ONE_YOCTONEAR)
            .ft_transfer(
                pending.receiver_id,
                pending.amount,
                Some(REVENUE_MEMO.to_string()),
            );
    }
}
