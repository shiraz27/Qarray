#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

if [[ "$TARGET" != "cloud" ]]; then
  warn "Self-hosted target — auth config is in docker-compose .env, skipping"
  exit 0
fi
require SUPABASE_ACCESS_TOKEN SOURCE_SUPABASE_PROJECT_REF TARGET_SUPABASE_PROJECT_REF

log "Cloning auth config (settings + email templates + redirect URLs)"
CFG=$(mgmt_api GET "/v1/projects/$SOURCE_SUPABASE_PROJECT_REF/config/auth")
echo "$CFG" > "$RUN_DIR/auth_config.json"

# PATCH the same payload onto the target. The Management API ignores fields
# it can't accept (provider secrets aren't returned by GET, so they stay blank
# on the target — you must re-enter Google OAuth client secret manually).
mgmt_api PATCH "/v1/projects/$TARGET_SUPABASE_PROJECT_REF/config/auth" -d "$CFG" >/dev/null
log "Auth config cloned. Re-enter OAuth provider SECRETS manually in dashboard."
*** End Patch