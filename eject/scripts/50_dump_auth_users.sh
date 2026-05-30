#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

OUT="$RUN_DIR/auth_users.json"
log "Dumping auth users + bcrypt hashes to $OUT"

# Dump from auth.users directly so we get encrypted_password (the bcrypt hash).
# The Admin API does NOT expose hashes, but the Admin Create endpoint accepts a
# raw `password_hash` field on insert. We pair the two: JSON metadata from the
# API + hash from SQL, joined on id.
psql "$SOURCE_SUPABASE_DB_URL" -tAc "
  SELECT json_agg(json_build_object(
    'id', id,
    'email', email,
    'phone', phone,
    'email_confirmed_at', email_confirmed_at,
    'phone_confirmed_at', phone_confirmed_at,
    'last_sign_in_at', last_sign_in_at,
    'raw_user_meta_data', raw_user_meta_data,
    'raw_app_meta_data', raw_app_meta_data,
    'created_at', created_at,
    'password_hash', encrypted_password,
    'is_sso_user', is_sso_user,
    'banned_until', banned_until
  )) FROM auth.users
" > "$OUT"

COUNT=$(jq 'length' "$OUT")
log "Dumped $COUNT users (passwords preserved as bcrypt hashes)"

# Also dump identities (OAuth links). Used by 72_restore_auth_users.sh.
psql "$SOURCE_SUPABASE_DB_URL" -tAc "
  SELECT json_agg(row_to_json(i)) FROM auth.identities i
" > "$RUN_DIR/auth_identities.json"

IDS=$(jq 'length // 0' "$RUN_DIR/auth_identities.json")
log "Dumped $IDS identity rows"
*** End Patch