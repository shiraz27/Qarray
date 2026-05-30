#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.eject"

if [[ -n "${TARGET_SUPABASE_PROJECT_REF:-}" ]]; then
  log "Reusing existing target: $TARGET_SUPABASE_PROJECT_REF"
else
  log "Creating new Supabase project: $TARGET_PROJECT_NAME ($TARGET_REGION)"
  RESP=$(mgmt_api POST "/v1/projects" -d "$(jq -n \
    --arg name "$TARGET_PROJECT_NAME" \
    --arg org "$TARGET_ORG_ID" \
    --arg region "$TARGET_REGION" \
    --arg pwd "$TARGET_DB_PASSWORD" \
    '{name:$name, organization_id:$org, region:$region, db_pass:$pwd, plan:"free"}')")
  REF=$(echo "$RESP" | jq -r '.id')
  [[ "$REF" != "null" && -n "$REF" ]] || die "Project create failed: $RESP"
  log "Created project ref: $REF"

  log "Waiting for ACTIVE_HEALTHY (this takes 1-2 minutes)"
  for i in $(seq 1 60); do
    STATUS=$(mgmt_api GET "/v1/projects/$REF" | jq -r '.status')
    [[ "$STATUS" == "ACTIVE_HEALTHY" ]] && break
    log "  status=$STATUS (attempt $i/60)"
    sleep 5
  done
  [[ "$STATUS" == "ACTIVE_HEALTHY" ]] || die "Project did not reach ACTIVE_HEALTHY"

  TARGET_SUPABASE_PROJECT_REF="$REF"
  TARGET_SUPABASE_URL="https://${REF}.supabase.co"

  KEYS=$(mgmt_api GET "/v1/projects/$REF/api-keys")
  TARGET_SUPABASE_ANON_KEY=$(echo "$KEYS" | jq -r '.[] | select(.name=="anon") | .api_key')
  TARGET_SUPABASE_SERVICE_ROLE_KEY=$(echo "$KEYS" | jq -r '.[] | select(.name=="service_role") | .api_key')
  TARGET_SUPABASE_DB_URL="postgres://postgres:${TARGET_DB_PASSWORD}@db.${REF}.supabase.co:5432/postgres"

  # Persist back to .env.eject so resumes work.
  log "Persisting target credentials to $ENV_FILE"
  for var in TARGET_SUPABASE_PROJECT_REF TARGET_SUPABASE_URL TARGET_SUPABASE_ANON_KEY TARGET_SUPABASE_SERVICE_ROLE_KEY TARGET_SUPABASE_DB_URL; do
    if grep -q "^${var}=" "$ENV_FILE"; then
      sed -i.bak "s|^${var}=.*|${var}=\"${!var}\"|" "$ENV_FILE"
    else
      echo "${var}=\"${!var}\"" >> "$ENV_FILE"
    fi
  done
  rm -f "${ENV_FILE}.bak"
fi

log "Provision complete."
*** End Patch