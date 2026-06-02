#!/usr/bin/env bash
# Security smoke tests for gf-rental-api (post-hardening).
#
# Usage:
#   export API_BASE="http://localhost:3000/api"
#   export CUSTOMER_EMAIL="customer@example.com"
#   export CUSTOMER_PASSWORD="secret"
#   export ADMIN_EMAIL="admin@example.com"
#   export ADMIN_PASSWORD="secret"
#   # optional:
#   export CUSTOMER_B_EMAIL="other@example.com"
#   export CUSTOMER_B_PASSWORD="secret"
#   export CONTRACT_ID="42"
#   export CAR_ABO_ID="1"
#   ./scripts/smoke-security.sh
#
# Requirements: curl, jq (recommended)

set -uo pipefail

API_BASE="${API_BASE:-http://localhost:3000/api}"
API_BASE="${API_BASE%/}"

CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-}"
CUSTOMER_PASSWORD="${CUSTOMER_PASSWORD:-}"
CUSTOMER_B_EMAIL="${CUSTOMER_B_EMAIL:-}"
CUSTOMER_B_PASSWORD="${CUSTOMER_B_PASSWORD:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
CONTRACT_ID="${CONTRACT_ID:-}"
CAR_ABO_ID="${CAR_ABO_ID:-1}"

COOKIE_CUSTOMER="$(mktemp)"
COOKIE_CUSTOMER_B="$(mktemp)"
COOKIE_ADMIN="$(mktemp)"
TMP_BODY="$(mktemp)"
TMP_HEADERS="$(mktemp)"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

cleanup() {
  rm -f "$COOKIE_CUSTOMER" "$COOKIE_CUSTOMER_B" "$COOKIE_ADMIN" "$TMP_BODY" "$TMP_HEADERS"
}
trap cleanup EXIT

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo -e "${RED}Missing required command: $1${NC}" >&2
    exit 1
  fi
}

need_cmd curl
if ! command -v jq >/dev/null 2>&1; then
  echo -e "${YELLOW}Warning: jq not found – some checks will be limited.${NC}"
fi

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo -e "${GREEN}PASS${NC} $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo -e "${RED}FAIL${NC} $1"
  if [[ -n "${2:-}" ]]; then
    echo -e "      ${2}"
  fi
}

skip() {
  SKIP_COUNT=$((SKIP_COUNT + 1))
  echo -e "${YELLOW}SKIP${NC} $1"
}

http_request() {
  local method="$1"
  local url="$2"
  local cookie_jar="${3:-}"
  local data="${4:-}"

  local curl_args=(
    -sS
    -X "$method"
    -D "$TMP_HEADERS"
    -o "$TMP_BODY"
    -w "%{http_code}"
  )

  if [[ -n "$cookie_jar" ]]; then
    curl_args+=(-b "$cookie_jar" -c "$cookie_jar")
  fi

  if [[ -n "$data" ]]; then
    curl_args+=(-H "Content-Type: application/json" -d "$data")
  fi

  curl_args+=("$url")
  curl "${curl_args[@]}"
}

expect_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"

  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
    return 0
  fi
  fail "$label (expected HTTP $expected, got $actual)" "$(head -c 200 "$TMP_BODY" 2>/dev/null || true)"
  return 1
}

expect_status_one_of() {
  local label="$1"
  local actual="$2"
  shift 2
  for code in "$@"; do
    if [[ "$actual" == "$code" ]]; then
      pass "$label (HTTP $actual)"
      return 0
    fi
  done
  fail "$label (expected one of: $*, got $actual)" "$(head -c 200 "$TMP_BODY" 2>/dev/null || true)"
  return 1
}

body_must_not_contain() {
  local label="$1"
  local pattern="$2"
  if grep -qiE "$pattern" "$TMP_BODY" 2>/dev/null; then
    fail "$label (response leaked: /$pattern/)" "$(head -c 200 "$TMP_BODY" 2>/dev/null || true)"
    return 1
  fi
  pass "$label (no /$pattern/ in body)"
}

header_must_contain() {
  local label="$1"
  local pattern="$2"
  if grep -qi "$pattern" "$TMP_HEADERS" 2>/dev/null; then
    pass "$label"
    return 0
  fi
  fail "$label (Set-Cookie not found)" "$(grep -i '^set-cookie' "$TMP_HEADERS" 2>/dev/null | head -3 || true)"
  return 1
}

