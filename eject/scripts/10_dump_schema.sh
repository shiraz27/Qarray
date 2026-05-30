#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env

OUT="$RUN_DIR/schema.sql"
log "Dumping schema to $OUT"

# --schema=public covers our app. We also dump enums (auth.app_role, etc. are in public).
# --no-owner / --no-privileges keeps it portable; we re-emit GRANTs explicitly below.
pg_dump "$SOURCE_SUPABASE_DB_URL" \
  --schema=public \
  --schema-only \
  --no-owner --no-privileges \
  --no-publications --no-subscriptions \
  -f "$OUT"

# Append GRANTs (pg_dump drops them with --no-privileges). PostgREST roles must
# regain access on the target or the Data API returns permission errors.
log "Appending GRANTs"
psql "$SOURCE_SUPABASE_DB_URL" -tAF $'\t' <<'SQL' >> "$OUT"
SELECT format(
  E'GRANT %s ON public.%I TO %I;',
  string_agg(privilege_type, ', '),
  table_name, grantee
)
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon','authenticated','service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
SQL

log "Schema dump: $(wc -l < "$OUT") lines"
*** End Patch