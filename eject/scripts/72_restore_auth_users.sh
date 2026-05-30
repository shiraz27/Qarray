#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env
require TARGET_SUPABASE_URL TARGET_SUPABASE_SERVICE_ROLE_KEY

IN="$RUN_DIR/auth_users.json"
[[ -f "$IN" ]] || die "Missing $IN — rerun phase 50"

TOTAL=$(jq 'length' "$IN")
log "Restoring $TOTAL auth users with preserved bcrypt password hashes"

# Admin Create accepts `password_hash` — users keep their existing passwords.
# We POST one at a time so a single bad row doesn't kill the batch.
jq -c '.[]' "$IN" | nl -ba | while read -r idx row; do
  EMAIL=$(echo "$row" | jq -r '.email // empty')
  # Build payload: only fields the admin endpoint accepts.
  PAYLOAD=$(echo "$row" | jq '{
    id, email, phone,
    password_hash,
    email_confirm: (.email_confirmed_at != null),
    phone_confirm: (.phone_confirmed_at != null),
    user_metadata: .raw_user_meta_data,
    app_metadata:  .raw_app_meta_data,
    banned_until
  } | with_entries(select(.value != null))')

  HTTP=$(curl -s -o /tmp/eject_user_resp -w "%{http_code}" -X POST \
    -H "apikey: $TARGET_SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $TARGET_SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    "$TARGET_SUPABASE_URL/auth/v1/admin/users" \
    -d "$PAYLOAD")
  if [[ "$HTTP" =~ ^2 ]]; then
    printf '\r  [%d/%d] %s OK   ' "$idx" "$TOTAL" "$EMAIL"
  else
    printf '\n  [%d/%d] %s FAIL %s: %s\n' "$idx" "$TOTAL" "$EMAIL" "$HTTP" "$(cat /tmp/eject_user_resp)" >&2
  fi
done
echo

# Restore OAuth identities (Google, etc.) directly into auth.identities.
IDS_IN="$RUN_DIR/auth_identities.json"
if [[ -f "$IDS_IN" && "$(jq 'length // 0' "$IDS_IN")" -gt 0 ]]; then
  log "Restoring OAuth identities via direct SQL"
  jq -c '.[]' "$IDS_IN" | while read -r row; do
    psql "$TARGET_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, email)
      VALUES (
        $(echo "$row" | jq '.provider_id'),
        $(echo "$row" | jq '.user_id'),
        $(echo "$row" | jq '.identity_data')::jsonb,
        $(echo "$row" | jq '.provider'),
        $(echo "$row" | jq '.last_sign_in_at'),
        $(echo "$row" | jq '.created_at'),
        $(echo "$row" | jq '.updated_at'),
        $(echo "$row" | jq '.email')
      ) ON CONFLICT DO NOTHING;
    " >/dev/null
  done
fi
log "Auth restore complete"
*** End Patch