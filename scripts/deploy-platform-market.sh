#!/usr/bin/env bash
# Build, deploy and verify the Sonata platform and resale market on testnet.
#
# Both crates must be present in this checkout:
#   contracts/platform  ->  platform-sonata.testnet
#   contracts/market    ->  market-sonata.testnet
#
# When either crate is missing (not merged into this branch yet) the script
# prints "platform/market not merged yet", lists what is missing, and exits 0
# without touching the chain. It never guesses constructor wiring.
#
# Usage:
#   scripts/deploy-platform-market.sh
#
# Requirements: cargo + wasm32-unknown-unknown, near-cli-rs 0.30.x, python3,
# curl, and macOS keychain signing. near-cli-rs is interactive, so writes are
# wrapped in `script` when stdin is not a terminal.
#
# Idempotent: an account that already has contract code is never redeployed.
# Its configuration is verified against the expected demo values instead.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../ops/testnet.env
source "$ROOT/ops/testnet.env"

WASM_DIR="$ROOT/contracts/target/wasm32-unknown-unknown/release"
PLATFORM_WASM="$WASM_DIR/platform.wasm"
MARKET_WASM="$WASM_DIR/market.wasm"
NETWORK="${NEAR_NETWORK:-testnet}"
RPC_URL="${NEAR_RPC_URL:-https://rpc.testnet.near.org}"
SIGN_WITH="${SIGN_WITH:-sign-with-keychain}"

# Discriminating demo parameters (specs/02-contracts.md, specs/06-demo.md).
SUBSCRIPTION_PRICE="${SUBSCRIPTION_PRICE:-5000000}" # 5.00 USDC
PASS_DURATION_SEC="${PASS_DURATION_SEC:-2592000}"   # 30 days
RATE_PER_HOUR="${RATE_PER_HOUR:-30000}"             # 0.03 USDC/hour
RESERVE_TARGET="${RESERVE_TARGET:-900000000}"       # 900.00 USDC
ONE_MONTH_RESERVE="${ONE_MONTH_RESERVE:-300000000}" # 300.00 USDC
# platform.new and market.new register themselves on USDC with this deposit.
DEPLOY_DEPOSIT="${DEPLOY_DEPOSIT:-0.05NEAR}"

say() { printf '\n==> %s\n' "$*"; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

TX_DIR=""
cleanup() { [ -n "$TX_DIR" ] && rm -rf "$TX_DIR"; }
trap cleanup EXIT
TX_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sonata-platform-market.XXXXXX")"

# near-cli-rs 0.30.1 needs a TTY. `script` supplies a pseudo-terminal and
# `yes ''` accepts the default answer at each prompt.
run_tx() {
  local label="$1"
  shift
  local log="$TX_DIR/$label.log" tx status=0
  if [ -t 0 ] && [ -t 1 ]; then
    "$@" 2>&1 | tee "$log" || status=$?
  elif [ "$(uname -s)" = "Darwin" ]; then
    # macOS `script` exits non-zero with "write master: Input/output error"
    # once the child closes the pseudo-terminal, even when the transaction
    # succeeded. Trust the printed transaction id, not the wrapper status.
    yes '' | script -q /dev/null "$@" 2>&1 | tee "$log" || status=$?
  else
    die "near-cli-rs needs a TTY here; run from a terminal (keychain signing is macOS-only)"
  fi
  tx="$(tx_id_from_log "$log")"
  if [ -n "$tx" ]; then
    printf '    transaction: %s\n' "$tx"
  elif [ "$status" -ne 0 ]; then
    printf 'error: near exited %s without a transaction id\n' "$status" >&2
    return 1
  else
    printf '    (no transaction id parsed; see the command output above)\n'
  fi
}

tx_id_from_log() {
  python3 - "$1" <<'PY'
import re
import sys

text = open(sys.argv[1], errors="replace").read()
text = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)
match = re.search(r"Transaction [Ii][Dd]:\s*([1-9A-HJ-NP-Za-km-z]{32,})", text)
print(match.group(1) if match else "")
PY
}

