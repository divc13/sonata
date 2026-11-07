#!/usr/bin/env bash
# Rescue the Sonata song wallets on testnet after the withdrawal/gas repair.
#
# The original `<token>.masters-sonata.testnet` accounts were created with the
# broken song-wallet code and cannot be upgraded in place (they reference an
# immutable global code hash). This script creates one replacement account per
# catalogue token, points it at the fixed global song-wallet code, initializes
# it, registers it on USDC, removes every access key, and updates the platform
# payout mapping. NFT ownership, listings, passes, epochs and the original
# wallets are left untouched.
#
# It is idempotent: an existing wallet, deployment, initialization,
# registration, keyless state or mapping is verified and skipped.
#
#   scripts/rescue-song-wallets.sh              # on-chain rescue + mapping file
#   scripts/rescue-song-wallets.sh --update-db  # also point sonata_song at the
#                                               # replacement wallets
#
# Prerequisites: the fixed song-wallet wasm is deployed as an immutable global
# contract (scripts/deploy-testnet.sh does this when the hash is missing), the
# `masters-sonata.testnet` and `sonata.testnet` keys are in the macOS keychain,
# and the collection config already points at `SONG_WALLET_CODE_HASH`.
#
# No secret key is printed or written. The generated `scripts/demo-wallets.json`
# contains account ids and a code hash only.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../ops/testnet.env
source "$ROOT/ops/testnet.env"

CATALOGUE="$ROOT/scripts/demo-catalogue.json"
MAPPING="$ROOT/scripts/demo-wallets.json"
WASM="$ROOT/contracts/target/wasm32-unknown-unknown/release/song_wallet.wasm"
NETWORK="${NEAR_NETWORK:-testnet}"
RPC_URL="${SONATA_RPC_URL:-${NEAR_RPC_URL:-https://rpc.testnet.fastnear.com}}"
SIGN_WITH="${SIGN_WITH:-sign-with-keychain}"
WALLET_SUFFIX="${WALLET_SUFFIX:--v2}"
# A wallet holds ~0.3 NEAR: the account, the initialized state and the 0.0012
# NEAR USDC registration. The code itself is shared global code, so no wallet
# pays for it.
WALLET_FUND="${WALLET_FUND:-0.3 NEAR}"
REGISTRATION_DEPOSIT="${REGISTRATION_DEPOSIT:-0.01NEAR}"
UPDATE_DB="false"
[ "${1:-}" = "--update-db" ] && UPDATE_DB="true"

DB_CONTAINER="${SONATA_DB_CONTAINER:-sonata-postgres}"
DB_NAME="${SONATA_DB_NAME:-local_platforms}"
DB_USER="${SONATA_DB_USER:-postgres}"

