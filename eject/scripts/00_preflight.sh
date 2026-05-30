#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

log "Checking CLIs"
for c in psql pg_dump curl jq node; do
  have "$c" || die "Missing CLI: $c"
done
have supabase || warn "supabase CLI not installed — needed for edge fn deploy (phase 73). Install: https://supabase.com/docs/guides/cli"

log "Source credentials"
require SOURCE_SUPABASE_URL SOURCE_SUPABASE_PROJECT_REF SOURCE_SUPABASE_SERVICE_ROLE_KEY SOURCE_SUPABASE_DB_URL

log "Verifying source DB reachable"
psql "$SOURCE_SUPABASE_DB_URL" -tAc "select 'ok'" >/dev/null || die "Cannot connect to SOURCE_SUPABASE_DB_URL"

log "Verifying source admin API reachable"
auth_admin "$SOURCE_SUPABASE_URL" "$SOURCE_SUPABASE_SERVICE_ROLE_KEY" GET "/auth/v1/admin/users?per_page=1" >/dev/null \
  || die "Source service role key invalid"

if [[ "$TARGET" == "cloud" ]]; then
  require SUPABASE_ACCESS_TOKEN TARGET_ORG_ID TARGET_PROJECT_NAME TARGET_REGION TARGET_DB_PASSWORD
  log "Verifying Management API token"
  mgmt_api GET "/v1/organizations" | jq -e --arg id "$TARGET_ORG_ID" '.[] | select(.id==$id)' >/dev/null \
    || die "TARGET_ORG_ID not visible to SUPABASE_ACCESS_TOKEN"
else
  require SELF_HOSTED_HOST SELF_HOSTED_DB_PASSWORD
  have docker || die "docker required for --target=self-hosted"
fi

log "Preflight OK"
*** End Patch