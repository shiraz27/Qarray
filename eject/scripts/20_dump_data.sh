#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

OUT="$RUN_DIR/data.sql"
log "Dumping public-schema data to $OUT"

# COPY-format = fast; --disable-triggers prevents our cleanup triggers from
# nuking rows during restore (they fire on UPDATE only, but be safe).
pg_dump "$SOURCE_SUPABASE_DB_URL" \
  --schema=public \
  --data-only \
  --disable-triggers \
  --no-owner --no-privileges \
  -f "$OUT"

log "Data dump: $(du -h "$OUT" | cut -f1)"
*** End Patch