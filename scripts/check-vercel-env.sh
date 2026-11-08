#!/usr/bin/env bash
#
# Vercel preflight. Checks environment variable NAMES (never prints values)
# plus the two URL shapes that must be right before a deploy:
#
#   NEXT_PUBLIC_APP_URL  https:// and not localhost
#   AUTH_URL             https:// and not localhost (when set)
#
# Usage:
#   bash scripts/check-vercel-env.sh
#
# Export the deployment values in the current shell first. Running it against
# the local .env (localhost database/app URL) is expected to FAIL: this is a
# Vercel preflight, not a local-development check.
#
# Exit code 0 when every required check passes; 1 otherwise. Warnings do not
# fail the run. No value is ever echoed, so this is safe to paste in CI logs.

set -u

fail_count=0
warn_count=0
pass_count=0

if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  red=$(printf '\033[31m')
  green=$(printf '\033[32m')
  yellow=$(printf '\033[33m')
  dim=$(printf '\033[2m')
  reset=$(printf '\033[0m')
else
  red=""
  green=""
  yellow=""
  dim=""
  reset=""
fi

pass() {
  printf '%sPASS%s  %-42s %s\n' "$green" "$reset" "$1" "$2"
  pass_count=$((pass_count + 1))
}
fail() {
  printf '%sFAIL%s  %-42s %s\n' "$red" "$reset" "$1" "$2"
  fail_count=$((fail_count + 1))
}
warn() {
  printf '%sWARN%s  %-42s %s\n' "$yellow" "$reset" "$1" "$2"
  warn_count=$((warn_count + 1))
}
info() { printf '%sINFO%s  %-42s %s\n' "$dim" "$reset" "$1" "$2"; }

is_set() {
  # Indirect expansion: never echoes the value.
  [ -n "${!1:-}" ]
}

require() {
  local name=$1 detail=${2:-"required"}
  if is_set "$name"; then
    pass "$name" "set"
  else
    fail "$name" "$detail"
  fi
}

# URL shape without printing the URL. Sets url_ok=1/0.
check_public_url() {
  local name=$1 value=${!1:-} rest host
  if [ -z "$value" ]; then
    fail "$name" "not set"
    return
  fi
  case "$value" in
    https://*) ;;
    *)
      fail "$name" "must start with https://"
      return
      ;;
  esac
  rest=${value#https://}
  host=${rest%%/*}
  host=${host%%\?*}
  host=${host%%#*}
  case "$host" in
    "["*"]"*) host=${host%%]*}] ;;
    *) host=${host%%:*} ;;
  esac
  host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')
  case "$host" in
    "" | localhost | localhost.* | 127.* | 0.0.0.0 | "::1" | "[::1]" | *.local)
      fail "$name" "must not be a localhost address"
      return
      ;;
  esac
  # A production URL must not carry credentials or a path.
  case "$value" in
    *"@"*)
      fail "$name" "must not contain credentials"
      return
      ;;
  esac
  case "$rest" in
    */*)
      case "${rest#*/}" in
        "" | \?* | "#"*) ;; # bare host with a trailing slash is fine
        *)
          warn "$name" "has a path; use the bare deployment origin"
          ;;
      esac
      ;;
  esac
  pass "$name" "https origin, not localhost"
}

echo
echo "Vercel environment preflight (names only; values are never printed)"
echo "------------------------------------------------------------------"

# --- Required at build and runtime ---------------------------------------
require DATABASE_URL "set the pooled Postgres URL (Neon/Supabase)"
check_public_url AUTH_URL
require AUTH_SECRET "generate with: openssl rand -base64 32"
check_public_url NEXT_PUBLIC_APP_URL
require JIOSAAVN_DES_KEY "required to decrypt playback URLs"

