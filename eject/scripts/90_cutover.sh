#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_lib.sh"; load_env
require TARGET_SUPABASE_URL TARGET_SUPABASE_ANON_KEY TARGET_SUPABASE_SERVICE_ROLE_KEY TARGET_SUPABASE_DB_URL

log "Smoke tests on target"

# 1. Anon REST reachable
curl -fsS -H "apikey: $TARGET_SUPABASE_ANON_KEY" "$TARGET_SUPABASE_URL/rest/v1/" >/dev/null \
  && log "  ✓ REST endpoint reachable"

# 2. Row counts match per public table
log "  Comparing row counts source vs target:"
while IFS=$'\t' read -r tbl; do
  S=$(psql "$SOURCE_SUPABASE_DB_URL" -tAc "select count(*) from public.\"$tbl\"")
  T=$(psql "$TARGET_SUPABASE_DB_URL" -tAc "select count(*) from public.\"$tbl\"")
  if [[ "$S" == "$T" ]]; then
    printf '    ✓ %-40s %s\n' "$tbl" "$S"
  else
    printf '    ✗ %-40s source=%s target=%s\n' "$tbl" "$S" "$T" >&2
  fi
done < <(psql "$SOURCE_SUPABASE_DB_URL" -tAc "select tablename from pg_tables where schemaname='public' order by 1")

# 3. Auth user count match
SU=$(psql "$SOURCE_SUPABASE_DB_URL" -tAc "select count(*) from auth.users")
TU=$(psql "$TARGET_SUPABASE_DB_URL" -tAc "select count(*) from auth.users")
log "  auth.users source=$SU target=$TU $([ "$SU" == "$TU" ] && echo ✓ || echo ✗)"

cat <<EOF

======================================================================
CUTOVER CHECKLIST — do these manually, in order:
======================================================================
 1. Pick a brief maintenance window (5-15 min).
 2. Re-run phases 20, 50 to capture any new rows/users since the dump:
      bash eject/eject.sh --target=$TARGET --from=20
    (This re-dumps data + auth_users and re-restores them.)
 3. Hard-refresh the app — the new .env points at the target.
 4. Log in as a real user and confirm:
      - existing password works (hash-preserving migration)
      - Google sign-in works (after re-pasting OAuth secret in the new
        project dashboard — Management API does not transfer it)
      - one query that uses an edge function returns data
 5. In Lovable: Connectors -> Lovable Cloud -> Disable Cloud.
 6. Commit the patched .env, remove eject/.env.eject from disk.
======================================================================
EOF
*** End Patch