say() { printf '\n==> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v near >/dev/null || die "near-cli-rs is not installed"
command -v python3 >/dev/null || die "python3 is required"
command -v curl >/dev/null || die "curl is required"

TX_DIR=""
cleanup() { [ -n "$TX_DIR" ] && rm -rf "$TX_DIR"; }
trap cleanup EXIT
TX_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sonata-rescue.XXXXXX")"

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

# Runs one near-cli-rs write under a pseudo-TTY (0.30.1 expects a terminal) and
# prints the transaction id. macOS `script` may exit 1 with
# "write master: Input/output error" after a successful transaction, so the
# printed transaction id is authoritative.
run_tx() {
  local label="$1"
  shift
  local log="$TX_DIR/$label.log" rc=0 tx
  if [ -t 0 ] && [ -t 1 ]; then
    "$@" >"$log" 2>&1 || rc=$?
  elif [ "$(uname -s)" = "Darwin" ]; then
    yes '' | script -q /dev/null "$@" >"$log" 2>&1 || rc=$?
  else
    die "near-cli-rs needs a TTY here; run from a terminal (keychain signing is macOS-only)"
  fi
  tx="$(tx_id_from_log "$log")"
  if [ -n "$tx" ]; then
    printf '    transaction: %s\n' "$tx"
    # near-cli-rs talks to the archival RPC, which rate-limits bursts.
    sleep "${RESCUE_SLEEP:-2}"
    return 0
  fi
  if [ "$rc" -ne 0 ]; then
    sed 's/\x1b\[[0-9;]*[A-Za-z]//g' "$log" | grep -avE '^\s*$' | tail -20 >&2
    die "near exited $rc without a transaction id ($label)"
  fi
  printf '    (no transaction id parsed; see %s)\n' "$log"
}

rpc_post() {
  curl -fsS --retry 5 --retry-delay 1 --retry-all-errors -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' -d "$1"
}

rpc_view() {
  local account="$1" method="$2" args="${3:-'{}'}" args_b64 body
  args_b64=$(printf '%s' "$args" | base64 | tr -d '\n')
  body=$(rpc_post "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-rescue\",\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$account\",\"method_name\":\"$method\",\"args_base64\":\"$args_b64\"}}")
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

# Tab-separated code_hash/global_contract_hash, or "missing" for no account.
account_state() {
  rpc_post "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-rescue\",\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"final\",\"account_id\":\"$1\"}}" |
    python3 -c '
import json, sys
response = json.load(sys.stdin)
if "error" in response:
    print("missing")
    sys.exit(0)
result = response["result"]
print("\t".join([result.get("code_hash", ""), result.get("global_contract_hash") or ""]))
'
}

access_keys() {
  rpc_post "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-rescue\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$1\"}}" |
    python3 -c '
import json, sys
response = json.load(sys.stdin)
if "error" in response:
    sys.exit(3)
print(",".join(key["public_key"] for key in response["result"].get("keys", [])))
'
}

sha256_base58() {
  python3 - "$1" <<'PY'
import hashlib
import sys

alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
digest = hashlib.sha256(open(sys.argv[1], "rb").read()).digest()
number = int.from_bytes(digest, "big")
encoded = ""
while number:
    number, remainder = divmod(number, 58)
    encoded = alphabet[remainder] + encoded
for byte in digest:
    if byte:
        break
    encoded = "1" + encoded
print(encoded)
PY
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

catalogue_wallets() {
  python3 - "$CATALOGUE" "$MASTERS_ACCOUNT" "$WALLET_SUFFIX" <<'PY'
import json
import sys

collection = sys.argv[2]
suffix = sys.argv[3]
for song in json.load(open(sys.argv[1]))["songs"]:
    print("\t".join([
        song["tokenId"],
        f'{song["tokenId"]}{suffix}.{collection}',
        f'{song["tokenId"]}.{collection}',
    ]))
PY
}

# Resolve the code hash: the local wasm when built, otherwise the value in
# ops/testnet.env. The collection must already point at it.
if [ -f "$WASM" ]; then
  CODE_HASH="$(sha256_base58 "$WASM")"
else
  CODE_HASH="${SONG_WALLET_CODE_HASH:-}"
fi
[ -n "$CODE_HASH" ] || die "song-wallet wasm missing and SONG_WALLET_CODE_HASH unset"

say "Song-wallet rescue"
printf 'collection: %s\ncode hash:  %s\nsuffix:     %s\n' \
  "$MASTERS_ACCOUNT" "$CODE_HASH" "$WALLET_SUFFIX"

collection_hash="$(rpc_view "$MASTERS_ACCOUNT" get_config | json_field song_wallet_code_hash)"
[ "$collection_hash" = "$CODE_HASH" ] ||
  die "collection points at $collection_hash, expected $CODE_HASH (run set_song_wallet_code_hash first)"

global_bytes=$(rpc_post "{\"jsonrpc\":\"2.0\",\"id\":\"sonata-rescue\",\"method\":\"query\",\"params\":{\"request_type\":\"view_global_contract_code\",\"finality\":\"final\",\"code_hash\":\"$CODE_HASH\"}}" |
  python3 -c '
import base64, json, sys
response = json.load(sys.stdin)
if "error" in response:
    print(0)
else:
    print(len(base64.b64decode(response["result"]["code_base64"])))
')
[ "${global_bytes:-0}" -gt 0 ] ||
  die "global song-wallet code $CODE_HASH is not deployed (run scripts/deploy-testnet.sh)"

mapping_rows="$TX_DIR/mapping.tsv"
: >"$mapping_rows"

while IFS=$'\t' read -r token wallet previous; do
  [ -n "$token" ] || continue
  say "$token -> $wallet"

  state="$(account_state "$wallet")"
  if [ "$state" = "missing" ]; then
    printf '  creating %s (%s)\n' "$wallet" "$WALLET_FUND"
    run_tx "create-$token" near account create-account fund-myself "$wallet" "$WALLET_FUND" \
      autogenerate-new-keypair save-to-keychain sign-as "$MASTERS_ACCOUNT" \
      network-config "$NETWORK" "$SIGN_WITH" send
    state="$(account_state "$wallet")"
    [ "$state" != "missing" ] || die "$wallet was not created"
  else
    printf '  account exists\n'
  fi

  IFS=$'\t' read -r code_hash global_hash <<<"$state"
  if [ "$global_hash" != "$CODE_HASH" ]; then
    printf '  deploying global code %s\n' "$CODE_HASH"
    run_tx "deploy-$token" near contract deploy "$wallet" use-global-hash "$CODE_HASH" \
      without-init-call network-config "$NETWORK" "$SIGN_WITH" send
    state="$(account_state "$wallet")"
    IFS=$'\t' read -r code_hash global_hash <<<"$state"
    [ "$global_hash" = "$CODE_HASH" ] || die "$wallet did not pick up $CODE_HASH"
  else
    printf '  global code already set\n'
  fi

  if ! config="$(rpc_view "$wallet" get_config 2>/dev/null)"; then
    printf '  initializing collection=%s token=%s payment=%s\n' \
      "$MASTERS_ACCOUNT" "$token" "$USDC_ACCOUNT"
    run_tx "init-$token" near contract call-function as-transaction "$wallet" new \
      json-args "{\"collection_id\":\"$MASTERS_ACCOUNT\",\"token_id\":\"$token\",\"payment_token\":\"$USDC_ACCOUNT\"}" \
      prepaid-gas 30Tgas attached-deposit 0NEAR sign-as "$wallet" \
      network-config "$NETWORK" "$SIGN_WITH" send
    config="$(rpc_view "$wallet" get_config)"
  else
    printf '  already initialized\n'
  fi
  printf '%s' "$config" | python3 -c '
import json, sys
config = json.load(sys.stdin)
assert config["collection_id"] == sys.argv[1], config
assert config["token_id"] == sys.argv[2], config
assert config["payment_token"] == sys.argv[3], config
' "$MASTERS_ACCOUNT" "$token" "$USDC_ACCOUNT" ||
    die "$wallet get_config does not match the expected collection/token/payment"

  storage="$(rpc_view "$USDC_ACCOUNT" storage_balance_of "{\"account_id\":\"$wallet\"}" 2>/dev/null || echo null)"
  if [ "$storage" = "null" ]; then
    printf '  registering on %s\n' "$USDC_ACCOUNT"
    run_tx "register-$token" near contract call-function as-transaction "$USDC_ACCOUNT" storage_deposit \
      json-args "{\"account_id\":\"$wallet\",\"registration_only\":true}" \
      prepaid-gas 20Tgas attached-deposit "$REGISTRATION_DEPOSIT" sign-as "$wallet" \
      network-config "$NETWORK" "$SIGN_WITH" send
  else
    printf '  already registered on USDC\n'
  fi

  keys_status=0
  keys="$(access_keys "$wallet" 2>/dev/null)" || keys_status=$?
  [ "$keys_status" -eq 0 ] || die "could not read access keys for $wallet"
  if [ -n "$keys" ]; then
    printf '  deleting access keys\n'
    run_tx "keys-$token" near account delete-keys "$wallet" public-keys "$keys" \
      network-config "$NETWORK" "$SIGN_WITH" send
    keys_status=0
    keys="$(access_keys "$wallet" 2>/dev/null)" || keys_status=$?
    [ "$keys_status" -eq 0 ] || die "could not re-read access keys for $wallet"
  fi
  [ -z "$keys" ] || die "$wallet still has access keys: $keys"
  printf '  keyless\n'

  mapped="$(rpc_view "$PLATFORM_ACCOUNT" get_song_account "{\"token_id\":\"$token\"}" | tr -d '"')"
  if [ "$mapped" != "$wallet" ]; then
    printf '  mapping platform payout: %s\n' "$mapped"
    run_tx "map-$token" near contract call-function as-transaction "$PLATFORM_ACCOUNT" set_song_account \
      json-args "{\"token_id\":\"$token\",\"account_id\":\"$wallet\"}" \
      prepaid-gas 30Tgas attached-deposit 0NEAR sign-as "$SONATA_PARENT" \
      network-config "$NETWORK" "$SIGN_WITH" send
    mapped="$(rpc_view "$PLATFORM_ACCOUNT" get_song_account "{\"token_id\":\"$token\"}" | tr -d '"')"
  else
    printf '  platform mapping already set\n'
  fi
  [ "$mapped" = "$wallet" ] || die "platform mapping for $token is $mapped, expected $wallet"

  printf '%s\t%s\t%s\n' "$token" "$wallet" "$previous" >>"$mapping_rows"
done < <(catalogue_wallets)

say "Verifying the mapping"
while IFS=$'\t' read -r token wallet previous; do
  [ -n "$token" ] || continue
  state="$(account_state "$wallet")"
  IFS=$'\t' read -r code_hash global_hash <<<"$state"
  [ "$global_hash" = "$CODE_HASH" ] || die "$wallet global hash is ${global_hash:-missing}"
  keys_status=0
  keys="$(access_keys "$wallet" 2>/dev/null)" || keys_status=$?
  [ "$keys_status" -eq 0 ] || die "could not read access keys for $wallet"
  [ -z "$keys" ] || die "$wallet is not keyless: $keys"
  mapped="$(rpc_view "$PLATFORM_ACCOUNT" get_song_account "{\"token_id\":\"$token\"}" | tr -d '"')"
  [ "$mapped" = "$wallet" ] || die "$token maps to $mapped, expected $wallet"
done <"$mapping_rows"
printf 'verified %s wallets\n' "$(wc -l <"$mapping_rows" | tr -d ' ')"

say "Writing $MAPPING"
python3 - "$mapping_rows" "$MAPPING" "$CODE_HASH" "$MASTERS_ACCOUNT" "$SONATA_PARENT" <<'PY'
import json
import sys

rows = [line.rstrip("\n").split("\t") for line in open(sys.argv[1]) if line.strip()]
data = {
    "collection": sys.argv[4],
    "platformOwner": sys.argv[5],
    "songWalletCodeHash": sys.argv[3],
    "globalCode": True,
    "wallets": [
        {"tokenId": token, "wallet": wallet, "previousWallet": previous}
        for token, wallet, previous in rows
    ],
}
with open(sys.argv[2], "w") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
PY
printf 'wrote %s\n' "$MAPPING"

if [ "$UPDATE_DB" = "true" ]; then
  command -v docker >/dev/null ||
    die "docker is required for --update-db; run the UPDATE statements printed above manually"
  say "Updating sonata_song.sub_account"
  while IFS=$'\t' read -r token wallet _; do
    [ -n "$token" ] || continue
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q \
      -c "update sonata_song set sub_account = '$wallet', updated_at = now() where token_id = '$token';" </dev/null
  done <"$mapping_rows"
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q \
    -c "select token_id, owner_account_id, sub_account from sonata_song order by token_id;" </dev/null
fi

say "Rescue complete"
printf 'Replacement wallets hold the fixed withdrawal code. Original wallets, NFTs,\n'
printf 'listings, passes and epoch history are unchanged. Re-run with --update-db to\n'
printf 'point the web app cache at the new accounts.\n'