# --- Database shape ------------------------------------------------------
if is_set DATABASE_URL; then
  db_value=${DATABASE_URL}
  db_host=${db_value#*://}
  case "$db_host" in
    *@*) db_host=${db_host#*@} ;;
  esac
  db_host=${db_host%%/*}
  db_host=${db_host%%:*}
  db_host=$(printf '%s' "$db_host" | tr '[:upper:]' '[:lower:]')
  case "$db_host" in
    "" | localhost | 127.* | 0.0.0.0 | "::1" | "[::1]")
      fail "DATABASE_URL host" "points at localhost; Vercel cannot reach it"
      ;;
    *)
      pass "DATABASE_URL host" "not localhost"
      ;;
  esac
  case "$db_value" in
    *sslmode=require* | *sslmode=verify-ca* | *sslmode=verify-full*)
      pass "DATABASE_URL sslmode" "TLS required"
      ;;
    *)
      warn "DATABASE_URL sslmode" "add ?sslmode=require for managed Postgres"
      ;;
  esac
fi

# --- Auth aliases --------------------------------------------------------
if is_set BETTER_AUTH_URL; then
  check_public_url BETTER_AUTH_URL
else
  info BETTER_AUTH_URL "not set (AUTH_URL is used)"
fi
if is_set BETTER_AUTH_SECRET; then
  pass BETTER_AUTH_SECRET "set (overrides AUTH_SECRET in Better Auth)"
else
  info BETTER_AUTH_SECRET "not set (AUTH_SECRET is used)"
fi
if is_set AUTH_URL && is_set NEXT_PUBLIC_APP_URL; then
  auth_origin=${AUTH_URL%/}
  app_origin=${NEXT_PUBLIC_APP_URL%/}
  if [ "$auth_origin" = "$app_origin" ]; then
    pass "AUTH_URL / NEXT_PUBLIC_APP_URL" "same origin"
  else
    warn "AUTH_URL / NEXT_PUBLIC_APP_URL" "different origins; sign-in may be rejected"
  fi
fi
if is_set BETTER_AUTH_URL && is_set AUTH_URL; then
  if [ "${BETTER_AUTH_URL%/}" = "${AUTH_URL%/}" ]; then
    pass "BETTER_AUTH_URL / AUTH_URL" "same origin"
  else
    warn "BETTER_AUTH_URL / AUTH_URL" "BETTER_AUTH_URL wins; must match the public origin"
  fi
fi

# --- Demo mode and signer keys ------------------------------------------
if is_set SONATA_DEMO_MODE; then
  case "${SONATA_DEMO_MODE}" in
    true | false)
      pass SONATA_DEMO_MODE "valid ($SONATA_DEMO_MODE)"
      ;;
    *)
      fail SONATA_DEMO_MODE 'must be exactly "true" or "false"'
      ;;
  esac
else
  warn SONATA_DEMO_MODE 'not set; money mutations stay disabled (default false)'
fi

if [ "${SONATA_DEMO_MODE:-false}" = "true" ]; then
  require SONATA_DEMO_LISTENER_SECRET_KEY "required when SONATA_DEMO_MODE=true"
  require SONATA_DEMO_COLLECTOR_SECRET_KEY "required when SONATA_DEMO_MODE=true"
  require SONATA_ORACLE_SECRET_KEY "required when SONATA_DEMO_MODE=true"
  require SONATA_NADIA_SECRET_KEY "required when SONATA_DEMO_MODE=true"
  info "demo signer keys" "server-only; testnet accounts can spend testnet USDC"
else
  info "demo signer keys" "not required while demo mode is off"
fi

# --- Optional integration pairs -----------------------------------------
if is_set GOOGLE_CLIENT_ID || is_set GOOGLE_CLIENT_SECRET; then
  if is_set GOOGLE_CLIENT_ID && is_set GOOGLE_CLIENT_SECRET; then
    pass "GOOGLE_CLIENT_ID / SECRET" "both set"
  else
    warn "GOOGLE_CLIENT_ID / SECRET" "only one half set; Google sign-in stays hidden"
  fi
else
  info "GOOGLE_CLIENT_ID / SECRET" "not set (OAuth optional)"
fi
if is_set GITHUB_CLIENT_ID || is_set GITHUB_CLIENT_SECRET; then
  if is_set GITHUB_CLIENT_ID && is_set GITHUB_CLIENT_SECRET; then
    pass "GITHUB_CLIENT_ID / SECRET" "both set"
  else
    warn "GITHUB_CLIENT_ID / SECRET" "only one half set; GitHub sign-in stays hidden"
  fi
else
  info "GITHUB_CLIENT_ID / SECRET" "not set (OAuth optional)"
fi

if is_set RESEND_API_KEY && ! is_set EMAIL_FROM; then
  warn "EMAIL_FROM" "RESEND_API_KEY is set but EMAIL_FROM is missing"
elif is_set RESEND_API_KEY; then
  pass "RESEND_API_KEY / EMAIL_FROM" "both set"
else
  info "RESEND_API_KEY / EMAIL_FROM" "not set; password-reset mail cannot send"
fi

if [ "${ENABLE_RATE_LIMITING:-false}" = "true" ]; then
  require UPSTASH_REDIS_REST_URL "required when ENABLE_RATE_LIMITING=true"
  require UPSTASH_REDIS_REST_TOKEN "required when ENABLE_RATE_LIMITING=true"
  info TRUSTED_PROXY "Vercel is auto-detected; set TRUSTED_PROXY=vercel to pin it"
else
  info "ENABLE_RATE_LIMITING" "off; recommend true with Upstash in production"
fi

# --- Never ship a secret in a client-visible variable -------------------
exposed=""
for name in $(compgen -e); do
  case "$name" in
    NEXT_PUBLIC_*)
      case "$name" in
        *SECRET* | *PRIVATE* | *TOKEN* | *KEY*)
          exposed="$exposed $name"
          ;;
      esac
      ;;
  esac
done
if [ -n "$exposed" ]; then
  fail "client env exposure" "secret-like NEXT_PUBLIC_* names:$exposed"
else
  pass "client env exposure" "no secret-like NEXT_PUBLIC_* names"
fi

echo "------------------------------------------------------------------"
if [ "$fail_count" -eq 0 ]; then
  printf '%sPASS%s  %d check(s) passed, %d warning(s)\n' "$green" "$reset" "$pass_count" "$warn_count"
  printf '%s      ready for the Vercel env checklist. See ops/vercel.md.%s\n' "$dim" "$reset"
  exit 0
fi
printf '%sFAIL%s  %d failure(s), %d warning(s)\n' "$red" "$reset" "$fail_count" "$warn_count"
printf '%s      fix the FAIL rows above; never paste values into a ticket.%s\n' "$dim" "$reset"
exit 1