login() {
  local email="$1"
  local password="$2"
  local cookie_jar="$3"
  local role_label="$4"

  if [[ -z "$email" || -z "$password" ]]; then
    skip "$role_label login (credentials not set)"
    return 2
  fi

  : >"$cookie_jar"
  local payload
  payload=$(printf '{"email":"%s","password":"%s"}' "$email" "$password")

  local status
  status=$(http_request POST "$API_BASE/auth/login" "$cookie_jar" "$payload")

  if [[ "$status" == "200" ]]; then
    if command -v jq >/dev/null 2>&1; then
      if jq -e '.mfaRequired == true' "$TMP_BODY" >/dev/null 2>&1; then
        fail "$role_label login (MFA required – use account without MFA or complete MFA flow manually)"
        return 1
      fi
    fi
    pass "$role_label login (HTTP 200)"
    return 0
  fi

  fail "$role_label login (HTTP $status)" "$(head -c 200 "$TMP_BODY" 2>/dev/null || true)"
  return 1
}

contract_ids_from_body() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.contracts[]?.id // .contracts[]?.userId // empty' "$TMP_BODY" 2>/dev/null | sort -u
  else
    grep -oE '"id":[0-9]+' "$TMP_BODY" | sed 's/"id"://' | sort -u
  fi
}

echo -e "${CYAN}=== gf-rental-api security smoke tests ===${NC}"
echo "API_BASE=$API_BASE"
echo ""

# --- 1) Customer login + session cookie ---
if login "$CUSTOMER_EMAIL" "$CUSTOMER_PASSWORD" "$COOKIE_CUSTOMER" "Customer"; then
  status=$(http_request GET "$API_BASE/auth/me" "$COOKIE_CUSTOMER")
  expect_status "GET /auth/me with session" "200" "$status"

  status=$(http_request POST "$API_BASE/auth/login" "$COOKIE_CUSTOMER" \
    "$(printf '{"email":"%s","password":"%s"}' "$CUSTOMER_EMAIL" "$CUSTOMER_PASSWORD")")
  header_must_contain "Login sets HttpOnly session cookie" "gf_crm_session" || true
  if grep -qi 'httponly' "$TMP_HEADERS" 2>/dev/null; then
    pass "Session cookie has HttpOnly flag"
  else
    fail "Session cookie missing HttpOnly flag"
  fi
fi

# --- 2) BOLA: contracts scoped to own user ---
if [[ -s "$COOKIE_CUSTOMER" ]]; then
  status=$(http_request GET "$API_BASE/contracts" "$COOKIE_CUSTOMER")
  if expect_status "GET /contracts as customer" "201" "$status" || expect_status_one_of "GET /contracts as customer" "$status" "200" "201"; then
    CUSTOMER_CONTRACT_SNAPSHOT="$(mktemp)"
    cp "$TMP_BODY" "$CUSTOMER_CONTRACT_SNAPSHOT"

    if command -v jq >/dev/null 2>&1; then
      foreign_users=$(jq '[.contracts[]? | select(.userId != null)] | map(.userId) | unique | length' "$TMP_BODY" 2>/dev/null || echo "0")
      if [[ "${foreign_users:-0}" -le 1 ]]; then
        pass "Contract list appears scoped (<=1 distinct userId in payload)"
      else
        fail "Contract list may expose multiple userIds ($foreign_users distinct)"
      fi
    fi
    rm -f "$CUSTOMER_CONTRACT_SNAPSHOT"
  fi
fi

# --- 3) Role gates (customer must be denied) ---
if [[ -s "$COOKIE_CUSTOMER" ]]; then
  status=$(http_request GET "$API_BASE/admin/feedback/surveys" "$COOKIE_CUSTOMER")
  expect_status_one_of "GET /admin/feedback/surveys as customer" "$status" "403" "401"

  status=$(http_request GET "$API_BASE/crm/customers" "$COOKIE_CUSTOMER")
  expect_status_one_of "GET /crm/customers as customer" "$status" "403" "401"

  status=$(http_request PATCH "$API_BASE/crm/customers/1" "$COOKIE_CUSTOMER" '{"firstName":"probe"}')
  expect_status_one_of "PATCH /crm/customers/:id as customer" "$status" "403" "401"

  status=$(http_request PATCH "$API_BASE/car-abos/${CAR_ABO_ID}" "$COOKIE_CUSTOMER" '{"displayName":"tamper"}')
  expect_status_one_of "PATCH /car-abos/:id as customer" "$status" "403" "401"

  status=$(http_request DELETE "$API_BASE/car-abos/${CAR_ABO_ID}" "$COOKIE_CUSTOMER")
  expect_status_one_of "DELETE /car-abos/:id as customer" "$status" "403" "401"
fi