rpc_view() {
  local account="$1" method="$2" args="${3:-'{}'}" args_b64 body
  args_b64=$(printf '%s' "$args" | base64 | tr -d '\n')
  body=$(curl -fsS -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-platform-market\",\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$account\",\"method_name\":\"$method\",\"args_base64\":\"$args_b64\"}}")
  printf '%s' "$body" | python3 -c '
import base64, json, sys
response = json.load(sys.stdin)
if "error" in response:
    print(json.dumps(response["error"]), file=sys.stderr)
    sys.exit(2)
raw = response["result"]["result"]
data = base64.b64decode(raw) if isinstance(raw, str) else bytes(raw)
sys.stdout.write(data.decode())
'
}

json_field() {
  python3 -c '
import json, sys
value = json.load(sys.stdin)
for key in sys.argv[1:]:
    value = value[key]
print(value)
' "$@"
}

account_has_code() {
  local account="$1" body
  body=$(curl -fsS -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-platform-market\",\"method\":\"query\",\"params\":{\"request_type\":\"view_code\",\"finality\":\"final\",\"account_id\":\"$account\"}}") || return 1
  printf '%s' "$body" | grep -q '"code_base64":"[A-Za-z0-9+/]'
}

account_balance() {
  local account="$1" body
  body=$(curl -fsS -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-platform-market\",\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$account\"}}") || return 2
  printf '%s' "$body" | python3 -c '
import json, sys
response = json.load(sys.stdin)
if "error" in response:
    sys.exit(3)
print(response["result"]["amount"])
'
}

# A deploy needs the wasm code storage plus the attached USDC storage deposit.
# Testnet storage is 1e19 yoctoNEAR per byte; 0.25 NEAR is headroom for the
# account, the init-call receipt and the fee so the RPC pre-check passes.
ensure_deploy_balance() {
  local account="$1" wasm="$2" size required balance shortfall
  size=$(wc -c <"$wasm" | tr -d ' ')
  required=$(python3 - "$size" <<'PY'
import sys
size = int(sys.argv[1])
storage = size * 10**19
deposit = 50_000_000_000_000_000_000_000  # 0.05 NEAR
headroom = 250_000_000_000_000_000_000_000  # 0.25 NEAR
print(storage + deposit + headroom)
PY
)
  balance=$(account_balance "$account") ||
    die "could not read the balance of $account (does the account exist?)"
  if [ "$balance" -lt "$required" ]; then
    shortfall=$(python3 - "$required" "$balance" <<'PY'
import sys
required, balance = (int(value) for value in sys.argv[1:])
print(f"{(required - balance) / 10**24:.4f}")
PY
)
    die "$account has $(python3 -c "print(f'{int($balance) / 10**24:.4f}')") NEAR; deploying $(basename "$wasm") needs $(python3 -c "print(f'{int($required) / 10**24:.4f}')") NEAR. Top up at least $shortfall NEAR (e.g. near tokens market-sonata.testnet send-near $account '2 NEAR' network-config testnet sign-with-keychain send) and re-run."
  fi
  printf '  %-22s %s NEAR (need >= %s)\n' "balance" \
    "$(python3 -c "print(f'{int($balance) / 10**24:.4f}')")" \
    "$(python3 -c "print(f'{int($required) / 10**24:.4f}')")"
}

