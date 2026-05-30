#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env
require TARGET_SUPABASE_DB_URL

log "Restoring data to target (triggers disabled during load)"
psql "$TARGET_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$RUN_DIR/data.sql"
log "Data restore OK"
*** End Patch