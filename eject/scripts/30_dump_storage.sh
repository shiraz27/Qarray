#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

OUT_DIR="$RUN_DIR/storage"
mkdir -p "$OUT_DIR"

BUCKETS_JSON=$(curl -fsS \
  -H "apikey: $SOURCE_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SOURCE_SUPABASE_SERVICE_ROLE_KEY" \
  "$SOURCE_SUPABASE_URL/storage/v1/bucket")

COUNT=$(echo "$BUCKETS_JSON" | jq 'length')
log "Found $COUNT storage bucket(s)"

if [[ "$COUNT" -eq 0 ]]; then
  log "Nothing to dump"; exit 0
fi

echo "$BUCKETS_JSON" > "$OUT_DIR/_buckets.json"

echo "$BUCKETS_JSON" | jq -r '.[].name' | while read -r bucket; do
  log "Dumping bucket: $bucket"
  mkdir -p "$OUT_DIR/$bucket"
  # Recursive listing via list endpoint (paginated)
  OFFSET=0; LIMIT=1000
  while :; do
    PAGE=$(curl -fsS -X POST \
      -H "apikey: $SOURCE_SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SOURCE_SUPABASE_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      "$SOURCE_SUPABASE_URL/storage/v1/object/list/$bucket" \
      -d "{\"limit\":$LIMIT,\"offset\":$OFFSET,\"prefix\":\"\"}")
    LEN=$(echo "$PAGE" | jq 'length')
    [[ "$LEN" == "0" ]] && break
    echo "$PAGE" | jq -r '.[].name' | while read -r object; do
      mkdir -p "$OUT_DIR/$bucket/$(dirname "$object")"
      curl -fsS \
        -H "apikey: $SOURCE_SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SOURCE_SUPABASE_SERVICE_ROLE_KEY" \
        "$SOURCE_SUPABASE_URL/storage/v1/object/$bucket/$object" \
        -o "$OUT_DIR/$bucket/$object"
    done
    OFFSET=$((OFFSET + LEN))
    [[ "$LEN" -lt "$LIMIT" ]] && break
  done
done
log "Storage dump complete"
*** End Patch