wait_for_code() {
  local account="$1" tries="${2:-30}" i
  for ((i = 0; i < tries; i++)); do
    if account_has_code "$account"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

check_field() {
  local label="$1" json="$2" key="$3" expected="$4" actual
  actual=$(printf '%s' "$json" | json_field "$key")
  if [ "$actual" = "$expected" ]; then
    printf '  %-22s %s\n' "$key" "$actual"
  else
    die "$label.$key is '$actual', expected '$expected'"
  fi
}

# ---------------------------------------------------------------- gate ----
PLATFORM_CRATE="$ROOT/contracts/platform/Cargo.toml"
MARKET_CRATE="$ROOT/contracts/market/Cargo.toml"
missing=()
[ -f "$PLATFORM_CRATE" ] || missing+=("contracts/platform")
[ -f "$MARKET_CRATE" ] || missing+=("contracts/market")

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'platform/market not merged yet (missing: %s)\n' "${missing[*]}"
  cat <<'EOF'
Nothing was deployed and no chain state was touched.
When both crates land, re-run this script; it builds, deploys and verifies:
  platform -> platform-sonata.testnet
  market   -> market-sonata.testnet
EOF
  exit 0
fi

command -v near >/dev/null || die "near-cli-rs ('near') is required"
command -v cargo >/dev/null || die "cargo is required"
command -v python3 >/dev/null || die "python3 is required"
command -v curl >/dev/null || die "curl is required"

# --------------------------------------------------------------- build ----
build_wasm() {
  say "Building platform and market wasm (release)"
  cargo build \
    --manifest-path "$ROOT/contracts/Cargo.toml" \
    --workspace \
    --target wasm32-unknown-unknown \
    --release

  local name wasm
  for pair in "platform:$PLATFORM_WASM" "market:$MARKET_WASM"; do
    name="${pair%%:*}"
    wasm="${pair#*:}"
    if [ ! -f "$wasm" ]; then
      say "$name.wasm missing from the workspace build; building contracts/$name directly"
      cargo build \
        --manifest-path "$ROOT/contracts/$name/Cargo.toml" \
        --target wasm32-unknown-unknown \
        --release
    fi
    [ -f "$wasm" ] || die "missing build artifact: $wasm"
  done
}

# -------------------------------------------------------------- deploy ----
platform_args() {
  python3 - \
    "$SONATA_PARENT" "$ORACLE_ACCOUNT" "$MASTERS_ACCOUNT" "$USDC_ACCOUNT" \
    "$SUBSCRIPTION_PRICE" "$PASS_DURATION_SEC" "$RATE_PER_HOUR" \
    "$RESERVE_TARGET" "$ONE_MONTH_RESERVE" <<'PY'
import json
import sys

(
    owner,
    oracle,
    collection,
    payment_token,
    subscription_price,
    pass_duration_sec,
    rate_per_hour,
    reserve_target,
    one_month_reserve,
) = sys.argv[1:]
print(json.dumps({
    "owner_id": owner,
    "oracle_id": oracle,
    "collection_id": collection,
    "payment_token": payment_token,
    "subscription_price": subscription_price,
    "pass_duration_sec": int(pass_duration_sec),
    "rate_per_hour": rate_per_hour,
    "reserve_target": reserve_target,
    "one_month_reserve": one_month_reserve,
}))
PY
}

market_args() {
  python3 - "$SONATA_PARENT" "$MASTERS_ACCOUNT" "$USDC_ACCOUNT" <<'PY'
import json
import sys

owner, collection, payment_token = sys.argv[1:]
print(json.dumps({
    "owner_id": owner,
    "collection_id": collection,
    "payment_token": payment_token,
}))
PY
}

deploy_platform() {
  if account_has_code "$PLATFORM_ACCOUNT"; then
    say "platform already deployed at $PLATFORM_ACCOUNT (skipping deploy)"
    return 0
  fi

  say "Deploying platform to $PLATFORM_ACCOUNT (attached $DEPLOY_DEPOSIT)"
  ensure_deploy_balance "$PLATFORM_ACCOUNT" "$PLATFORM_WASM"
  run_tx platform near contract deploy "$PLATFORM_ACCOUNT" \
    use-file "$PLATFORM_WASM" \
    with-init-call new json-args "$(platform_args)" \
    prepaid-gas 100Tgas \
    attached-deposit "$DEPLOY_DEPOSIT" \
    network-config "$NETWORK" \
    "$SIGN_WITH" send || return 1

  wait_for_code "$PLATFORM_ACCOUNT" || die "platform code did not appear at $PLATFORM_ACCOUNT"
}

deploy_market() {
  if account_has_code "$MARKET_ACCOUNT"; then
    say "market already deployed at $MARKET_ACCOUNT (skipping deploy)"
    return 0
  fi

  say "Deploying market to $MARKET_ACCOUNT (attached $DEPLOY_DEPOSIT)"
  ensure_deploy_balance "$MARKET_ACCOUNT" "$MARKET_WASM"
  run_tx market near contract deploy "$MARKET_ACCOUNT" \
    use-file "$MARKET_WASM" \
    with-init-call new json-args "$(market_args)" \
    prepaid-gas 100Tgas \
    attached-deposit "$DEPLOY_DEPOSIT" \
    network-config "$NETWORK" \
    "$SIGN_WITH" send || return 1

  wait_for_code "$MARKET_ACCOUNT" || die "market code did not appear at $MARKET_ACCOUNT"
}

# -------------------------------------------------------------- verify ----
verify_usdc_registration() {
  local account="$1" balance
  balance=$(rpc_view "$USDC_ACCOUNT" storage_balance_of "{\"account_id\":\"$account\"}")
  if [ "$balance" = "null" ]; then
    die "$account is not registered on $USDC_ACCOUNT (constructor storage_deposit failed)"
  fi
  printf '  %-22s %s\n' "usdc storage" "registered"
}

verify_platform() {
  local stats paused balance
  say "Verifying platform (get_stats)"
  stats=$(rpc_view "$PLATFORM_ACCOUNT" get_stats)
  [ -n "$stats" ] || die "platform.get_stats returned nothing"

  check_field platform "$stats" subscription_price "$SUBSCRIPTION_PRICE"
  check_field platform "$stats" rate_per_hour "$RATE_PER_HOUR"
  check_field platform "$stats" reserve_target "$RESERVE_TARGET"
  check_field platform "$stats" one_month_reserve "$ONE_MONTH_RESERVE"
  check_field platform "$stats" oracle_id "$ORACLE_ACCOUNT"

  paused=$(printf '%s' "$stats" | python3 -c '
import json, sys
print("true" if json.load(sys.stdin).get("paused") else "false")
')
  [ "$paused" = "false" ] || die "platform is paused; expected an unpaused demo"
  printf '  %-22s %s\n' "paused" "$paused"

  balance=$(printf '%s' "$stats" | json_field balance)
  printf '  %-22s %s micro-USDC\n' "balance" "$balance"
  verify_usdc_registration "$PLATFORM_ACCOUNT"
}

verify_market() {
  local listings count
  say "Verifying market (get_listings)"
  if ! listings=$(rpc_view "$MARKET_ACCOUNT" get_listings '{"from_index":0,"limit":100}'); then
    die "market.get_listings failed"
  fi
  count=$(printf '%s' "$listings" | python3 -c '
import json, sys
value = json.load(sys.stdin)
if not isinstance(value, list):
    raise SystemExit("get_listings did not return an array")
print(len(value))
')
  printf '  %-22s %s\n' "listings" "$count"
  verify_usdc_registration "$MARKET_ACCOUNT"
}

# ---------------------------------------------------------------- main ----
build_wasm

FAILED=0
if ! deploy_platform; then
  printf 'error: platform deployment failed; see the exact RPC error above\n' >&2
  FAILED=1
fi
if ! deploy_market; then
  printf 'error: market deployment failed; see the exact RPC error above\n' >&2
  FAILED=1
fi
if [ "$FAILED" -ne 0 ]; then
  say "Stopping: at least one deployment failed. No state was reset."
  exit 1
fi

verify_platform
verify_market

say "Done"
cat <<EOF
network:   $NETWORK
platform:  $PLATFORM_ACCOUNT
market:    $MARKET_ACCOUNT
usdc:      $USDC_ACCOUNT
collection: $MASTERS_ACCOUNT
EOF