# --- 4) Cross-customer isolation (optional second account) ---
if [[ -s "$COOKIE_CUSTOMER" ]] && [[ -n "$CUSTOMER_B_EMAIL" ]] && [[ -n "$CUSTOMER_B_PASSWORD" ]]; then
  if login "$CUSTOMER_B_EMAIL" "$CUSTOMER_B_PASSWORD" "$COOKIE_CUSTOMER_B" "Customer B"; then
    http_request GET "$API_BASE/contracts" "$COOKIE_CUSTOMER" >/dev/null
    IDS_A="$(contract_ids_from_body)"
    http_request GET "$API_BASE/contracts" "$COOKIE_CUSTOMER_B" >/dev/null
    IDS_B="$(contract_ids_from_body)"

    if [[ -n "$IDS_A" && -n "$IDS_B" ]]; then
      overlap=$(comm -12 <(echo "$IDS_A") <(echo "$IDS_B") | wc -l | tr -d ' ')
      if [[ "$overlap" == "0" ]]; then
        pass "Customer A/B contract IDs do not overlap"
      else
        fail "Customer A/B contract IDs overlap ($overlap shared id(s))"
      fi
    else
      skip "Customer A/B overlap check (empty contract lists)"
    fi
  fi
fi

# --- 5) Admin access ---
if login "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$COOKIE_ADMIN" "Admin"; then
  status=$(http_request GET "$API_BASE/admin/feedback/surveys" "$COOKIE_ADMIN")
  expect_status "GET /admin/feedback/surveys as admin" "200" "$status"
fi

# --- 6) Share link: TTL metadata, one-time use, revoke ---
if [[ -s "$COOKIE_ADMIN" && -n "$CONTRACT_ID" ]]; then
  status=$(http_request POST "$API_BASE/contracts/${CONTRACT_ID}/share-link" "$COOKIE_ADMIN")
  if expect_status_one_of "POST /contracts/:id/share-link" "$status" "201" "200"; then
    if command -v jq >/dev/null 2>&1; then
      share_url=$(jq -r '.shareUrl // empty' "$TMP_BODY")
      share_expires=$(jq -r '.shareExpiresAt // empty' "$TMP_BODY")
      if [[ -n "$share_expires" ]]; then
        pass "Share link returns shareExpiresAt"
      else
        fail "Share link missing shareExpiresAt"
      fi
    else
      share_url=$(grep -oE 'https?://[^"]+' "$TMP_BODY" | head -1 || true)
    fi

    if [[ -n "${share_url:-}" ]]; then
      first_status=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" "$share_url")
      if [[ "$first_status" == "200" ]]; then
        pass "First share-link access returns PDF (HTTP 200)"
      else
        fail "First share-link access (expected 200, got $first_status)"
      fi

      second_status=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" "$share_url")
      expect_status_one_of "Second share-link access (one-time)" "$second_status" "401" "410" "403" "404"

      status=$(http_request POST "$API_BASE/contracts/${CONTRACT_ID}/share-link/revoke" "$COOKIE_ADMIN")
      expect_status_one_of "POST /contracts/:id/share-link/revoke" "$status" "200" "201"

      third_status=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" "$share_url")
      expect_status_one_of "Share-link after revoke" "$third_status" "401" "410" "403" "404"
    else
      fail "Could not parse shareUrl from response"
    fi
  fi
else
  skip "Share-link tests (set ADMIN_* and CONTRACT_ID)"
fi

# --- 7) Error disclosure ---
if [[ -s "$COOKIE_CUSTOMER" ]]; then
  status=$(http_request GET "$API_BASE/contracts/view/not-a-real-contract-file.pdf" "$COOKIE_CUSTOMER")
  expect_status_one_of "GET invalid contract file" "$status" "404" "403" "500"
  body_must_not_contain "No internal stack in error body" "at\\s+\\w+\\(|sequelize|ECONNREFUSED|Error:\\s"
fi

# --- 8) Logout invalidates session ---
if [[ -s "$COOKIE_CUSTOMER" ]]; then
  status=$(http_request POST "$API_BASE/auth/logout" "$COOKIE_CUSTOMER")
  expect_status_one_of "POST /auth/logout" "$status" "200" "201"

  status=$(http_request GET "$API_BASE/auth/me" "$COOKIE_CUSTOMER")
  expect_status_one_of "GET /auth/me after logout" "$status" "401" "403"
fi

echo ""
echo -e "${CYAN}=== Summary ===${NC}"
echo -e "${GREEN}Passed:${NC}  $PASS_COUNT"
echo -e "${RED}Failed:${NC}  $FAIL_COUNT"
echo -e "${YELLOW}Skipped:${NC} $SKIP_COUNT"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
