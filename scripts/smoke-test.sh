#!/usr/bin/env bash
set -euo pipefail

# Usage:
# BOT_HEALTH_URL="https://<bot-url>/health" \
# VERIFY_BASE_URL="https://<verify-url>" \
# VERIFY_REF_ID="<referral-uuid>" \
# SUPABASE_URL="https://<project-ref>.supabase.co" \
# SUPABASE_SERVICE_ROLE_KEY="..." \
# bash scripts/smoke-test.sh

required_vars=(BOT_HEALTH_URL VERIFY_BASE_URL VERIFY_REF_ID SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY)
for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "[ERROR] Missing env var: $v"
    exit 1
  fi
done

echo "[1/4] Checking bot health endpoint..."
curl -fsS "$BOT_HEALTH_URL" >/dev/null

echo "[2/4] Checking public verify route..."
VERIFY_URL="${VERIFY_BASE_URL%/}/ref/${VERIFY_REF_ID}?lang=en"
HTML=$(curl -fsS "$VERIFY_URL")
if [[ "$HTML" != *"Referral Verification"* && "$HTML" != *"ផ្ទៀងផ្ទាត់ការណែនាំ"* ]]; then
  echo "[ERROR] Verify page did not return expected content"
  exit 1
fi

echo "[3/4] Triggering anchor-batch manually..."
ANCHOR_URL="${SUPABASE_URL%/}/functions/v1/anchor-batch"
curl -fsS -X POST "$ANCHOR_URL" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" >/tmp/letmein_anchor_response.json

cat /tmp/letmein_anchor_response.json

echo "[4/4] Completed smoke checks"
echo "Smoke test passed"
